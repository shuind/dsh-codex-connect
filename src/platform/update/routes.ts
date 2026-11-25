/** Same-origin update metadata route for the Codex Connect browser client. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { OpenAICodexTrustedOriginsStore } from '../http/trusted-origins.ts'
import { jsonResponse as json, trustedRequestDecision } from '../http/request-guard.ts'
import { OPENAI_CODEX_UPDATE_PATH } from '../../shared/update.ts'
import { checkForOpenAICodexUpdate, OPENAI_CODEX_UPDATE_TIMEOUT_MS } from './checker.ts'
import type { OpenAICodexUpdateResult } from './checker.ts'

export { OPENAI_CODEX_UPDATE_PATH }

interface UpdateRouteOptions {
  currentVersion: string
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>
  timeoutMs?: number
}

/** Register public update checking without opening OAuth credentials. */
export function registerOpenAICodexUpdateRoutes(
  ctx: Context,
  options: UpdateRouteOptions,
  trustedOrigins: OpenAICodexTrustedOriginsStore,
): void {
  ctx.effect(function* () {
    yield ctx.webServer.register({
      kind: 'exact',
      path: OPENAI_CODEX_UPDATE_PATH,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' })
        const decision = await trustedRequestDecision(req, trustedOrigins)
        if (!decision.trusted) return json(res, 403, { error: decision.error })
        let result: OpenAICodexUpdateResult
        try {
          result = await checkForOpenAICodexUpdate({
            currentVersion: options.currentVersion,
            ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
            timeoutMs: options.timeoutMs ?? OPENAI_CODEX_UPDATE_TIMEOUT_MS,
          })
        } catch {
          result = { status: 'unavailable', currentVersion: options.currentVersion, reason: 'registry-unavailable' }
        }
        return json(res, 200, result)
      },
    })
  }, 'dsh-codex-connect: update route')
}
