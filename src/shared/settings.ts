/** Node-free settings and proxy route contract shared by Host and browser. */

import { OPENAI_CODEX_REASONING_EFFORTS, parseOpenAICodexReasoningEffort, parseOpenAICodexSpeedDefault } from './models.ts'
import type { OpenAICodexReasoningEffort, OpenAICodexSpeedMode } from './models.ts'

/** Stable Harness settings namespace owned by this plugin. */
export const OPENAI_CODEX_SETTINGS_NAMESPACE = 'llm-openai-codex'

/** Detect bounded local/environment proxy candidates without changing settings. */
export const OPENAI_CODEX_PROXY_DETECT_PATH = '/plugins/dsh-openai-codex/proxy/detect'
/** Test one manually entered proxy origin without changing settings. */
export const OPENAI_CODEX_PROXY_TEST_PATH = '/plugins/dsh-openai-codex/proxy/test'

/** Suggested local HTTP proxy shown by the settings UI; it is never enabled by default. */
export const DEFAULT_OPENAI_CODEX_PROXY_URL = 'http://127.0.0.1:7890'

/** Empty profile setting, which makes image requests use the default route hint. */
export const DEFAULT_OPENAI_CODEX_IMAGE_MODEL_HINT = ''

/** Validate an optional bounded ASCII image route model hint. */
export function isValidOpenAICodexImageModelHint(value: unknown): value is string {
  return typeof value === 'string' && (value === '' || /^(?=.{1,128}$)[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value))
}

/** Parse an image route model hint without exposing malformed input. */
export function parseOpenAICodexImageModelHint(value: unknown): string {
  if (!isValidOpenAICodexImageModelHint(value)) {
    throw new TypeError('OpenAI Codex imageModelHint must be empty or a bounded ASCII model slug')
  }
  return value
}

/**
 * Normalize the credential-free HTTP proxy URL accepted by Codex Connect.
 * Paths, query strings, fragments, and embedded credentials are rejected so
 * the value remains an origin rather than an opaque request target.
 */
export function normalizeOpenAICodexProxyUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) return undefined
  try {
    const parsed = new URL(value.trim())
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined
    if (parsed.username !== '' || parsed.password !== '') return undefined
    if (parsed.pathname !== '/' || parsed.search !== '' || parsed.hash !== '') return undefined
    if (parsed.hostname.length === 0) return undefined
    if (parsed.port !== '' && (!/^\d+$/u.test(parsed.port) || Number(parsed.port) < 1 || Number(parsed.port) > 65_535)) return undefined
    return parsed.origin
  } catch {
    return undefined
  }
}

/** Whether a value is a supported, canonical HTTP(S) proxy origin. */
export function isValidOpenAICodexProxyUrl(value: unknown): value is string {
  return normalizeOpenAICodexProxyUrl(value) !== undefined
}

/** Search modes accepted by the Codex standalone search endpoint. */
export type OpenAICodexSearchMode = 'cached' | 'indexed' | 'live'

/** Search-context sizes accepted by the Codex standalone search endpoint. */
export type OpenAICodexSearchContextSize = 'low' | 'medium' | 'high'

/**
 * Whether a value is a bounded per-model context-window override map. Keys
 * are nonempty, unpadded model ids; values are positive safe integers or null
 * to restore that model's catalog default.
 */
export function isValidOpenAICodexContextWindowOverrides(value: unknown): value is Readonly<Record<string, number | null>> {
  if (!isRecord(value)) return false
  const entries = Object.entries(value)
  if (entries.length > 256) return false
  return entries.every(([modelId, window]) => modelId.length > 0 && modelId.trim() === modelId
    && (window === null || (typeof window === 'number' && Number.isSafeInteger(window) && window > 0)))
}

/** Preserve per-model null masks until the Host has merged its settings layers. */
export function parseOpenAICodexContextWindowOverrides(value: unknown): Readonly<Record<string, number | null>> | undefined {
  if (value === undefined || value === null) return undefined
  if (!isValidOpenAICodexContextWindowOverrides(value)) {
    throw new TypeError('OpenAI Codex contextWindowOverrides must contain at most 256 nonempty model ids with positive safe-integer token budgets or null resets')
  }
  return { ...value }
}

