/** SSE parsing and synthetic assistant stream emission for native compaction responses. */

import { createAssistantMessageEventStream } from '@earendil-works/pi-ai'
import type { Api, AssistantMessage, AssistantMessageEventStream, Model, Usage } from '@earendil-works/pi-ai'
import {
  encodeNativeCompactionCheckpoint,
  isRecord,
  OPENAI_CODEX_NATIVE_COMPACTION_MAX_CHECKPOINT_BYTES,
  type JsonRecord,
} from './checkpoint.ts'

export interface CompactResponse {
  readonly id?: string
  readonly output: readonly unknown[]
  readonly usage?: JsonRecord
}

function usageNumber(record: JsonRecord | undefined, key: string): number {
  const value = record?.[key]
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

function emptyUsage(): Usage {
  return {
    input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  }
}

function compactUsage(raw: JsonRecord | undefined): Usage {
  if (raw === undefined) return emptyUsage()
  const inputDetails = isRecord(raw['input_tokens_details']) ? raw['input_tokens_details'] : undefined
  const outputDetails = isRecord(raw['output_tokens_details']) ? raw['output_tokens_details'] : undefined
  const inputTokens = usageNumber(raw, 'input_tokens')
  const cacheRead = usageNumber(inputDetails, 'cached_tokens')
  const cacheWrite = usageNumber(inputDetails, 'cache_write_tokens')
  return {
    input: Math.max(0, inputTokens - cacheRead - cacheWrite),
    output: usageNumber(raw, 'output_tokens'),
    cacheRead,
    cacheWrite,
    reasoning: usageNumber(outputDetails, 'reasoning_tokens'),
    totalTokens: usageNumber(raw, 'total_tokens'),
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  }
}

export function markerStream(model: Model<Api>, response: CompactResponse): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream()
  const text = encodeNativeCompactionCheckpoint(response.output)
  const partial: AssistantMessage = {
    role: 'assistant',
    content: [],
    api: 'openai-codex-responses',
    provider: model.provider,
    model: model.id,
    ...(response.id === undefined ? {} : { responseId: response.id }),
    usage: compactUsage(response.usage),
    stopReason: 'stop',
    timestamp: Date.now(),
  }
  queueMicrotask(() => {
    stream.push({ type: 'start', partial })
    partial.content.push({ type: 'text', text: '' })
    stream.push({ type: 'text_start', contentIndex: 0, partial })
    ;(partial.content[0] as { type: 'text'; text: string }).text = text
    stream.push({ type: 'text_delta', contentIndex: 0, delta: text, partial })
    stream.push({ type: 'text_end', contentIndex: 0, content: text, partial })
    stream.push({ type: 'done', reason: 'stop', message: partial })
  })
  return stream
}

export function failedStream(model: Model<Api>, error: unknown, signal?: AbortSignal): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream()
  const aborted = signal?.aborted === true
  const failure: AssistantMessage = {
    role: 'assistant',
    content: [],
    api: 'openai-codex-responses',
    provider: model.provider,
    model: model.id,
    usage: emptyUsage(),
    stopReason: aborted ? 'aborted' : 'error',
    errorMessage: error instanceof Error ? error.message : String(error),
    timestamp: Date.now(),
  }
  queueMicrotask(() => {
    stream.push({ type: 'error', reason: aborted ? 'aborted' : 'error', error: failure })
  })
  return stream
}

export async function parseCompactResponse(response: Response, retained: readonly unknown[]): Promise<CompactResponse> {
  if (response.body === null) throw new Error('OpenAI Codex native compaction response had no body')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let compaction: unknown
  let compactionCount = 0
  let outputCount = 0
  let responseId: string | undefined
  let usage: JsonRecord | undefined
  let completed = false
  let receivedBytes = 0

  const consumeEvent = (raw: string): void => {
    const data = raw.split(/\r?\n/u).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
    if (data.length === 0 || data === '[DONE]') return
    const event: unknown = JSON.parse(data)
    if (!isRecord(event)) return
    if (event['type'] === 'response.output_item.done') {
      outputCount += 1
      const item = event['item']
      if (isRecord(item) && item['type'] === 'compaction') {
        compactionCount += 1
        if (compaction === undefined) compaction = item
      }
      return
    }
    if (event['type'] === 'response.failed' || event['type'] === 'error') {
      throw new Error('OpenAI Codex native compaction stream reported failure')
    }
    if (event['type'] !== 'response.completed' && event['type'] !== 'response.done') return
    const terminal = event['response']
    if (completed || !isRecord(terminal) || terminal['status'] !== 'completed') {
      throw new Error('OpenAI Codex native compaction returned an invalid or duplicate terminal event')
    }
    const id = terminal['id']
    if (typeof id !== 'string' || id.length === 0) throw new Error('OpenAI Codex native compaction returned a malformed response id')
    responseId = id
    const rawUsage = terminal['usage']
    if (rawUsage !== undefined && !isRecord(rawUsage)) throw new Error('OpenAI Codex native compaction returned malformed usage')
    usage = rawUsage
    completed = true
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      receivedBytes += value?.byteLength ?? 0
      if (receivedBytes > OPENAI_CODEX_NATIVE_COMPACTION_MAX_CHECKPOINT_BYTES * 4) {
        throw new Error('OpenAI Codex native compaction stream exceeds the local size limit')
      }
      buffer += decoder.decode(value, { stream: !done })
      while (true) {
        const match = /\r?\n\r?\n/u.exec(buffer)
        if (match === null) break
        consumeEvent(buffer.slice(0, match.index))
        buffer = buffer.slice(match.index + match[0].length)
      }
      if (done) break
    }
    if (buffer.trim().length > 0) consumeEvent(buffer)
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
  if (!completed) throw new Error('OpenAI Codex native compaction stream ended before response.completed')
  if (compactionCount !== 1 || compaction === undefined) {
    throw new Error(`OpenAI Codex native compaction expected exactly one compaction item, received ${compactionCount} of ${outputCount} output items`)
  }
  return {
    ...(responseId === undefined ? {} : { id: responseId }),
    output: [...retained, compaction],
    ...(usage === undefined ? {} : { usage }),
  }
}
