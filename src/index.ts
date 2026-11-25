/**
 * ChatGPT OAuth and Codex models for DeepSeek Harness, with opt-in search and
 * image tooling.
 * @module dsh-codex-connect
 */

import './features/provider/message-source.ts'
import type { Context, Fiber } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { deepEqualJson } from '@deepseek-ai/dsh-util-values'
import type {} from '@deepseek-ai/dsh-attachment'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-web'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-settings'
import {
  OPENAI_CODEX_SETTINGS_NAMESPACE,
  resolveOpenAICodexSettings,
} from './shared/settings.ts'
import type { OpenAICodexSettingsInput } from './shared/settings.ts'
import { OpenAICodexCredentialStore, OPENAI_CODEX_PROVIDER } from './platform/auth/store.ts'
import { OpenAICodexBackendRequests } from './platform/http/backend-request.ts'
import { OPENAI_CODEX_TRUSTED_ORIGINS_FILENAME, OpenAICodexTrustedOriginsStore } from './platform/http/trusted-origins.ts'
import { assertNoOpenAICodexProviderConflict } from './platform/runtime/doctor.ts'
import { registerOpenAICodexUpdateRoutes } from './platform/update/routes.ts'
import { OPENAI_CODEX_AUTHORIZATION_TIMEOUT_MS } from './features/auth/auth-flow.ts'
import { registerOpenAICodexAuthRoutes } from './features/auth/routes.ts'
import { OpenAICodexImageAssetStore } from './features/images/assets.ts'
import { registerOpenAICodexOriginalImageRoute } from './features/images/asset-routes.ts'
import { registerImageHandleBridge } from './features/images/inputs/handle-bridge.ts'
import { imageGenerateTool } from './features/images/tools/generate-tool.ts'
import { OpenAICodexTransport } from './features/images/transport.ts'
import type { OpenAICodexTransportV1 } from './features/images/transport.ts'
import { assertOpenAICodexContextWindowOverrides, createOpenAICodexAdapter, openAICodexModelCatalog } from './features/provider/adapter.ts'
import { resolveOpenAICodexModelCatalog } from './features/provider/model-discovery.ts'
import { registerOpenAICodexModelCatalogRoute } from './features/provider/model-routes.ts'
import { createConversationSpeedRegistry } from './features/provider/speed/conversation-speed.ts'
import { registerOpenAICodexFastModeDefaults } from './features/provider/speed/fast-mode-defaults.ts'
import { OpenAICodexQuotaState } from './features/quota/state.ts'
import { OpenAICodexSearchProvider } from './features/search/provider.ts'
import { selectOpenAICodexSearchRoute } from './features/search/route-override.ts'
import { Config, configValue } from './config.ts'
import type { VolatileConfig } from './config.ts'
import { CODEX_CONNECT_VERSION } from './version.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host-only image transport owned by the Codex Connect core fiber. */
    openaiCodexTransport: OpenAICodexTransportV1
  }
}

