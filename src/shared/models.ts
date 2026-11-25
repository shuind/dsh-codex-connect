/** Node-free model catalog, reasoning effort, and conversation speed contracts. */

/** Same-origin endpoint exposing the complete Codex model catalog. */
export const OPENAI_CODEX_MODEL_CATALOG_PATH = '/plugins/dsh-codex-connect/models'
/** GET/POST endpoint for one conversation's process-local Fast Mode state. */
export const OPENAI_CODEX_FAST_MODE_PATH = '/plugins/dsh-openai-codex/fast-mode'
/** GET/POST endpoint for explicit conversation speed selection. */
export const OPENAI_CODEX_SPEED_MODE_PATH = '/plugins/dsh-openai-codex/speed-mode'

/** Optional profile reasoning policy; model support remains owned by the Host adapter. */
export const OPENAI_CODEX_REASONING_EFFORTS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const

/** Reasoning levels accepted by the public PiAiAdapter profile. */
export type OpenAICodexReasoningEffort = typeof OPENAI_CODEX_REASONING_EFFORTS[number]

/** Preserve null masks until settings layers have merged; omission retains provider behavior. */
export function parseOpenAICodexReasoningEffort(value: unknown): OpenAICodexReasoningEffort | null | undefined {
  if (value === undefined || value === null) return value
  if (typeof value !== 'string' || !OPENAI_CODEX_REASONING_EFFORTS.some(effort => effort === value)) {
    throw new TypeError('OpenAI Codex reasoningEffort must be off, minimal, low, medium, high, xhigh, max, null or omitted')
  }
  return value as OpenAICodexReasoningEffort
}

export type OpenAICodexSpeedMode = 'standard' | 'fast'

export interface ConversationSpeedState {
  readonly generation: string
  readonly revision: number
  readonly mode: OpenAICodexSpeedMode
  readonly model: string
}

export function isOpenAICodexSpeedMode(value: unknown): value is OpenAICodexSpeedMode {
  return value === 'standard' || value === 'fast'
}

export function readConversationSpeed(value: unknown, model: string): ConversationSpeedState | undefined {
  if (!isRecord(value) || typeof value['generation'] !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/u.test(value['generation'])
    || !Number.isSafeInteger(value['revision']) || Number(value['revision']) < 0 || !isOpenAICodexSpeedMode(value['mode'])
    || value['model'] !== model) return undefined
  return {
    generation: value['generation'],
    revision: Number(value['revision']),
    mode: value['mode'],
    model,
  }
}

/**
 * The selector owns its speed hint, after any previous onPayload replacement.
 * A hint is not confirmation of the tier actually served by the backend.
 */
export function projectOpenAICodexSpeedPayload(
  payload: unknown,
  provider: string,
  _model: string,
  mode: OpenAICodexSpeedMode,
): unknown {
  if (!isRecord(payload) || provider !== 'openai-codex') return payload
  if (mode === 'fast') return { ...payload, service_tier: 'priority' }
  if (payload['service_tier'] !== 'priority') return payload
  const standard = { ...payload }
  delete standard['service_tier']
  return standard
}

/** Preserve an optional new-session preference until settings layers have merged. */
export function parseOpenAICodexSpeedDefault(value: unknown): OpenAICodexSpeedMode | null | undefined {
  if (value === undefined || value === null || isOpenAICodexSpeedMode(value)) return value
  if (value === 'ultrafast') return 'fast'
  throw new TypeError('OpenAI Codex new-session speed must be standard, fast, null or omitted')
}

/** Versioned official-client override policy, not a measured endpoint capacity. */
export const OPENAI_CODEX_CONTEXT_LIMIT_SOURCE = 'https://github.com/openai/codex/blob/39598ed17885970828acd42a6370131ed0190a98/codex-rs/models-manager/models.json'
export const OPENAI_CODEX_SOL61_CONTEXT_LIMIT_SOURCE = 'https://github.com/openai/codex/blob/d63a9b8344cfe58bc78bbe319b560378fc8756ef/codex-rs/models-manager/models.json'
export const OPENAI_CODEX_TERRA61_CONTEXT_LIMIT_SOURCE = 'https://github.com/openai/codex/blob/e8e6a922c0008bc08bacc69dd2ce9b6c3c12944c/codex-rs/models-manager/models.json'
export const OPENAI_CODEX_GPT62_CONTEXT_LIMIT_SOURCE = 'https://github.com/openai/codex/blob/6c0cee502d215e5df2dd9a303cf2e252229c9e12/codex-rs/models-manager/models.json'

/** Preserve historical provenance for existing models. */
export function openAICodexContextLimitSource(id: string): string {
  if (id === 'gpt-6.2-astra' || id === 'gpt-6.2-sol') return OPENAI_CODEX_GPT62_CONTEXT_LIMIT_SOURCE
  if (id === 'gpt-6.1-terra') return OPENAI_CODEX_TERRA61_CONTEXT_LIMIT_SOURCE
  return id === 'gpt-6.1-sol' ? OPENAI_CODEX_SOL61_CONTEXT_LIMIT_SOURCE : OPENAI_CODEX_CONTEXT_LIMIT_SOURCE
}