/** Resolve merged settings; whole-map or per-model null masks use catalog defaults. */
export function resolveOpenAICodexContextWindowOverrides(value: unknown): Readonly<Record<string, number>> | undefined {
  const overrides = parseOpenAICodexContextWindowOverrides(value)
  if (overrides === undefined) return undefined
  return Object.fromEntries(Object.entries(overrides).filter((entry): entry is [string, number] => entry[1] !== null))
}

/** Default model used by the standalone search endpoint. */
export const DEFAULT_OPENAI_CODEX_SEARCH_MODEL = 'gpt-5.6-sol'
/** Default search mode, matching the official local Codex client. */
export const DEFAULT_OPENAI_CODEX_SEARCH_MODE: OpenAICodexSearchMode = 'cached'
/** Default provider search-context size. */
export const DEFAULT_OPENAI_CODEX_SEARCH_CONTEXT_SIZE: OpenAICodexSearchContextSize = 'medium'
/** Default output budget for the standalone search response. */
export const DEFAULT_OPENAI_CODEX_SEARCH_MAX_OUTPUT_TOKENS = 10_000

/** Fully resolved user-editable section presented by Plugin configuration. */
export interface OpenAICodexSettingsConfig {
  /** Model ids advertised in selectors; undefined advertises the full catalog. */
  models: string[] | undefined
  /** Optional fallback when a request does not specify reasoning effort. */
  reasoningEffort: OpenAICodexReasoningEffort | undefined
  /** Route Codex Connect requests through the explicitly configured proxy. */
  enableProxy: boolean
  /** Credential-free HTTP(S) proxy origin; inactive while enableProxy is false. */
  proxyUrl: string
  /** Per-model context-window overrides keyed by catalog model id. */
  contextWindowOverrides: Readonly<Record<string, number>> | undefined
  enableSearch: boolean
  /** Default Fast Mode for newly started top-level sessions; existing sessions are unchanged. */
  enableNewSessionFastMode: boolean
  /** Explicit new top-level default; omission retains the legacy Fast preference. */
  newSessionSpeedMode: OpenAICodexSpeedMode | undefined
  /** Independent new-subagent default, with the same legacy omission behavior. */
  newSubagentSpeedMode: OpenAICodexSpeedMode | undefined
  /** Independent default for newly started subagent sessions. */
  enableNewSubagentFastMode: boolean
  /** Use provider-native Responses V2 compaction when DSH requests compaction. */
  enableNativeCompaction: boolean
  enableImageGeneration: boolean
  /** Optional profile-scoped model hint for image generation; empty uses the route default. */
  imageModelHint: string
  searchModel: string
  searchMode: OpenAICodexSearchMode
  searchContextSize: OpenAICodexSearchContextSize
  searchMaxOutputTokens: number
}

export const DEFAULT_OPENAI_CODEX_SETTINGS: Readonly<OpenAICodexSettingsConfig> = Object.freeze({
  models: undefined,
  reasoningEffort: undefined,
  enableProxy: false,
  proxyUrl: DEFAULT_OPENAI_CODEX_PROXY_URL,
  contextWindowOverrides: undefined,
  enableSearch: false,
  enableNewSessionFastMode: false,
  newSessionSpeedMode: undefined,
  newSubagentSpeedMode: undefined,
  enableNewSubagentFastMode: false,
  enableNativeCompaction: false,
  enableImageGeneration: false,
  imageModelHint: DEFAULT_OPENAI_CODEX_IMAGE_MODEL_HINT,
  searchModel: DEFAULT_OPENAI_CODEX_SEARCH_MODEL,
  searchMode: DEFAULT_OPENAI_CODEX_SEARCH_MODE,
  searchContextSize: DEFAULT_OPENAI_CODEX_SEARCH_CONTEXT_SIZE,
  searchMaxOutputTokens: DEFAULT_OPENAI_CODEX_SEARCH_MAX_OUTPUT_TOKENS,
})