export { Config } from './config.ts'
export type { VolatileConfig } from './config.ts'
export { IMAGE_GENERATE_TOOL_NAME } from './features/images/tools/generate-tool.ts'
export {
  assertNoOpenAICodexProviderConflict,
  diagnoseOpenAICodex,
  openAICodexConflictMessage,
} from './platform/runtime/doctor.ts'
export type {
  OpenAICodexDiagnosticOptions,
  OpenAICodexDiagnosticReport,
} from './platform/runtime/doctor.ts'
export { OPENAI_CODEX_USAGE_URL, parseOpenAICodexUsage, readOpenAICodexRateLimits } from './features/quota/usage.ts'
export type {
  OpenAICodexCredits,
  OpenAICodexIndividualLimit,
  OpenAICodexRateLimit,
  OpenAICodexRateLimitWindow,
  OpenAICodexUsage,
} from './shared/auth.ts'
export {
  decodeOpenAICodexSettings,
  DEFAULT_OPENAI_CODEX_IMAGE_MODEL_HINT,
  DEFAULT_OPENAI_CODEX_SETTINGS,
  isValidOpenAICodexImageModelHint,
  isValidOpenAICodexContextWindowOverrides,
  OPENAI_CODEX_SETTINGS_NAMESPACE,
  resolveOpenAICodexSettings,
} from './shared/settings.ts'
export type {
  OpenAICodexSearchContextSize,
  OpenAICodexSearchMode,
  OpenAICodexSettingsConfig,
} from './shared/settings.ts'
export {
  isOpenAICodexTransportError,
  OPENAI_CODEX_IMAGE_GENERATION_URL,
  OPENAI_CODEX_IMAGE_MAX_COUNT,
  OPENAI_CODEX_IMAGE_MAX_ERROR_BYTES,
  OPENAI_CODEX_IMAGE_MAX_RESPONSE_BYTES,
  OPENAI_CODEX_IMAGE_PROMPT_MAX_LENGTH,
  OPENAI_CODEX_IMAGE_REQUEST_TIMEOUT_MS,
  OPENAI_CODEX_TRANSPORT_API_VERSION,
  OPENAI_CODEX_TRANSPORT_ERROR_CODES,
  OPENAI_CODEX_TRANSPORT_SERVICE,
  OpenAICodexTransport,
  OpenAICodexTransportError,
} from './features/images/transport.ts'
export type {
  GeneratedImagePayload,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageRequestContext,
  OpenAICodexTransportErrorCode,
  OpenAICodexTransportV1,
} from './features/images/transport.ts'
export { loginOpenAICodex, logoutOpenAICodex, openAICodexAuthStatus } from './platform/auth/oauth-client.ts'
export type { OpenAICodexAuthStatus } from './platform/auth/oauth-client.ts'
export {
  FastModeRegistry,
  OpenAICodexFastModeRegistry,
  isFastModeSessionId,
  OPENAI_CODEX_FAST_MODE_MAX_SESSIONS,
  OPENAI_CODEX_FAST_MODE_MAX_SESSION_ID_LENGTH,
} from './features/provider/speed/fast-mode.ts'
export { OPENAI_CODEX_FAST_MODE_PATH } from './shared/models.ts'
export {
  compareOpenAICodexVersions,
  OPENAI_CODEX_UPDATE_PATH,
  parseOpenAICodexUpdateResult,
  parseOpenAICodexVersion,
} from './shared/update.ts'
export type { OpenAICodexUpdateResult } from './shared/update.ts'
export { checkForOpenAICodexUpdate } from './platform/update/checker.ts'
export {
  OpenAICodexCredentialStore,
  OPENAI_CODEX_ACCOUNT_LIMIT,
  OPENAI_CODEX_AUTH_DOCUMENT_LIMIT,
  OPENAI_CODEX_AUTH_FILENAME,
  OPENAI_CODEX_AUTH_V1_BACKUP_SUFFIX,
  OPENAI_CODEX_PROVIDER,
  openAICodexAuthPath,
} from './platform/auth/store.ts'
export type { OpenAICodexAccountSummary } from './platform/auth/store.ts'
export {
  DEFAULT_OPENAI_CODEX_SEARCH_CONTEXT_SIZE,
  DEFAULT_OPENAI_CODEX_SEARCH_MAX_OUTPUT_TOKENS,
  DEFAULT_OPENAI_CODEX_SEARCH_MODE,
  DEFAULT_OPENAI_CODEX_SEARCH_MODEL,
  mapOpenAICodexSearchResponse,
  OpenAICodexSearchProvider,
  OPENAI_CODEX_BASE_URL,
  OPENAI_CODEX_SEARCH_PROVIDER,
  OPENAI_CODEX_SEARCH_URL,
} from './features/search/provider.ts'
export type {
  OpenAICodexSearchProviderOptions,
  OpenAICodexSearchRequestRecord,
} from './features/search/provider.ts'

/** Stable Cordis plugin name. */
export const name = 'llm-openai-codex'

/** The model registry required before the provider can register. */
export const inject = ['llm']

/** Branded Host settings namespace for Codex Connect capability configuration. */
export const OPENAI_CODEX_SETTINGS_NS = OPENAI_CODEX_SETTINGS_NAMESPACE