const CONFIGURATION_LIMITS: Readonly<Record<string, number>> = Object.freeze({
  'gpt-6.2-astra': 872_000,
  'gpt-6.2-sol': 872_000,
  'gpt-6.1-sol': 872_000,
  'gpt-6.1-terra': 872_000,
  'gpt-6-astra': 872_000,
  'gpt-6-sol': 872_000,
  'gpt-6-luna': 872_000,
  'gpt-5.6-sol': 872_000,
  'gpt-5.6-terra': 872_000,
  'gpt-5.6-luna': 872_000,
  'gpt-5.4': 1_000_000,
  'gpt-5.5': 272_000,
  'gpt-5.4-mini': 272_000,
})

const MODEL_TIER_PRIORITY: Readonly<Record<string, number>> = Object.freeze({
  astra: 4,
  sol: 3,
  terra: 2,
  luna: 1,
  mini: -1,
})

function modelSortKey(id: string): readonly [number, number, number, number] {
  const match = /^gpt-(\d+)(?:\.(\d+))?(?:-(.+))?$/iu.exec(id.trim())
  if (match === null) return [0, 0, 0, 0]
  const major = Number(match[1])
  const minor = match[2] === undefined ? 0 : Number(match[2])
  const suffix = match[3]?.toLowerCase() ?? ''
  const tier = suffix.length === 0 ? 0 : (MODEL_TIER_PRIORITY[suffix] ?? 0)
  return [1, major, minor, tier]
}

/** Sort Codex models from newest/strongest to oldest/lightest while preserving ties. */
export function sortOpenAICodexModels<T extends { readonly id: string }>(models: readonly T[]): T[] {
  return models
    .map((model, index) => ({ model, index, key: modelSortKey(model.id) }))
    .sort((left, right) => (
      (right.key[0] - left.key[0])
      || (right.key[1] - left.key[1])
      || (right.key[2] - left.key[2])
      || (right.key[3] - left.key[3])
      || (left.index - right.index)
    ))
    .map(entry => entry.model)
}

/** Keep unlisted or newer provider defaults usable without inventing a larger limit. */
export function openAICodexContextLimit(id: string, contextWindow: number): {
  maxContextWindow: number
  contextLimitSource: 'codex-catalog' | 'catalog-default'
} {
  const ceiling = Object.hasOwn(CONFIGURATION_LIMITS, id) ? CONFIGURATION_LIMITS[id] : undefined
  return ceiling === undefined || ceiling < contextWindow
    ? { maxContextWindow: contextWindow, contextLimitSource: 'catalog-default' }
    : { maxContextWindow: ceiling, contextLimitSource: 'codex-catalog' }
}

/** Whether a proposed local token budget fits the model's configuration range. */
export function isValidOpenAICodexContextBudget(value: number, maximum: number): boolean {
  return Number.isSafeInteger(value) && value > 0 && value <= maximum
}

/** One model available from the complete provider catalog. */
export interface OpenAICodexModelCatalogEntry {
  id: string
  name: string
  contextWindow: number
  maxContextWindow: number
  contextLimitSource: 'codex-catalog' | 'catalog-default'
  reasoning?: { efforts: { id: string; name: string }[]; defaultEffort?: string }
}

/** Validate the model catalog before it enters React state. */
export function decodeOpenAICodexModelCatalog(value: unknown): OpenAICodexModelCatalogEntry[] | undefined {
  if (!Array.isArray(value)) return undefined
  const catalog: OpenAICodexModelCatalogEntry[] = []
  const ids = new Set<string>()
  for (const entry of value) {
    if (!isRecord(entry)) return undefined
    const id = entry['id']
    const name = entry['name']
    const contextWindow = entry['contextWindow']
    const maxContextWindow = entry['maxContextWindow']
    const contextLimitSource = entry['contextLimitSource']
    if (typeof id !== 'string' || id.length === 0 || typeof name !== 'string' || name.length === 0 || ids.has(id)) return undefined
    if (typeof contextWindow !== 'number' || typeof maxContextWindow !== 'number'
      || !isValidOpenAICodexContextBudget(maxContextWindow, Number.MAX_SAFE_INTEGER)
      || !isValidOpenAICodexContextBudget(contextWindow, maxContextWindow)
      || (contextLimitSource !== 'codex-catalog' && contextLimitSource !== 'catalog-default')) return undefined
    const reasoning = decodeReasoning(entry['reasoning'])
    if (entry['reasoning'] !== undefined && reasoning === undefined) return undefined
    ids.add(id)
    catalog.push({ id, name, contextWindow, maxContextWindow, contextLimitSource, ...(reasoning === undefined ? {} : { reasoning }) })
  }
  return catalog
}

function decodeReasoning(value: unknown): OpenAICodexModelCatalogEntry['reasoning'] {
  if (!isRecord(value)) return undefined
  const choices = value['efforts']
  if (!Array.isArray(choices) || choices.length === 0 || choices.length > 64) return undefined
  const efforts: { id: string; name: string }[] = []
  const ids = new Set<string>()
  for (const choice of choices) {
    if (!isRecord(choice)) return undefined
    if (typeof choice['id'] !== 'string' || choice['id'].length === 0 || choice['id'].length > 128 || ids.has(choice['id'])
      || typeof choice['name'] !== 'string' || choice['name'].length === 0 || choice['name'].length > 256) return undefined
    ids.add(choice['id'])
    efforts.push({ id: choice['id'], name: choice['name'] })
  }
  const defaultEffort = value['defaultEffort']
  if (defaultEffort !== undefined && (typeof defaultEffort !== 'string' || !ids.has(defaultEffort))) return undefined
  return { efforts, ...(defaultEffort === undefined ? {} : { defaultEffort }) }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
