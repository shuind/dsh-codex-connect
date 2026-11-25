/** Same-origin Web routes for OpenAI Codex OAuth, accounts, and conversation speed. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import {
  OPENAI_CODEX_AUTH_ACCOUNTS_PATH,
  OPENAI_CODEX_AUTH_CALLBACK_PATH,
  OPENAI_CODEX_AUTH_CANCEL_PATH,
  OPENAI_CODEX_AUTH_LOGIN_PATH,
  OPENAI_CODEX_AUTH_LOGOUT_PATH,
  OPENAI_CODEX_AUTH_STATUS_PATH,
  publicAuthError as safeMessage,
} from '../../shared/auth.ts'
import { OPENAI_CODEX_FAST_MODE_PATH, OPENAI_CODEX_SPEED_MODE_PATH, isOpenAICodexSpeedMode } from '../../shared/models.ts'
import {
  harnessHttpRejection,
  isJsonContentType,
  jsonResponse as json,
  OPENAI_CODEX_FAST_MODE_BODY_LIMIT,
  readSmallJsonBody,
  REMOTE_WEB_ORIGIN_NOT_TRUSTED,
  trustedRequest,
  trustedRequestDecision,
} from '../../platform/http/request-guard.ts'
import type { TrustedRequestDecision } from '../../platform/http/request-guard.ts'
import { OPENAI_CODEX_TRUSTED_ORIGINS_FILENAME, OpenAICodexTrustedOriginsStore } from '../../platform/http/trusted-origins.ts'
import type { OpenAICodexProxyManager } from '../../platform/http/proxy-manager.ts'
import { FastModeRegistry, isFastModeSessionId } from '../provider/speed/fast-mode.ts'
import { ConversationSpeedRegistry, createConversationSpeedRegistry } from '../provider/speed/conversation-speed.ts'
import type { OpenAICodexQuotaState } from '../quota/state.ts'
import type { OpenAICodexCredentialStore } from '../../platform/auth/store.ts'
import {
  OPENAI_CODEX_AUTH_URL_TIMEOUT_MS,
  OPENAI_CODEX_AUTHORIZATION_TIMEOUT_MS,
  OpenAICodexWebAuth,
} from './auth-flow.ts'
import type { OpenAICodexWebAuthOptions, OpenAICodexWebAuthStatus } from './auth-flow.ts'

export {
  OPENAI_CODEX_AUTH_ACCOUNTS_PATH,
  OPENAI_CODEX_AUTH_CALLBACK_PATH,
  OPENAI_CODEX_AUTH_CANCEL_PATH,
  OPENAI_CODEX_AUTH_LOGIN_PATH,
  OPENAI_CODEX_AUTH_LOGOUT_PATH,
  OPENAI_CODEX_AUTH_STATUS_PATH,
  OPENAI_CODEX_AUTH_URL_TIMEOUT_MS,
  OPENAI_CODEX_AUTHORIZATION_TIMEOUT_MS,
  OPENAI_CODEX_FAST_MODE_BODY_LIMIT,
  OPENAI_CODEX_FAST_MODE_PATH,
  OpenAICodexWebAuth,
  REMOTE_WEB_ORIGIN_NOT_TRUSTED,
  trustedRequest,
  trustedRequestDecision,
}
export type { OpenAICodexWebAuthOptions, OpenAICodexWebAuthStatus, TrustedRequestDecision }

function fastModeSessionIdFromQuery(req: IncomingMessage): string | undefined {
  const rawUrl = req.url
  if (typeof rawUrl !== 'string') return undefined
  try {
    const values = new URL(rawUrl, 'http://dsh.invalid').searchParams.getAll('sessionId')
    return values.length === 1 && isFastModeSessionId(values[0]) ? values[0] : undefined
  } catch {
    return undefined
  }
}

function fastModeBody(value: unknown): { sessionId: string; enabled: boolean } | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (Object.keys(record).length !== 2) return undefined
  return isFastModeSessionId(record['sessionId']) && typeof record['enabled'] === 'boolean'
    ? { sessionId: record['sessionId'], enabled: record['enabled'] }
    : undefined
}

function accountKey(value: unknown): string | undefined {
  return typeof value === 'string' && /^acct_[A-Za-z0-9_-]{43}$/u.test(value) ? value : undefined
}

function activateAccountBody(value: unknown): { accountKey: string } | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (Object.keys(record).length !== 1) return undefined
  const parsed = accountKey(record['accountKey'])
  return parsed === undefined ? undefined : { accountKey: parsed }
}

function removeAccountBody(value: unknown): { accountKey: string; replacementAccountKey?: string } | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (Object.keys(record).some(key => key !== 'accountKey' && key !== 'replacementAccountKey')) return undefined
  const selected = accountKey(record['accountKey'])
  if (selected === undefined) return undefined
  if (record['replacementAccountKey'] === undefined) return { accountKey: selected }
  const replacement = accountKey(record['replacementAccountKey'])
  return replacement === undefined ? undefined : { accountKey: selected, replacementAccountKey: replacement }
}

function accountMutationError(error: unknown): { status: number; error: string } {
  const message = safeMessage(error)
  if (/account not found/u.test(message)) return { status: 404, error: message }
  if (/requires replacementAccountKey|only valid when removing/u.test(message)) return { status: 409, error: message }
  return { status: 500, error: message }
}

/** Register the plugin-owned OAuth and conversation speed routes when the Web server is composed. */
export function registerOpenAICodexAuthRoutes(
  ctx: Context,
  store: OpenAICodexCredentialStore,
  trustedOriginsOverride?: OpenAICodexTrustedOriginsStore,
  fastModeOverride?: FastModeRegistry,
  proxyManager?: OpenAICodexProxyManager,
  resolveProxyUrl?: () => string | undefined,
  authorizationTimeoutMs?: number,
  quotaState?: OpenAICodexQuotaState,
): void {
  const storedFilename = (store as OpenAICodexCredentialStore & { filename?: unknown }).filename
  const fastMode = fastModeOverride ?? createConversationSpeedRegistry(ctx)
  const trustedOrigins = trustedOriginsOverride ?? (typeof storedFilename === 'string'
    ? new OpenAICodexTrustedOriginsStore(join(dirname(storedFilename), OPENAI_CODEX_TRUSTED_ORIGINS_FILENAME))
    : new OpenAICodexTrustedOriginsStore())

  ctx.effect(function* () {
    const auth = new OpenAICodexWebAuth(store, { proxyManager, resolveProxyUrl, authorizationTimeoutMs, quotaState })
    yield () => auth.dispose()

    const authorize = async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
      const rejection = harnessHttpRejection(ctx, req)
      if (rejection !== undefined) {
        json(res, rejection.status, { error: rejection.error })
        return false
      }
      const decision = await trustedRequestDecision(req, trustedOrigins)
      if (decision.trusted) return true
      json(res, 403, { error: decision.error })
      return false
    }

    yield ctx.webServer.register({
      kind: 'exact', path: OPENAI_CODEX_AUTH_STATUS_PATH,
      handler: async (req, res) => {
        if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' })
        if (!await authorize(req, res)) return
        const snapshot = await store.captureActiveAccount()
        const [status, accounts] = await Promise.all([auth.status(snapshot), snapshot.accounts()])
        json(res, 200, { ...status, accounts })
      },
    })

    yield ctx.webServer.register({
      kind: 'exact', path: OPENAI_CODEX_AUTH_LOGIN_PATH,
      handler: async (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' })
        if (!await authorize(req, res)) return
        try {
          if (fastMode instanceof ConversationSpeedRegistry) fastMode.invalidateAccountSelections()
          json(res, 200, await auth.signIn())
        } catch (error: unknown) {
          json(res, 500, { error: safeMessage(error) })
        }
      },
    })

    yield ctx.webServer.register({
      kind: 'exact', path: OPENAI_CODEX_AUTH_CALLBACK_PATH,
      handler: async (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' })
        if (!await authorize(req, res)) return
        if (!isJsonContentType(req)) return json(res, 415, { error: 'unsupported content type' })
        try {
          const raw = await readSmallJsonBody(req)
          if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return json(res, 400, { error: 'invalid input' })
          const body = raw as Record<string, unknown>
          if (Object.keys(body).length !== 1 || typeof body['callbackUrl'] !== 'string') return json(res, 400, { error: 'invalid input' })
          const status = auth.submitCallback(body['callbackUrl'])
          return json(res, status, status === 200 ? { ok: true } : {
            error: status === 409 ? 'manual callback unavailable' : 'invalid callback URL',
          })
        } catch (error: unknown) {
          return json(res, error instanceof RangeError ? 413 : 400, {
            error: error instanceof RangeError ? 'request body too large' : 'invalid input',
          })
        }
      },
    })

    yield ctx.webServer.register({
      kind: 'exact', path: OPENAI_CODEX_AUTH_CANCEL_PATH,
      handler: async (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' })
        if (!await authorize(req, res)) return
        try {
          await auth.cancel()
          json(res, 200, await auth.status())
        } catch (error: unknown) {
          json(res, 500, { error: safeMessage(error) })
        }
      },
    })

    yield ctx.webServer.register({
      kind: 'exact', path: OPENAI_CODEX_AUTH_LOGOUT_PATH,
      handler: async (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' })
        if (!await authorize(req, res)) return
        try {
          if (fastMode instanceof ConversationSpeedRegistry) fastMode.invalidateAccountSelections()
          await auth.signOut()
          json(res, 200, { ok: true })
        } catch (error: unknown) {
          json(res, 500, { error: safeMessage(error) })
        }
      },
    })

    yield ctx.webServer.register({
      kind: 'exact', path: OPENAI_CODEX_AUTH_ACCOUNTS_PATH,
      handler: async (req, res) => {
        if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'DELETE') return json(res, 405, { error: 'method not allowed' })
        if (!await authorize(req, res)) return
        if (req.method === 'GET') return json(res, 200, { accounts: await store.accounts() })
        if (!isJsonContentType(req)) return json(res, 415, { error: 'unsupported content type' })
        try {
          const raw = await readSmallJsonBody(req)
          if (req.method === 'POST') {
            const body = activateAccountBody(raw)
            if (body === undefined) return json(res, 400, { error: 'invalid input' })
            if (fastMode instanceof ConversationSpeedRegistry) fastMode.invalidateAccountSelections()
            return json(res, 200, await auth.activateAccount(body.accountKey))
          }
          const body = removeAccountBody(raw)
          if (body === undefined) return json(res, 400, { error: 'invalid input' })
          if (fastMode instanceof ConversationSpeedRegistry) fastMode.invalidateAccountSelections()
          return json(res, 200, await auth.removeAccount(body.accountKey, body.replacementAccountKey))
        } catch (error: unknown) {
          if (error instanceof RangeError) return json(res, 413, { error: 'request body too large' })
          if (error instanceof TypeError) return json(res, 400, { error: 'invalid input' })
          const mapped = accountMutationError(error)
          return json(res, mapped.status, { error: mapped.error })
        }
      },
    })

    yield ctx.webServer.register({
      kind: 'exact', path: OPENAI_CODEX_FAST_MODE_PATH,
      handler: async (req, res) => {
        if (req.method !== 'GET' && req.method !== 'POST') return json(res, 405, { error: 'method not allowed' })
        if (!await authorize(req, res)) return
        if (req.method === 'GET') {
          const sessionId = fastModeSessionIdFromQuery(req)
          if (sessionId === undefined) return json(res, 400, { error: 'invalid input' })
          if (fastMode instanceof ConversationSpeedRegistry && fastMode.isUltrafastSelected(sessionId)) {
            return json(res, 409, { error: 'use the conversation speed control for Ultrafast' })
          }
          return json(res, 200, { enabled: fastMode.isEnabled(sessionId) })
        }
        if (!isJsonContentType(req)) return json(res, 415, { error: 'unsupported content type' })
        try {
          const body = fastModeBody(await readSmallJsonBody(req))
          if (body === undefined) return json(res, 400, { error: 'invalid input' })
          fastMode.set(body.sessionId, body.enabled)
          return json(res, 200, { enabled: fastMode.isEnabled(body.sessionId) })
        } catch (error: unknown) {
          return json(res, error instanceof RangeError ? 413 : 400, {
            error: error instanceof RangeError ? 'request body too large' : 'invalid input',
          })
        }
      },
    })

    yield ctx.webServer.register({
      kind: 'exact', path: OPENAI_CODEX_SPEED_MODE_PATH,
      handler: async (req, res) => {
        if (req.method !== 'GET' && req.method !== 'POST') return json(res, 405, { error: 'method not allowed' })
        if (!await authorize(req, res)) return
        if (!(fastMode instanceof ConversationSpeedRegistry)) return json(res, 503, { error: 'speed selection unavailable' })
        const scoped = async (sessionId: string, model: string) => ({
          workspace: fastMode.workspaceFor(sessionId),
          accountKey: (await store.accounts()).find(account => account.active)?.accountKey,
          provider: 'openai-codex',
          model,
        })
        const modelId = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 256
        const generationId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/u.test(value)
        try {
          if (req.method === 'GET') {
            const sessionId = fastModeSessionIdFromQuery(req)
            const models = new URL(req.url ?? '', 'http://dsh.invalid').searchParams.getAll('model')
            if (sessionId === undefined || models.length !== 1 || !modelId(models[0])) return json(res, 400, { error: 'invalid input' })
            return json(res, 200, fastMode.readSpeed(sessionId, await scoped(sessionId, models[0])))
          }
          if (!isJsonContentType(req)) return json(res, 415, { error: 'unsupported content type' })
          const raw = await readSmallJsonBody(req)
          if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return json(res, 400, { error: 'invalid input' })
          const body = raw as Record<string, unknown>
          const sessionId = body['sessionId'], generation = body['generation']
          if (!isFastModeSessionId(sessionId) || !generationId(generation)) return json(res, 400, { error: 'invalid input' })
          const mode = body['mode'], model = body['model'], revision = body['revision']
          if (Object.keys(body).sort().join(',') !== 'generation,mode,model,revision,sessionId'
            || !modelId(model) || !isOpenAICodexSpeedMode(mode) || !Number.isSafeInteger(revision) || Number(revision) < 0) {
            return json(res, 400, { error: 'invalid input' })
          }
          return json(res, 200, fastMode.selectSpeed(sessionId, await scoped(sessionId, model), generation, Number(revision), mode))
        } catch (error: unknown) {
          if (error instanceof RangeError) return json(res, 413, { error: 'request body too large' })
          if (error instanceof TypeError) {
            const code = error.message
            if (['SPEED_SELECTION_STALE', 'ULTRAFAST_SIGN_IN_REQUIRED', 'ULTRAFAST_SELECTION_UNAVAILABLE'].includes(code)) return json(res, 409, { error: code })
            if (code === 'ULTRAFAST_MODEL_UNSUPPORTED') return json(res, 400, { error: code })
            return json(res, 400, { error: 'invalid input' })
          }
          return json(res, 503, { error: 'speed selection unavailable' })
        }
      },
    })
  }, 'dsh-codex-connect: Web OAuth routes')
}