/** Input settings allow null to disable overrides inherited from a lower settings layer. */
export interface OpenAICodexSettingsInput extends Partial<Omit<OpenAICodexSettingsConfig, 'contextWindowOverrides' | 'reasoningEffort' | 'newSessionSpeedMode' | 'newSubagentSpeedMode'>> {
  reasoningEffort?: OpenAICodexReasoningEffort | null | undefined
  newSessionSpeedMode?: OpenAICodexSpeedMode | null | undefined
  newSubagentSpeedMode?: OpenAICodexSpeedMode | null | undefined
  contextWindowOverrides?: Readonly<Record<string, number | null>> | null | undefined
}

/** Fill the schema defaults even when called without Cordis validation. */
export function resolveOpenAICodexSettings(
  value: OpenAICodexSettingsInput,
): OpenAICodexSettingsConfig {
  const resolved = { ...DEFAULT_OPENAI_CODEX_SETTINGS, ...value }
  if (typeof resolved.enableNewSessionFastMode !== 'boolean' || typeof resolved.enableNewSubagentFastMode !== 'boolean') {
    throw new TypeError('OpenAI Codex new-session Fast Mode defaults must be booleans')
  }
  if (typeof resolved.enableNativeCompaction !== 'boolean') {
    throw new TypeError('OpenAI Codex enableNativeCompaction must be a boolean')
  }
  if (!isValidOpenAICodexProxyUrl(resolved.proxyUrl)) {
    throw new TypeError('OpenAI Codex proxyUrl must be an HTTP(S) origin without credentials or a path')
  }
  parseOpenAICodexImageModelHint(resolved.imageModelHint)
  return {
    ...resolved,
    reasoningEffort: parseOpenAICodexReasoningEffort(resolved.reasoningEffort) ?? undefined,
    newSessionSpeedMode: parseOpenAICodexSpeedDefault(resolved.newSessionSpeedMode) ?? undefined,
    newSubagentSpeedMode: parseOpenAICodexSpeedDefault(resolved.newSubagentSpeedMode) ?? undefined,
    contextWindowOverrides: resolveOpenAICodexContextWindowOverrides(resolved.contextWindowOverrides),
  }
}

