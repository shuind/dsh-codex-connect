/** Cordis plugin configuration schema and volatile value helpers. */

import type { Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { RetryPolicySchema, resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import type { RetryPolicyConfig } from '@deepseek-ai/dsh-llm'
import {
  DEFAULT_OPENAI_CODEX_PROXY_URL,
  DEFAULT_OPENAI_CODEX_SEARCH_CONTEXT_SIZE,
  DEFAULT_OPENAI_CODEX_SEARCH_MAX_OUTPUT_TOKENS,
  DEFAULT_OPENAI_CODEX_SEARCH_MODE,
  DEFAULT_OPENAI_CODEX_SEARCH_MODEL,
  parseOpenAICodexContextWindowOverrides,
  parseOpenAICodexImageModelHint,
} from './shared/settings.ts'
import type { OpenAICodexSearchContextSize, OpenAICodexSearchMode } from './shared/settings.ts'
import { parseOpenAICodexReasoningEffort, parseOpenAICodexSpeedDefault } from './shared/models.ts'
import type { OpenAICodexReasoningEffort, OpenAICodexSpeedMode } from './shared/models.ts'
import { OPENAI_CODEX_AUTHORIZATION_TIMEOUT_MS } from './features/auth/auth-flow.ts'
import { assertOpenAICodexContextWindowOverrides, openAICodexModelCatalog } from './features/provider/adapter.ts'
import { resolveOpenAICodexPreflightConfig } from './features/provider/preflight/activity.ts'
import type { OpenAICodexPreflightConfig } from './features/provider/preflight/activity.ts'

/** Plain configuration accepted by direct Cordis composition and unit tests. */
export interface Config {
  newSessionSpeedMode?: OpenAICodexSpeedMode | null | undefined
  newSubagentSpeedMode?: OpenAICodexSpeedMode | null | undefined
  reasoningEffort?: OpenAICodexReasoningEffort | null | undefined
  retryPolicy?: RetryPolicyConfig | undefined
  enableQuotaTool?: boolean
  oauthTimeoutMs?: number
  models?: string[] | undefined
  enableProxy?: boolean
  proxyUrl?: string
  preflightActivity?: OpenAICodexPreflightConfig | undefined
  contextWindowOverrides?: Record<string, number | null> | null | undefined
  enableSearch?: boolean
  enableNewSessionFastMode?: boolean
  enableNewSubagentFastMode?: boolean
  enableNativeCompaction?: boolean
  enableImageTool?: boolean
  enableImageGeneration?: boolean
  imageHandleBridgeTools?: string[] | undefined
  imageModelHint?: string
  searchModel?: string
  searchMode?: OpenAICodexSearchMode
  searchContextSize?: OpenAICodexSearchContextSize
  searchMaxOutputTokens?: number
}

/** Runtime configuration exposes each editable field through Cordis's public Volatile type. */
export interface VolatileConfig {
  newSessionSpeedMode: Volatile<OpenAICodexSpeedMode | null | undefined>
  newSubagentSpeedMode: Volatile<OpenAICodexSpeedMode | null | undefined>
  reasoningEffort: Volatile<OpenAICodexReasoningEffort | null | undefined>
  retryPolicy?: RetryPolicyConfig | undefined
  enableQuotaTool: boolean
  oauthTimeoutMs: number
  models: Volatile<string[] | undefined>
  enableProxy: Volatile<boolean>
  proxyUrl: Volatile<string>
  preflightActivity?: OpenAICodexPreflightConfig | undefined
  contextWindowOverrides: Volatile<Record<string, number | null> | null | undefined>
  enableSearch: Volatile<boolean>
  enableNewSessionFastMode: Volatile<boolean>
  enableNewSubagentFastMode: Volatile<boolean>
  enableNativeCompaction: Volatile<boolean>
  enableImageTool: Volatile<boolean>
  enableImageGeneration: Volatile<boolean>
  imageHandleBridgeTools: Volatile<string[] | undefined>
  imageModelHint: Volatile<string>
  searchModel: Volatile<string>
  searchMode: Volatile<OpenAICodexSearchMode>
  searchContextSize: Volatile<OpenAICodexSearchContextSize>
  searchMaxOutputTokens: Volatile<number>
}

export function configValue<T>(value: T | Volatile<T> | undefined): T | undefined {
  return value !== null && typeof value === 'object' && 'get' in value
    ? value.get() as T | undefined
    : value as T | undefined
}

function parseSettingsContextWindowOverrides(
  value: Record<string, number | null> | null | undefined,
): Record<string, number | null> | null | undefined {
  if (value === null || value === undefined) return value
  const parsed = parseOpenAICodexContextWindowOverrides(value)
  assertOpenAICodexContextWindowOverrides(parsed, openAICodexModelCatalog())
  return parsed
}

export const Config: z<Config, VolatileConfig> = z.object({
  newSessionSpeedMode: z.transform(z.union([z.const(undefined), z.const(null), z.string()]), parseOpenAICodexSpeedDefault).volatile(),
  newSubagentSpeedMode: z.transform(z.union([z.const(undefined), z.const(null), z.string()]), parseOpenAICodexSpeedDefault).volatile(),
  reasoningEffort: z.transform(z.union([z.const(undefined), z.const(null), z.string()]), parseOpenAICodexReasoningEffort).volatile(),
  retryPolicy: z.transform(z.union([z.const(undefined), RetryPolicySchema]), value => {
    resolveRetryPolicy(value, 'dsh-codex-connect retryPolicy')
    return value
  }).description('Optional Host model-request retry policy. Omit for existing defaults; reload the plugin after changes.'),
  enableQuotaTool: z.boolean().default(false).description('Register read-only shared Codex quota observation for models. Reload the plugin after changes.'),
  oauthTimeoutMs: z.number().step(1).min(1_000).max(1_800_000).default(OPENAI_CODEX_AUTHORIZATION_TIMEOUT_MS),
  models: z.union([z.const(undefined), z.array(z.string())]).volatile(),
  enableProxy: z.boolean().default(false).volatile(),
  proxyUrl: z.string().default(DEFAULT_OPENAI_CODEX_PROXY_URL).volatile(),
  preflightActivity: z.transform(z.union([z.const(undefined), z.object({
    protocol: z.const('bili-v1'), trustedProxyOrigin: z.string(), maxDurationMs: z.number(),
  })]), value => value === undefined ? undefined : resolveOpenAICodexPreflightConfig(value)),
  contextWindowOverrides: z.transform(
    z.union([z.const(undefined), z.const(null), z.dict(z.union([z.const(null), z.number()]))]),
    parseSettingsContextWindowOverrides,
  ).volatile(),
  enableSearch: z.boolean().default(false).volatile(),
  enableNewSessionFastMode: z.boolean().default(false).volatile(),
  enableNewSubagentFastMode: z.boolean().default(false).volatile(),
  enableNativeCompaction: z.boolean().default(false).volatile(),
  enableImageTool: z.boolean().default(false).volatile(),
  enableImageGeneration: z.boolean().default(false).volatile(),
  imageHandleBridgeTools: z.union([z.const(undefined), z.array(z.string())]).volatile(),
  imageModelHint: z.transform(z.string(), parseOpenAICodexImageModelHint).default('').volatile(),
  searchModel: z.string().default(DEFAULT_OPENAI_CODEX_SEARCH_MODEL).volatile(),
  searchMode: z.union(['cached', 'indexed', 'live'] as const).default(DEFAULT_OPENAI_CODEX_SEARCH_MODE).volatile(),
  searchContextSize: z.union(['low', 'medium', 'high'] as const).default(DEFAULT_OPENAI_CODEX_SEARCH_CONTEXT_SIZE).volatile(),
  searchMaxOutputTokens: z.number().step(1).min(1).default(DEFAULT_OPENAI_CODEX_SEARCH_MAX_OUTPUT_TOKENS).volatile(),
})
