/** Wire request builder and retry loop for Responses V2 native compaction. */

import { normalizeContext, resolveTranscript, resolveTranscriptTools } from '@earendil-works/pi-ai'
import type { Api, Model, SimpleStreamOptions, TranscriptContext } from '@earendil-works/pi-ai'
import { convertResponsesMessages, convertResponsesTools, getResponsesToolSupport } from '@earendil-works/pi-ai/api/openai-responses-shared'
import { prepareOpenAICodexBackendHeaders, readRetryAfterMs } from '../../platform/http/backend-policy.ts'
import {
  expandScopedInput,
  isRecord,
  OPENAI_CODEX_NATIVE_COMPACTION_URL,
  retainedNativeCompactionInput,
  type JsonRecord,
  type NativeCompactionScope,
} from './checkpoint.ts'
import { parseCompactResponse, type CompactResponse } from './sse-parser.ts'

const CODEX_TOOL_CALL_PROVIDERS = new Set(['openai', 'openai-codex', 'opencode'])
const MAX_NATIVE_COMPACTION_RETRIES = 2

function responseHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {}
  headers.forEach((value, key) => { result[key] = value })
  return result
}

function requestSignal(signal: AbortSignal | undefined, timeoutMs: number | undefined): AbortSignal | undefined {
  if (timeoutMs === undefined || timeoutMs <= 0) return signal
  const timeout = AbortSignal.timeout(timeoutMs)
  return signal === undefined ? timeout : AbortSignal.any([signal, timeout])
}

function retryDelayMs(response: Response, attempt: number): number {
  const retry = readRetryAfterMs(response.headers)
  return retry !== undefined && Number.isFinite(retry) ? retry : Math.min(4_000, 500 * 2 ** attempt)
}

function retryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504
}

async function waitForRetry(delay: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    if (signal === undefined) { setTimeout(resolve, delay); return }
    if (signal.aborted) { reject(signal.reason); return }
    const onAbort = (): void => { clearTimeout(timeout); reject(signal.reason) }
    const timeout = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve() }, delay)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function accountIdFromToken(access: string): string {
  try {
    const parts = access.split('.')
    if (parts.length !== 3 || parts[1] === undefined) throw new Error('invalid JWT')
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as JsonRecord
    const auth = payload['https://api.openai.com/auth']
    if (!isRecord(auth)) throw new Error('missing auth claim')
    const accountId = auth['chatgpt_account_id']
    if (typeof accountId !== 'string' || accountId.length === 0) throw new Error('missing account id')
    return accountId
  } catch (error: unknown) {
    throw new Error('OpenAI Codex native compaction credential has no usable account id', { cause: error })
  }
}

