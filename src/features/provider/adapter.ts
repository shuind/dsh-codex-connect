/** OpenAI Codex adapter assembled from public dsh-llm-pi-ai extension points. */

import { defaultProviderAuthContext, InMemoryCredentialStore } from '@earendil-works/pi-ai'
import type { Provider, SimpleStreamOptions, TranscriptContext } from '@earendil-works/pi-ai'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import { resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, GenerateOptions, PreparedAdapterCall, ResolvedRetryPolicy, RetryPolicyConfig, StreamChunk } from '@deepseek-ai/dsh-llm'
import { deepEqualJson } from '@deepseek-ai/dsh-util-values'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import type { ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import {
  isValidOpenAICodexContextBudget,
  openAICodexContextLimit,
  projectOpenAICodexSpeedPayload,
  type OpenAICodexModelCatalogEntry,
  type OpenAICodexReasoningEffort,
} from '../../shared/models.ts'
import { imageSelectionHandleText } from '../../shared/images/contract.ts'
import { OPENAI_CODEX_PROVIDER, type OpenAICodexCredentialStore } from '../../platform/auth/store.ts'
import { readOpenAICodexRequestAuth } from '../../platform/auth/oauth-client.ts'
import type { OpenAICodexBackendRequests } from '../../platform/http/backend-request.ts'
import { streamWithNativeCompactionScope, withOpenAICodexNativeCompaction } from '../compaction/index.ts'
import { OPENAI_CODEX_TRANSPORT, withOpenAICodexModels } from './model-catalog.ts'
import { streamWithCodexRequestDiagnostics, withCodexDiagnosticFetch } from './request-diagnostics.ts'
import type { FastModeRegistry } from './speed/fast-mode.ts'

export { OPENAI_CODEX_ASTRA_MODEL_ID, OPENAI_CODEX_TRANSPORT, openAICodexModelCatalog, withOpenAICodexAstra, withOpenAICodexModels } from './model-catalog.ts'
export const OPENAI_CODEX_STREAM_IDLE_TIMEOUT_MS = 300_000

export const OPENAI_CODEX_MAX_REQUEST_IMAGE_BYTES = 20 * 1024 * 1024
export const OPENAI_CODEX_MAX_REQUEST_IMAGES = 50
export const OPENAI_CODEX_IMAGE_OFFLOAD_COUNT_QUANTUM = 10
export const OPENAI_CODEX_REQUEST_IMAGE_PIXEL_BUDGET = 2048 * 2048
export const OPENAI_CODEX_REQUEST_IMAGE_MAX_BYTES = 1024 * 1024

export interface OpenAICodexProfileOptions {
  fastMode?: FastModeRegistry | undefined
  contextWindowOverrides?: Readonly<Record<string, number>> | undefined
  backendRequests?: OpenAICodexBackendRequests | undefined
  wrapProvider?: ((provider: Provider) => Provider) | undefined
  retryPolicy?: ResolvedRetryPolicy | undefined
  reasoningEffort?: OpenAICodexReasoningEffort | undefined
}

export interface OpenAICodexAdapterOptions {
  fastMode?: FastModeRegistry | undefined
  visibleModelIds?: (() => readonly string[] | undefined) | undefined
  contextWindowOverrides?: (() => Readonly<Record<string, number>> | undefined) | undefined
  nativeCompactionEnabled?: (() => boolean) | undefined
  backendRequests?: OpenAICodexBackendRequests | undefined
  imageEditingEnabled?: (() => boolean) | undefined
  retryPolicyConfig?: RetryPolicyConfig | undefined
  resolveReasoningEffort?: (() => OpenAICodexReasoningEffort | undefined) | undefined
}

function codexRequestOptions(
  providerId: string,
  model: { provider: string; id: string },
  options: SimpleStreamOptions | undefined,
): SimpleStreamOptions | undefined {
  if (providerId !== OPENAI_CODEX_PROVIDER || model.provider !== OPENAI_CODEX_PROVIDER || options?.onPayload === undefined) {
    return options
  }
  const previous = options.onPayload
  return {
    ...options,
    async onPayload(payload, payloadModel) {
      return await previous(payload, payloadModel) ?? payload
    },
  }
}

/** Add the request-scoped Fast speed hint without changing auth or other options. */
export function withOpenAICodexFastMode(
  provider: Provider,
  fastMode: FastModeRegistry | undefined,
): Provider {
  const streamSimple = provider.streamSimple
  return {
    ...provider,
    streamSimple(model, context: TranscriptContext, options?: SimpleStreamOptions) {
      const sessionId = options?.sessionId
      const enabled = provider.id === OPENAI_CODEX_PROVIDER
        && model.provider === OPENAI_CODEX_PROVIDER
        && fastMode !== undefined
        && fastMode.isEnabled(sessionId)
      const mode = enabled ? 'fast' : 'standard'
      if (mode === 'standard' && options?.onPayload === undefined) return streamSimple.call(provider, model, context, options)
      const previousOnPayload = options?.onPayload
      const nextOptions: SimpleStreamOptions = {
        ...options,
        async onPayload(payload, payloadModel) {
          const replaced = await previousOnPayload?.(payload, payloadModel)
          return projectOpenAICodexSpeedPayload(replaced === undefined ? payload : replaced, model.provider, model.id, mode)
        },
      }
      return streamSimple.call(provider, model, context, nextOptions)
    },
  }
}

function requestProvider(provider: Provider, options: OpenAICodexProfileOptions): Provider {
  const { fastMode, backendRequests, wrapProvider } = options
  const ordinary = withOpenAICodexFastMode(withOpenAICodexNativeCompaction(provider), fastMode)
  const configured = wrapProvider === undefined ? ordinary : wrapProvider(ordinary)
  const streamSimple = configured.streamSimple
  return {
    ...configured,
    streamSimple(model, context: TranscriptContext, streamOptions?: SimpleStreamOptions) {
      const operation = () => {
        const diagnosticOptions = withCodexDiagnosticFetch(streamOptions, backendRequests)
        return streamSimple.call(configured, model, context, codexRequestOptions(provider.id, model, diagnosticOptions))
      }
      return backendRequests !== undefined ? backendRequests.runStream(operation) : operation()
    },
    auth: {
      ...provider.auth,
      apiKey: {
        name: 'OpenAI Codex OAuth bearer token',
        async resolve({ credential }) {
          const apiKey = credential?.key
          return apiKey === undefined || apiKey.length === 0 ? undefined : { auth: { apiKey }, source: 'OAuth' }
        },
      },
    },
  }
}

/** Build the pi-ai provider profile for DSH 0.2.2-rc.x. */
export function createOpenAICodexProfile(
  provider: Provider,
  options: OpenAICodexProfileOptions = {},
): ResolvedPiAiProviderProfile & { piProvider: Provider } {
  const retryPolicy = options.retryPolicy ?? resolveRetryPolicy(undefined, 'dsh-codex-connect retryPolicy')
  const effectiveProvider = options.contextWindowOverrides === undefined
    ? provider
    : withOpenAICodexContextWindowOverrides(provider, options.contextWindowOverrides)
  return {
    provider: OPENAI_CODEX_PROVIDER,
    displayName: 'OpenAI Codex',
    transport: OPENAI_CODEX_TRANSPORT,
    streamIdleTimeoutMs: OPENAI_CODEX_STREAM_IDLE_TIMEOUT_MS,
    maxRequestImageBytes: OPENAI_CODEX_MAX_REQUEST_IMAGE_BYTES,
    maxRequestImages: OPENAI_CODEX_MAX_REQUEST_IMAGES,
    imageOffloadCountQuantum: OPENAI_CODEX_IMAGE_OFFLOAD_COUNT_QUANTUM,
    requestImagePixelBudget: OPENAI_CODEX_REQUEST_IMAGE_PIXEL_BUDGET,
    requestImageMaxBytes: OPENAI_CODEX_REQUEST_IMAGE_MAX_BYTES,
    retryPolicy,
    ...(options.reasoningEffort === undefined ? {} : { reasoning: options.reasoningEffort }),
    configuredMaxTokens: new Map(),
    modelErrors: new Map<string, string>(),
    piProvider: requestProvider(effectiveProvider, options),
  }
}

/** Replace the advertised context window for configured model ids without mutating the source provider. */
export function withOpenAICodexContextWindowOverrides(
  provider: Provider,
  overrides: Readonly<Record<string, number>>,
): Provider {
  const baselineModels = provider.getModels()
  assertOpenAICodexContextWindowOverrides(overrides, baselineModels)
  const replaced = baselineModels.map(model => {
    const contextWindow = overrides[model.id]
    return contextWindow === undefined ? model : { ...model, contextWindow }
  })
  return { ...provider, getModels: () => replaced }
}

/** Reject unknown ids and out-of-range budgets before accepting settings or requests. */
export function assertOpenAICodexContextWindowOverrides(
  overrides: Readonly<Record<string, number | null>> | undefined,
  catalog: readonly Pick<OpenAICodexModelCatalogEntry, 'id' | 'contextWindow'>[],
): void {
  const models = new Map(catalog.map(model => [model.id, model]))
  for (const [id, budget] of Object.entries(overrides ?? {})) {
    const model = models.get(id)
    if (model === undefined) throw new TypeError(`OpenAI Codex contextWindowOverrides contains unknown model id "${id}"`)
    const { maxContextWindow } = openAICodexContextLimit(id, model.contextWindow)
    if (budget !== null && !isValidOpenAICodexContextBudget(budget, maxContextWindow)) {
      throw new TypeError(`OpenAI Codex contextWindowOverrides for "${id}" must be an integer from 1 to ${maxContextWindow} tokens; use null to restore the catalog default`)
    }
  }
}

/** Add stable selection handles next to request images without mutating durable messages. */
export function withOpenAICodexImageSelectionHandles(options: GenerateOptions): GenerateOptions {
  let changed = false
  const messages = options.messages.map(message => {
    let imageIndex = 0
    let contentChanged = false
    const content: ContentBlock[] = []
    for (const block of message.content) {
      content.push(block)
      if (block.type !== 'image') continue
      imageIndex += 1
      content.push({ type: 'text', text: imageSelectionHandleText(imageIndex, block.attachment) })
      contentChanged = true
    }
    if (!contentChanged) return message
    changed = true
    return { ...message, content }
  })
  return changed ? { ...options, messages } : options
}

/** Create the Codex subscription adapter for DSH 0.2.2-rc.x. */
export function createOpenAICodexAdapter(
  credentials: OpenAICodexCredentialStore,
  resolveAttachments: () => AttachmentStore | undefined,
  options: OpenAICodexAdapterOptions = {},
): PiAiAdapter {
  const {
    fastMode, visibleModelIds, contextWindowOverrides,
    nativeCompactionEnabled, backendRequests, imageEditingEnabled,
    retryPolicyConfig, resolveReasoningEffort,
  } = options
  if (retryPolicyConfig === null) throw new TypeError('dsh-codex-connect retryPolicy must be an object or omitted')
  const retryPolicy = resolveRetryPolicy(retryPolicyConfig, 'dsh-codex-connect retryPolicy')
  const provider = withOpenAICodexModels(openaiCodexProvider(), 'bundled-static')
  let profiles: Map<string, ResolvedPiAiProviderProfile> | undefined
  let previousOverrides: Readonly<Record<string, number>> | undefined
  let previousReasoningEffort: OpenAICodexReasoningEffort | undefined

  const currentProfiles = (): Map<string, ResolvedPiAiProviderProfile> => {
    const overrides = contextWindowOverrides?.()
    const reasoningEffort = resolveReasoningEffort?.()
    if (profiles === undefined || previousReasoningEffort !== reasoningEffort || !deepEqualJson(previousOverrides, overrides)) {
      const profile = createOpenAICodexProfile(provider, {
        fastMode, contextWindowOverrides: overrides,
        backendRequests, retryPolicy, reasoningEffort,
      })
      previousReasoningEffort = reasoningEffort
      previousOverrides = overrides === undefined ? undefined : { ...overrides }
      profiles = new Map([[OPENAI_CODEX_PROVIDER, profile]])
    }
    return profiles
  }

  class OpenAICodexAdapter extends PiAiAdapter {
    private streamPrepared(
      stream: (request: GenerateOptions) => AsyncIterable<StreamChunk>,
      requestOptions: GenerateOptions,
    ): AsyncIterable<StreamChunk> {
      const projected = imageEditingEnabled?.() === true ? withOpenAICodexImageSelectionHandles(requestOptions) : requestOptions
      return streamWithCodexRequestDiagnostics(
        next => streamWithNativeCompactionScope(stream, next, nativeCompactionEnabled?.() === true),
        projected,
      )
    }

    override async prepareCall(providerId: string, model: string, signal?: AbortSignal): Promise<PreparedAdapterCall> {
      const prepared = await super.prepareCall(providerId, model, signal)
      return { model: prepared.model, stream: req => this.streamPrepared(prepared.stream, req) }
    }

    override stream(requestOptions: GenerateOptions): AsyncIterable<StreamChunk> {
      return this.streamPrepared(next => super.stream(next), requestOptions)
    }

    override async listModels(providerId: string) {
      const activeProvider = currentProfiles().get(providerId)?.piProvider
      if (activeProvider === undefined) return super.listModels(providerId)
      const catalog = activeProvider.getModels()
        .map(model => ({ provider: providerId, id: model.id, name: model.name, inputModalities: [...model.input] }))
      const configured = visibleModelIds?.()
      if (configured === undefined) return catalog
      const visible = new Set(configured)
      return catalog.filter(model => visible.has(model.id))
    }
  }

  return new OpenAICodexAdapter({
    profiles: currentProfiles,
    resolveApiKey: async () => (await readOpenAICodexRequestAuth(credentials)).access,
    auth: { credentials: new InMemoryCredentialStore(), authContext: defaultProviderAuthContext() },
    resolveAttachments,
  })
}
