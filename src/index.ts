/**
 * ChatGPT OAuth and Codex models for DeepSeek Harness, with opt-in search and
 * image tooling.
 * @module dsh-codex-connect
 */

import './platform/http/undici-runtime.ts'
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
import type {} from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-settings'
import {
  OPENAI_CODEX_SETTINGS_NAMESPACE,
  resolveOpenAICodexProxyUrl,
  resolveOpenAICodexSettings,
} from './shared/settings.ts'
import type { OpenAICodexSettingsInput } from './shared/settings.ts'
import { OpenAICodexCredentialStore, OPENAI_CODEX_PROVIDER } from './platform/auth/store.ts'
import { OpenAICodexBackendRequests } from './platform/http/backend-request.ts'
import { OpenAICodexProxyManager } from './platform/http/proxy-manager.ts'
import { registerOpenAICodexProxyRoutes } from './platform/http/proxy-routes.ts'
import { OPENAI_CODEX_TRUSTED_ORIGINS_FILENAME, OpenAICodexTrustedOriginsStore } from './platform/http/trusted-origins.ts'
import { assertNoOpenAICodexProviderConflict } from './platform/runtime/doctor.ts'
import { registerOpenAICodexUpdateRoutes } from './platform/update/routes.ts'
import { OPENAI_CODEX_AUTHORIZATION_TIMEOUT_MS } from './features/auth/auth-flow.ts'
import { registerOpenAICodexAuthRoutes } from './features/auth/routes.ts'
import { OpenAICodexImageAssetStore } from './features/images/assets.ts'
import { registerOpenAICodexOriginalImageRoute } from './features/images/asset-routes.ts'
import { registerImageHandleBridge } from './features/images/inputs/handle-bridge.ts'
import { imageGenerateTool } from './features/images/tools/generate-tool.ts'
import { viewImageTool } from './features/images/tools/view-tool.ts'
import { OpenAICodexTransport } from './features/images/transport.ts'
import type { OpenAICodexTransportV1 } from './features/images/transport.ts'
import { assertOpenAICodexContextWindowOverrides, createOpenAICodexAdapter, openAICodexModelCatalog } from './features/provider/adapter.ts'
import { resolveOpenAICodexModelCatalog } from './features/provider/model-discovery.ts'
import { registerOpenAICodexModelCatalogRoute } from './features/provider/model-routes.ts'
import { createConversationSpeedRegistry } from './features/provider/speed/conversation-speed.ts'
import { registerOpenAICodexFastModeDefaults } from './features/provider/speed/fast-mode-defaults.ts'
import { OpenAICodexQuotaState } from './features/quota/state.ts'
import { quotaTool } from './features/quota/tool.ts'
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
export { VIEW_IMAGE_TOOL_NAME } from './features/images/tools/view-tool.ts'
export { IMAGE_GENERATE_TOOL_NAME } from './features/images/tools/generate-tool.ts'
export { QUOTA_TOOL_NAME } from './features/quota/tool.ts'
export {
  assertNoOpenAICodexProviderConflict,
  diagnoseOpenAICodex,
  openAICodexConflictMessage,
} from './platform/runtime/doctor.ts'
export type {
  OpenAICodexDiagnosticOptions,
  OpenAICodexDiagnosticReport,
} from './platform/runtime/doctor.ts'
export {
  assessCompatibility,
  COMPATIBILITY_CONTRACT,
  COMPATIBILITY_PACKAGES,
  COMPATIBILITY_SCHEMA_VERSION,
  detectCompatibility,
  DSH_PLUGIN_API_PACKAGES,
  PI_AI_PACKAGE,
  SUPPORTED_DSH_PLUGIN_API_VERSION,
  SUPPORTED_DSH_PLUGIN_API_VERSIONS,
  SUPPORTED_DSH_PLUGIN_API_RANGE,
  SUPPORTED_NODE_RANGE,
  SUPPORTED_PI_AI_RANGE,
  evaluateCompatibility,
} from './platform/runtime/compatibility.ts'
export type {
  CompatibilityDetectionOptions,
  CompatibilityEntry,
  CompatibilityEvaluationInput,
  CompatibilityPackageName,
  CompatibilityReport,
  CompatibilityStatus,
} from './platform/runtime/compatibility.ts'
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
  DEFAULT_OPENAI_CODEX_PROXY_URL,
  DEFAULT_OPENAI_CODEX_IMAGE_MODEL_HINT,
  DEFAULT_OPENAI_CODEX_SETTINGS,
  isValidOpenAICodexImageModelHint,
  isValidOpenAICodexContextWindowOverrides,
  isValidOpenAICodexProxyUrl,
  OPENAI_CODEX_PROXY_DETECT_PATH,
  OPENAI_CODEX_PROXY_TEST_PATH,
  OPENAI_CODEX_SETTINGS_NAMESPACE,
  resolveOpenAICodexProxyUrl,
  resolveOpenAICodexSettings,
} from './shared/settings.ts'
export type {
  OpenAICodexProxyProbeClassification,
  OpenAICodexProxyProbeResult,
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
export {
  detectOpenAICodexProxies,
  listOpenAICodexProxyCandidates,
  OPENAI_CODEX_LOCAL_PROXY_CANDIDATES,
  OPENAI_CODEX_PROXY_CANDIDATE_LIMIT,
  OPENAI_CODEX_PROXY_PROBE_TIMEOUT_MS,
  OPENAI_CODEX_PROXY_PROBE_URL,
  OpenAICodexProxyManager,
} from './platform/http/proxy-manager.ts'
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
    enableProxy: configValue(config.enableProxy),
    proxyUrl: configValue(config.proxyUrl),
    contextWindowOverrides: configValue(config.contextWindowOverrides),
    enableSearch: configValue(config.enableSearch),
    enableNativeCompaction: configValue(config.enableNativeCompaction),
    enableNewSessionFastMode: configValue(config.enableNewSessionFastMode),
    enableNewSubagentFastMode: configValue(config.enableNewSubagentFastMode),
    enableImageTool: configValue(config.enableImageTool),
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

  const proxyManager = new OpenAICodexProxyManager()
  const resolveProviderProxyUrl = (): string | undefined => resolveOpenAICodexProxyUrl(resolveOpenAICodexSettings(current()))
  const backendRequests = new OpenAICodexBackendRequests(proxyManager, resolveProviderProxyUrl)
  ctx.effect(() => () => backendRequests.dispose())

  let proxyWasActive = resolveProviderProxyUrl() !== undefined
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
    async () => (await credentials.accounts()).find(account => account.active)?.accountKey,
  )
  const quota = new OpenAICodexQuotaState({
    credentials,
    proxyManager,
    backendRequests,
    resolveProxyUrl: resolveProviderProxyUrl,
  })
  if (config.enableQuotaTool === true) {
    ctx.inject(['tools'], toolCtx => toolCtx.tools.register(quotaTool(quota)))
  }
  assertNoOpenAICodexProviderConflict(ctx.llm.listProviders().map(provider => provider.id))
  new OpenAICodexTransport(
    ctx,
    credentials,
    proxyManager,
    resolveProviderProxyUrl,
    () => resolveOpenAICodexSettings(current()).imageModelHint,
    backendRequests,
  )
  const adapter = createOpenAICodexAdapter(credentials, () => ctx.get('attachments'), {
    fastMode,
    visibleModelIds: () => resolveOpenAICodexSettings(current()).models,
    proxyManager,
    resolveProxyUrl: resolveProviderProxyUrl,
    contextWindowOverrides: () => resolveOpenAICodexSettings(current()).contextWindowOverrides,
    nativeCompactionEnabled: () => resolveOpenAICodexSettings(current()).enableNativeCompaction,
    backendRequests,
    imageEditingEnabled: () => resolveOpenAICodexSettings(current()).enableImageGeneration,
    preflightActivity: config.preflightActivity,
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
      proxyManager,
      resolveProviderProxyUrl,
      configValue(config.oauthTimeoutMs) ?? OPENAI_CODEX_AUTHORIZATION_TIMEOUT_MS,
      quota,
    )
    registerOpenAICodexProxyRoutes(webCtx, trustedOrigins, proxyManager)
    registerOpenAICodexOriginalImageRoute(webCtx, trustedOrigins, imageAssets)
  })

  let stopped = false
  let searchFiber: Fiber | undefined
  let searchRegistration: object | undefined
  let searchTail = Promise.resolve()
  let imageFiber: Fiber | undefined
  let imageTail = Promise.resolve()
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
        proxyManager,
        resolveProxyUrl: resolveProviderProxyUrl,
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

  const reconcileImageTool = async (): Promise<void> => {
    if (stopped) return
    const enabled = resolveOpenAICodexSettings(current()).enableImageTool
    if (enabled === (imageFiber !== undefined)) return
    const previous = imageFiber
    imageFiber = undefined
    if (previous !== undefined) await previous.dispose()
    if (stopped || !enabled) return
    const fiber = ctx.inject(['tools', 'fs', 'attachments'], toolCtx => toolCtx.tools.register(viewImageTool(toolCtx)))
    imageFiber = fiber
    void Promise.resolve(fiber).catch((error: unknown) => {
      if (imageFiber === fiber) imageFiber = undefined
      ctx.logger.error('dsh-codex-connect: optional view_image tool failed to activate')
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
    imageTail = imageTail.then(reconcileImageTool, reconcileImageTool).catch((error: unknown) => {
      ctx.logger.error('dsh-codex-connect: could not apply the updated image-tool configuration')
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
    await Promise.all([searchTail, imageTail, imageGenerationTail])
    const search = searchFiber
    const image = imageFiber
    const imageGeneration = imageGenerationFiber
    searchFiber = undefined
    imageFiber = undefined
    imageGenerationFiber = undefined
    await Promise.allSettled([
      search?.dispose() ?? Promise.resolve(),
      image?.dispose() ?? Promise.resolve(),
      imageGeneration?.dispose() ?? Promise.resolve(),
    ])
    await proxyManager.dispose()
  }, 'dsh-codex-connect: optional capability lifecycle')

  ctx.on('loader/volatile-update', () => {
    quota.invalidate()
    const proxyIsActive = resolveProviderProxyUrl() !== undefined
    if (proxyWasActive && !proxyIsActive) {
      void proxyManager.deactivate().catch((error: unknown) => {
        ctx.logger.error('dsh-codex-connect: could not deactivate the provider proxy')
        ctx.logger.error(error)
      })
    }
    proxyWasActive = proxyIsActive
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