export async function requestNativeCompaction(
  model: Model<Api>,
  context: TranscriptContext,
  options: SimpleStreamOptions | undefined,
  scope: NativeCompactionScope,
): Promise<CompactResponse> {
  const access = options?.apiKey
  if (access === undefined || access.length === 0) throw new Error('OpenAI Codex native compaction request has no OAuth token')
  if (context.messages.length === 0) throw new Error('OpenAI Codex native compaction request has no summarization instruction to remove')
  const messages = context.messages.slice(0, -1)
  const compat = model.compat as {
    supportsStrictMode?: boolean
    supportsOpenAIGrammarTools?: boolean
    supportsMidConvoSystemMessages?: boolean
    supportsAdditionalTools?: boolean
    supportsToolSearch?: boolean
  } | undefined
  const supportsStrictMode = compat?.supportsStrictMode ?? true
  const supportsOpenAIGrammarTools = compat?.supportsOpenAIGrammarTools ?? false
  const supportsMidConvoSystemMessages = compat?.supportsMidConvoSystemMessages ?? false
  const supportsAdditionalTools = compat?.supportsAdditionalTools ?? false
  const supportsToolSearch = compat?.supportsToolSearch ?? false

  const resolvedContext = resolveTranscript(normalizeContext({ messages }), supportsMidConvoSystemMessages)
  const transcriptTools = resolveTranscriptTools(resolvedContext.messages, getResponsesToolSupport({
    supportsMidConvoSystemMessages, supportsAdditionalTools, supportsToolSearch,
  }))
  const converted = convertResponsesMessages(model, resolvedContext, CODEX_TOOL_CALL_PROVIDERS, {
    supportsMidConvoSystemMessages, supportsAdditionalTools, supportsToolSearch,
    toolOptions: { strict: null, supportsStrictMode, supportsOpenAIGrammarTools },
  })
  const input = expandScopedInput(converted, scope)
  const retained = retainedNativeCompactionInput(input)
  const tools = transcriptTools.requestTools.length === 0
    ? undefined
    : convertResponsesTools(transcriptTools.requestTools, { strict: null, supportsStrictMode, supportsOpenAIGrammarTools })
  const mappedEffort = options?.reasoning === undefined ? undefined : model.thinkingLevelMap?.[options.reasoning] ?? options.reasoning

  let body: unknown = {
    model: model.id,
    store: false,
    stream: true,
    input: [...input, { type: 'compaction_trigger' }],
    ...(tools === undefined ? {} : { tools }),
    tool_choice: 'auto',
    parallel_tool_calls: true,
    include: ['reasoning.encrypted_content'],
    ...(mappedEffort === undefined || mappedEffort === null ? {} : { reasoning: { effort: mappedEffort, summary: 'auto' } }),
    ...(options?.sessionId === undefined ? {} : { prompt_cache_key: options.sessionId }),
    text: { verbosity: 'low' },
  }
  if (options?.onPayload !== undefined) body = await options.onPayload(body, model) ?? body
  if (!isRecord(body)) throw new Error('OpenAI Codex generated a non-object native compaction payload')

  const headers = new Headers(model.headers)
  for (const [key, value] of Object.entries(options?.headers ?? {})) {
    if (value === null) headers.delete(key)
    else headers.set(key, value)
  }
  headers.set('authorization', `Bearer ${access}`)
  headers.set('chatgpt-account-id', accountIdFromToken(access))
  headers.set('accept', 'text/event-stream')
  headers.set('content-type', 'application/json')
  headers.set('openai-beta', 'responses=experimental')
  if (options?.sessionId !== undefined) {
    headers.set('session-id', options.sessionId)
    headers.set('thread-id', options.sessionId)
  }
  headers.set('x-codex-routing-hint', `model=${model.id}`)

  const maxRetries = Math.min(MAX_NATIVE_COMPACTION_RETRIES, Math.max(0, options?.maxRetries ?? MAX_NATIVE_COMPACTION_RETRIES))
  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    let response: Response
    try {
      const signal = requestSignal(options?.signal, options?.timeoutMs)
      const preparedHeaders = prepareOpenAICodexBackendHeaders(headers, 'plugin').headers
      response = await (options?.fetch ?? globalThis.fetch)(OPENAI_CODEX_NATIVE_COMPACTION_URL, {
        method: 'POST', headers: preparedHeaders, redirect: 'error', body: JSON.stringify(body),
        ...(signal === undefined ? {} : { signal }),
      })
    } catch (error: unknown) {
      if (options?.signal?.aborted === true || attempt === maxRetries) throw error
      lastError = error
      await waitForRetry(Math.min(4_000, 500 * 2 ** attempt), options?.signal)
      continue
    }
    await options?.onResponse?.({ status: response.status, headers: responseHeaders(response.headers) }, model)
    if (response.ok) return parseCompactResponse(response, retained)
    const error = new Error(`OpenAI Codex native compaction request failed with HTTP ${response.status}`)
    await response.body?.cancel()
    if (!retryableStatus(response.status) || attempt === maxRetries) throw error
    lastError = error
    await waitForRetry(retryDelayMs(response, attempt), options?.signal)
  }
  throw lastError instanceof Error ? lastError : new Error('OpenAI Codex native compaction request failed')
}
