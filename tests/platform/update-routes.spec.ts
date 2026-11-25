import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { httpRouteTestContext, rejectedHttpAdmissions } from '../support/http-route-test-context.ts'
import type { CapturedHttpRoute, TestHttpAdmission } from '../support/http-route-test-context.ts'
import {
  OPENAI_CODEX_UPDATE_PATH,
  registerOpenAICodexUpdateRoutes,
} from '../../src/platform/update/routes.ts'
import type { OpenAICodexTrustedOriginsStore } from '../../src/platform/http/trusted-origins.ts'
import {
  OPENAI_CODEX_GITHUB_LATEST_RELEASE_URL,
  OPENAI_CODEX_NPM_METADATA_URL,
  openAICodexGitHubRawPackageUrl,
} from '../../src/platform/update/checker.ts'

const trustedOrigins = { has: async () => false } as unknown as OpenAICodexTrustedOriginsStore

function capture(
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response>,
  admission: TestHttpAdmission = 'allow',
  dshVersion: string | null = '0.2.2-rc.5',
): CapturedHttpRoute {
  const { ctx, routes } = httpRouteTestContext({ admission })
  registerOpenAICodexUpdateRoutes(ctx, { currentVersion: '0.2.0', dshVersion, fetchImpl }, trustedOrigins)
  const route = [...routes.values()].find(candidate => candidate.path === OPENAI_CODEX_UPDATE_PATH)
  if (route === undefined) throw new Error('update route was not registered')
  return route
}

function request(method = 'GET', remoteAddress = '127.0.0.1'): IncomingMessage {
  return {
    method,
    socket: { remoteAddress },
    headers: { host: '127.0.0.1:3081' },
  } as unknown as IncomingMessage
}

function response(): ServerResponse & { observed: { status: number | undefined; body: string | undefined } } {
  const observed: { status: number | undefined; body: string | undefined } = { status: undefined, body: undefined }
  return {
    observed,
    writeHead(status: number) {
      observed.status = status
      return this
    },
    end(body?: string) {
      observed.body = body
      return this
    },
  } as unknown as ServerResponse & { observed: { status: number | undefined; body: string | undefined } }
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
}

describe('Codex Connect update route', () => {
  it.each(rejectedHttpAdmissions)('leaves the public update route Origin-only when Connection is $admission', async ({ admission }) => {
    const fixture = httpRouteTestContext({ admission })
    const fetchImpl = vi.fn(async () => json({}, 503))
    registerOpenAICodexUpdateRoutes(fixture.ctx, { currentVersion: '0.2.0', fetchImpl }, trustedOrigins)
    const res = response()
    await fixture.routes.get(`exact:${OPENAI_CODEX_UPDATE_PATH}`)!.handler(request(), res)
    expect(res.observed.status).toBe(200)
    expect(fetchImpl).toHaveBeenCalled()
    expect(fixture.requestRejection).not.toHaveBeenCalled()
  })

  it('releases the update route on normal disposal and preserves unrelated routes', async () => {
    const fixture = httpRouteTestContext()
    const unrelated: CapturedHttpRoute = { kind: 'exact', path: '/unrelated', handler: () => undefined }
    fixture.webServer.register(unrelated)
    registerOpenAICodexUpdateRoutes(fixture.ctx, { currentVersion: '0.2.0' }, trustedOrigins)
    await fixture.ctx.fiber.dispose()
    expect([...fixture.routes.values()]).toEqual([unrelated])
    expect(fixture.disposedPaths).toEqual([OPENAI_CODEX_UPDATE_PATH])
  })

  it('returns a safe update result from npm or GitHub fallback for trusted loopback GETs', async () => {
    const fetchMock = vi.fn(async (url: string): Promise<Response> => {
      if (url === OPENAI_CODEX_NPM_METADATA_URL) return json({ error: 'Not found' }, 404)
      if (url === OPENAI_CODEX_GITHUB_LATEST_RELEASE_URL) return json({ tag_name: 'v0.2.1' })
      expect(url).toBe(openAICodexGitHubRawPackageUrl('0.2.1'))
      return json({ engines: { dsh: '>=0.2.3' } })
    })
    const route = capture(fetchMock)
    const res = response()
    await route.handler(request(), res)

    expect(res.observed.status).toBe(200)
    expect(JSON.parse(res.observed.body ?? 'null')).toEqual({
      status: 'update-available',
      currentVersion: '0.2.0',
      latestVersion: '0.2.1',
      releaseUrl: 'https://github.com/shuind/dsh-codex-connect/releases/tag/v0.2.1',
      dshVersion: '0.2.2-rc.5',
      requiredDsh: '>=0.2.3',
      dshCompatible: false,
    })
    expect(JSON.parse(res.observed.body ?? 'null')).not.toHaveProperty('credential')
  })

  it.each(['throw', 'reject'] as const)('fails closed before network when a remote Origin store lookup will %s', async mode => {
    const fixture = httpRouteTestContext()
    const fetchImpl = vi.fn()
    const has = vi.fn(mode === 'throw'
      ? () => { throw new Error('/private/origin-store') }
      : async () => { throw new Error('/private/origin-store') })
    registerOpenAICodexUpdateRoutes(fixture.ctx, { currentVersion: '0.2.0', fetchImpl }, { has } as unknown as OpenAICodexTrustedOriginsStore)
    const req = request('GET', '192.168.1.9')
    req.headers.host = '192.168.1.8:3081'
    req.headers.origin = 'http://192.168.1.8:3081'
    const res = response()
    await fixture.routes.get(`exact:${OPENAI_CODEX_UPDATE_PATH}`)!.handler(req, res)
    expect(has).toHaveBeenCalledWith('http://192.168.1.8:3081')
    expect(res.observed.status).toBe(403)
    expect(JSON.parse(res.observed.body ?? 'null')).toEqual({ error: 'forbidden' })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(res.observed.body).not.toContain('/private')
  })

  it('rejects wrong methods and non-loopback peers before network access', async () => {
    const fetchMock = vi.fn(async (): Promise<Response> => json({ latest: '0.2.1' }))
    const route = capture(fetchMock)
    const wrongMethod = response()
    await route.handler(request('POST'), wrongMethod)
    expect(wrongMethod.observed.status).toBe(405)
    expect(fetchMock).not.toHaveBeenCalled()

    const remote = response()
    await route.handler(request('GET', '192.168.1.9'), remote)
    expect(remote.observed.status).toBe(403)
    expect(JSON.parse(remote.observed.body ?? 'null')).toEqual({ error: 'remote-web-origin-not-trusted' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
