/** Shared HTTP authentication, origin-trust guard, and bounded JSON helpers. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import { OpenAICodexTrustedOriginsStore, normalizeTrustedOrigin } from './trusted-origins.ts'

/** Stable, non-sensitive error returned when a browser origin needs CLI trust. */
export const REMOTE_WEB_ORIGIN_NOT_TRUSTED = 'remote-web-origin-not-trusted'
export const OPENAI_CODEX_FAST_MODE_BODY_LIMIT = 4_096

export interface HarnessHttpRejection {
  status: 401 | 403 | 503
  error: 'DSH_BROWSER_AUTH_REQUIRED' | 'forbidden' | 'DSH_CONNECTION_UNAVAILABLE'
}

/** Resolve the current Connection on each request; never retain a stale authentication service. */
export function harnessHttpRejection(ctx: Context, request: IncomingMessage): HarnessHttpRejection | undefined {
  try {
    const connection = ctx.get('connection')
    if (connection !== undefined) {
      const rejected = connection.requestRejection(request)
      if (rejected === undefined) return undefined
      if (rejected === 401 || rejected === 403) {
        return { status: rejected, error: rejected === 401 ? 'DSH_BROWSER_AUTH_REQUIRED' : 'forbidden' }
      }
    }
  } catch {
    // Inactive dependencies and authentication failures must not become an unauthenticated fallback.
  }
  return { status: 503, error: 'DSH_CONNECTION_UNAVAILABLE' }
}

function loopbackHost(rawHost: string): boolean {
  if (/[\\/@?#]/u.test(rawHost)) return false
  try {
    const parsed = new URL(`http://${rawHost}`)
    if (parsed.username !== '' || parsed.password !== '' || parsed.pathname !== '/' || parsed.search !== '' || parsed.hash !== '') return false
    const bracketless = parsed.hostname.startsWith('[') && parsed.hostname.endsWith(']')
      ? parsed.hostname.slice(1, -1)
      : parsed.hostname
    const hostname = bracketless.toLowerCase().replace(/\.$/u, '')
    return hostname === 'localhost'
      || hostname.endsWith('.localhost')
      || hostname === '127.0.0.1'
      || hostname === '::1'
      || hostname === '::ffff:127.0.0.1'
  } catch {
    return false
  }
}

function effectiveOrigin(req: IncomingMessage, rawHost: string): string | undefined {
  try {
    const encrypted = (req.socket as IncomingMessage['socket'] & { encrypted?: boolean }).encrypted === true
    return normalizeTrustedOrigin(`${encrypted ? 'https' : 'http'}://${rawHost}`)
  } catch {
    return undefined
  }
}

function sameOriginMetadata(req: IncomingMessage, host: string): boolean {
  const origin = req.headers.origin
  if (origin === undefined) return true
  if (typeof origin !== 'string') return false
  try {
    return normalizeTrustedOrigin(origin) === effectiveOrigin(req, host)
  } catch {
    return false
  }
}

export type TrustedRequestDecision =
  | { trusted: true; error?: undefined }
  | { trusted: false; error: typeof REMOTE_WEB_ORIGIN_NOT_TRUSTED | 'forbidden' }

/** Evaluate one request against loopback defaults and the current sidecar. */
export async function trustedRequestDecision(
  req: IncomingMessage,
  trustedOrigins: OpenAICodexTrustedOriginsStore = new OpenAICodexTrustedOriginsStore(),
): Promise<TrustedRequestDecision> {
  const remote = req.socket.remoteAddress
  const localPeer = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1'
  const fetchSite: unknown = req.headers['sec-fetch-site']
  const crossSite = typeof fetchSite === 'string'
    ? fetchSite.trim().toLowerCase() === 'cross-site'
    : Array.isArray(fetchSite) && fetchSite.some(value => value.trim().toLowerCase() === 'cross-site')
  if (crossSite) return { trusted: false, error: 'forbidden' }
  const host = req.headers.host
  if (typeof host !== 'string') return { trusted: false, error: 'forbidden' }
  const origin = effectiveOrigin(req, host)
  if (origin === undefined) return { trusted: false, error: 'forbidden' }
  if (!sameOriginMetadata(req, host)) return { trusted: false, error: 'forbidden' }
  if (localPeer && loopbackHost(host)) return { trusted: true }
  try {
    if (await trustedOrigins.has(origin)) return { trusted: true }
  } catch {
    return { trusted: false, error: 'forbidden' }
  }
  return { trusted: false, error: REMOTE_WEB_ORIGIN_NOT_TRUSTED }
}

/** Whether a request is currently trusted; the sidecar is read on every call. */
export async function trustedRequest(
  req: IncomingMessage,
  trustedOrigins?: OpenAICodexTrustedOriginsStore,
): Promise<boolean> {
  return (await trustedRequestDecision(req, trustedOrigins)).trusted
}

export function jsonResponse(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(JSON.stringify(value))
}

export function requestHeader(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name]
  return Array.isArray(value) ? value[0] : value
}

export function isJsonContentType(req: IncomingMessage): boolean {
  const type = requestHeader(req, 'content-type')
  return type !== undefined && /^application\/json(?:\s*;|$)/iu.test(type.trim())
}

function contentLength(req: IncomingMessage): number | undefined {
  const raw = requestHeader(req, 'content-length')
  if (raw === undefined) return undefined
  if (!/^\d+$/u.test(raw.trim())) throw new TypeError('Request content length is invalid')
  const value = Number(raw)
  if (!Number.isSafeInteger(value)) throw new TypeError('Request content length is invalid')
  return value
}

/** Collect one small JSON body without exposing or logging its contents. */
export async function readSmallJsonBody(req: IncomingMessage, limit = OPENAI_CODEX_FAST_MODE_BODY_LIMIT): Promise<unknown> {
  const declared = contentLength(req)
  if (declared !== undefined && (!Number.isFinite(declared) || declared > limit)) {
    throw new RangeError('Request body is too large')
  }
  const chunks: Uint8Array[] = []
  let total = 0
  const iterable = req as unknown as AsyncIterable<Uint8Array | string>
  if (typeof (req as unknown as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === 'function') {
    for await (const chunk of iterable) {
      const bytes = typeof chunk === 'string' ? Buffer.from(chunk) : new Uint8Array(chunk)
      total += bytes.byteLength
      if (total > limit) throw new RangeError('Request body is too large')
      chunks.push(bytes)
    }
  } else {
    const body = (req as IncomingMessage & { body?: unknown }).body
    if (typeof body === 'string') {
      const bytes = Buffer.from(body)
      if (bytes.byteLength > limit) throw new RangeError('Request body is too large')
      chunks.push(bytes)
    } else if (body instanceof Uint8Array) {
      if (body.byteLength > limit) throw new RangeError('Request body is too large')
      chunks.push(new Uint8Array(body))
    } else if (body !== undefined) {
      throw new TypeError('Request body is invalid')
    }
  }
  const bytes = Buffer.concat(chunks.map(chunk => Buffer.from(chunk)))
  if (bytes.byteLength === 0) throw new TypeError('Request body is invalid')
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new TypeError('Request body is invalid')
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new TypeError('Request body is invalid')
  }
}