function readSettingsInput(config: Config | VolatileConfig): OpenAICodexSettingsInput {
  return Object.fromEntries(Object.entries({
    newSessionSpeedMode: configValue(config.newSessionSpeedMode),
    newSubagentSpeedMode: configValue(config.newSubagentSpeedMode),
    reasoningEffort: configValue(config.reasoningEffort),
    models: configValue(config.models),
    contextWindowOverrides: configValue(config.contextWindowOverrides),
    enableSearch: configValue(config.enableSearch),
    enableNativeCompaction: configValue(config.enableNativeCompaction),
    enableNewSessionFastMode: configValue(config.enableNewSessionFastMode),
    enableNewSubagentFastMode: configValue(config.enableNewSubagentFastMode),
    enableImageGeneration: configValue(config.enableImageGeneration),
    imageModelHint: configValue(config.imageModelHint),
    searchModel: configValue(config.searchModel),
    searchMode: configValue(config.searchMode),
    searchContextSize: configValue(config.searchContextSize),
    searchMaxOutputTokens: configValue(config.searchMaxOutputTokens),
  }).filter(([, value]) => value !== undefined)) as OpenAICodexSettingsInput
}

/**
 * Register the `openai-codex` LLM route with one provider-native OAuth store.
 * Search and image tooling are added only when their config flags are true.
 */