/** Resolve the active proxy without treating a disabled value as a route. */
export function resolveOpenAICodexProxyUrl(
  value: OpenAICodexSettingsInput,
): string | undefined {
  const resolved = resolveOpenAICodexSettings(value)
  return resolved.enableProxy ? normalizeOpenAICodexProxyUrl(resolved.proxyUrl) : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Narrow the redacted settings wire payload before it enters React state. */
export function decodeOpenAICodexSettings(value: unknown): OpenAICodexSettingsConfig | undefined {
  if (!isRecord(value)) return undefined
  const newSessionSpeedMode = value['newSessionSpeedMode']
  const newSubagentSpeedMode = value['newSubagentSpeedMode']
  for (const speed of [newSessionSpeedMode, newSubagentSpeedMode]) {
    if (speed !== undefined && speed !== null && speed !== 'standard' && speed !== 'fast' && speed !== 'ultrafast') return undefined
  }
  const reasoningEffort = value['reasoningEffort']
  if (reasoningEffort !== undefined && reasoningEffort !== null && (typeof reasoningEffort !== 'string' || !OPENAI_CODEX_REASONING_EFFORTS.some(effort => effort === reasoningEffort))) return undefined
  const models = value['models']
  const enableProxy = value['enableProxy']
  const proxyUrl = value['proxyUrl']
  const contextWindowOverrides = value['contextWindowOverrides']
  const enableSearch = value['enableSearch']
  const enableNewSessionFastMode = value['enableNewSessionFastMode']
  const enableNewSubagentFastMode = value['enableNewSubagentFastMode']
  const enableNativeCompaction = value['enableNativeCompaction']
  const enableImageGeneration = value['enableImageGeneration']
  const imageModelHint = value['imageModelHint']
  const searchModel = value['searchModel']
  const searchMode = value['searchMode']
  const searchContextSize = value['searchContextSize']
  const searchMaxOutputTokens = value['searchMaxOutputTokens']
  if (models !== undefined && (!Array.isArray(models) || models.some(model => typeof model !== 'string'))) return undefined
  if (enableProxy !== undefined && typeof enableProxy !== 'boolean') return undefined
  if (proxyUrl !== undefined && (typeof proxyUrl !== 'string' || !isValidOpenAICodexProxyUrl(proxyUrl))) return undefined
  if (contextWindowOverrides !== undefined && contextWindowOverrides !== null && !isValidOpenAICodexContextWindowOverrides(contextWindowOverrides)) return undefined
  if (typeof enableSearch !== 'boolean') return undefined
  if (enableNewSessionFastMode !== undefined && typeof enableNewSessionFastMode !== 'boolean') return undefined
  if (enableNewSubagentFastMode !== undefined && typeof enableNewSubagentFastMode !== 'boolean') return undefined
  if (enableNativeCompaction !== undefined && typeof enableNativeCompaction !== 'boolean') return undefined
  if (enableImageGeneration !== undefined && typeof enableImageGeneration !== 'boolean') return undefined
  if (imageModelHint !== undefined && !isValidOpenAICodexImageModelHint(imageModelHint)) return undefined
  if (typeof searchModel !== 'string' || searchModel.trim().length === 0) return undefined
  if (searchMode !== 'cached' && searchMode !== 'indexed' && searchMode !== 'live') return undefined
  if (searchContextSize !== 'low' && searchContextSize !== 'medium' && searchContextSize !== 'high') return undefined
  if (typeof searchMaxOutputTokens !== 'number' || !Number.isInteger(searchMaxOutputTokens) || searchMaxOutputTokens < 1) return undefined
  const overrides = resolveOpenAICodexContextWindowOverrides(contextWindowOverrides)
  return {
    newSessionSpeedMode: parseOpenAICodexSpeedDefault(newSessionSpeedMode) ?? undefined,
    newSubagentSpeedMode: parseOpenAICodexSpeedDefault(newSubagentSpeedMode) ?? undefined,
    reasoningEffort: parseOpenAICodexReasoningEffort(reasoningEffort) ?? undefined,
    models: models === undefined ? undefined : [...new Set(models)],
    enableProxy: enableProxy ?? false,
    proxyUrl: proxyUrl === undefined ? DEFAULT_OPENAI_CODEX_PROXY_URL : normalizeOpenAICodexProxyUrl(proxyUrl)!,
    contextWindowOverrides: overrides === undefined ? undefined : Object.freeze(overrides),
    enableSearch,
    enableNewSessionFastMode: enableNewSessionFastMode ?? false,
    enableNewSubagentFastMode: enableNewSubagentFastMode ?? false,
    enableNativeCompaction: enableNativeCompaction ?? false,
    enableImageGeneration: enableImageGeneration ?? false,
    imageModelHint: imageModelHint ?? DEFAULT_OPENAI_CODEX_IMAGE_MODEL_HINT,
    searchModel,
    searchMode,
    searchContextSize,
    searchMaxOutputTokens,
  }
}

/** Stable probe classifications safe to display in the browser. */
export type OpenAICodexProxyProbeClassification =
  | 'reachable'
  | 'upstream-authentication-required'
  | 'proxy-authentication-required'
  | 'dns-failure'
  | 'connection-refused'
  | 'timeout'
  | 'tls-failure'
  | 'connect-failure'
  | 'invalid'

/** Result of testing one proxy origin. */
export interface OpenAICodexProxyProbeResult {
  /** Canonical proxy origin tested. */
  proxyUrl: string
  /** Whether the proxy returned any HTTP response from the probe origin. */
  reachable: boolean
  /** Bounded category for a UI troubleshooting message. */
  classification: OpenAICodexProxyProbeClassification
  /** Upstream or proxy status, when an HTTP response was received. */
  status?: number
}