export function apply(ctx: Context, config: Config | VolatileConfig): void {
  const catalog = openAICodexModelCatalog()
  const current = (): OpenAICodexSettingsInput => readSettingsInput(config)
  const initial = current()
  resolveOpenAICodexSettings(initial)
  assertOpenAICodexContextWindowOverrides(initial.contextWindowOverrides ?? undefined, catalog)

  const backendRequests = new OpenAICodexBackendRequests()
  ctx.effect(() => () => backendRequests.dispose())

  const credentials = new OpenAICodexCredentialStore()
  const imageAssets = new OpenAICodexImageAssetStore()
  const trustedOrigins = new OpenAICodexTrustedOriginsStore(
    join(dirname(credentials.filename), OPENAI_CODEX_TRUSTED_ORIGINS_FILENAME),
  )
  const fastMode = createConversationSpeedRegistry(ctx)
  registerOpenAICodexFastModeDefaults(
    ctx,
    fastMode,
    () => resolveOpenAICodexSettings(current()),
  )
  const quota = new OpenAICodexQuotaState({
    credentials,
    backendRequests,
  })
  assertNoOpenAICodexProviderConflict(ctx.llm.listProviders().map(provider => provider.id))
  new OpenAICodexTransport(
    ctx,
    credentials,
    () => resolveOpenAICodexSettings(current()).imageModelHint,
    backendRequests,
  )
  const adapter = createOpenAICodexAdapter(credentials, () => ctx.get('attachments'), {
    fastMode,
    visibleModelIds: () => resolveOpenAICodexSettings(current()).models,
    contextWindowOverrides: () => resolveOpenAICodexSettings(current()).contextWindowOverrides,
    nativeCompactionEnabled: () => resolveOpenAICodexSettings(current()).enableNativeCompaction,
    backendRequests,
    imageEditingEnabled: () => resolveOpenAICodexSettings(current()).enableImageGeneration,
    retryPolicyConfig: config.retryPolicy,
    resolveReasoningEffort: () => resolveOpenAICodexSettings(current()).reasoningEffort,
  })
  ctx.llm.registerAdapter([OPENAI_CODEX_PROVIDER], adapter)
  registerImageHandleBridge(ctx, {
    enabled: () => configValue(config.enableImageGeneration) === true,
    tools: () => configValue(config.imageHandleBridgeTools),
  })

  ctx.inject(['webServer'], webCtx => {
    registerOpenAICodexUpdateRoutes(webCtx, { currentVersion: CODEX_CONNECT_VERSION }, trustedOrigins)
    registerOpenAICodexModelCatalogRoute(webCtx, () => resolveOpenAICodexModelCatalog(adapter), trustedOrigins)
  })
  ctx.inject(['webServer', 'connection'], webCtx => {
    registerOpenAICodexAuthRoutes(
      webCtx,
      credentials,
      trustedOrigins,
      fastMode,
      configValue(config.oauthTimeoutMs) ?? OPENAI_CODEX_AUTHORIZATION_TIMEOUT_MS,
      quota,
    )
    registerOpenAICodexOriginalImageRoute(webCtx, trustedOrigins, imageAssets)
  })

  let stopped = false
  let searchFiber: Fiber | undefined
  let searchRegistration: object | undefined
  let searchTail = Promise.resolve()
  let imageGenerationFiber: Fiber | undefined
  let imageGenerationTail = Promise.resolve()

  const reconcileSearch = async (): Promise<void> => {
    if (stopped) return
    const resolved = resolveOpenAICodexSettings(current())
    const nextRegistration = resolved.enableSearch
      ? {
          model: resolved.searchModel,
          mode: resolved.searchMode,
          contextSize: resolved.searchContextSize,
          maxOutputTokens: resolved.searchMaxOutputTokens,
        }
      : undefined
    if (deepEqualJson(nextRegistration, searchRegistration)) return
    const previous = searchFiber
    searchFiber = undefined
    searchRegistration = undefined
    if (previous !== undefined) await previous.dispose()
    if (stopped || nextRegistration === undefined) return
    const fiber = ctx.inject(['web'], webCtx => {
      const provider = new OpenAICodexSearchProvider({
        credentials,
        model: nextRegistration.model,
        mode: nextRegistration.mode,
        contextSize: nextRegistration.contextSize,
        maxOutputTokens: nextRegistration.maxOutputTokens,
        resolveRequestId: () => String(webCtx.get('agents')?.currentInitiator()?.session.id ?? randomUUID()),
        backendRequests,
      })
      const unregister = webCtx.web.registerSearchProvider(provider)
      try {
        const restoreRoute = selectOpenAICodexSearchRoute(webCtx.web, provider.id)
        return () => {
          try { restoreRoute() } finally { unregister() }
        }
      } catch (error) {
        unregister()
        throw error
      }
    })
    searchFiber = fiber
    searchRegistration = nextRegistration
    void Promise.resolve(fiber).catch((error: unknown) => {
      if (searchFiber === fiber) {
        searchFiber = undefined
        searchRegistration = undefined
      }
      ctx.logger.error('dsh-codex-connect: optional search provider failed to activate')
      ctx.logger.error(error)
    })
  }

  const reconcileImageGeneration = async (): Promise<void> => {
    if (stopped) return
    const enabled = resolveOpenAICodexSettings(current()).enableImageGeneration
    if (enabled === (imageGenerationFiber !== undefined)) return
    const previous = imageGenerationFiber
    imageGenerationFiber = undefined
    if (previous !== undefined) await previous.dispose()
    if (stopped || !enabled) return
    const fiber = ctx.inject(['tools', 'attachments'], toolCtx => toolCtx.tools.register(imageGenerateTool(toolCtx, imageAssets)))
    imageGenerationFiber = fiber
    void Promise.resolve(fiber).catch((error: unknown) => {
      if (imageGenerationFiber === fiber) imageGenerationFiber = undefined
      ctx.logger.error('dsh-codex-connect: optional image generation tool failed to activate')
      ctx.logger.error(error)
    })
  }

  const scheduleCapabilities = (): void => {
    searchTail = searchTail.then(reconcileSearch, reconcileSearch).catch((error: unknown) => {
      ctx.logger.error('dsh-codex-connect: could not apply the updated search configuration')
      ctx.logger.error(error)
    })
    imageGenerationTail = imageGenerationTail.then(reconcileImageGeneration, reconcileImageGeneration).catch((error: unknown) => {
      ctx.logger.error('dsh-codex-connect: could not apply the updated image-generation configuration')
      ctx.logger.error(error)
    })
  }

  ctx.effect(() => async () => {
    stopped = true
    backendRequests.dispose()
    await quota.dispose()
    await Promise.all([searchTail, imageGenerationTail])
    const search = searchFiber
    const imageGeneration = imageGenerationFiber
    searchFiber = undefined
    imageGenerationFiber = undefined
    await Promise.allSettled([
      search?.dispose() ?? Promise.resolve(),
      imageGeneration?.dispose() ?? Promise.resolve(),
    ])
  }, 'dsh-codex-connect: optional capability lifecycle')

  ctx.on('loader/volatile-update', () => {
    quota.invalidate()
    scheduleCapabilities()
  })
  ctx.inject(['settings'], settingsCtx => {
    settingsCtx.effect(
      () => settingsCtx.settings.configure({ auto: false }, ctx.fiber),
      'dsh-codex-connect: custom settings page policy',
    )
  })
  scheduleCapabilities()
}
