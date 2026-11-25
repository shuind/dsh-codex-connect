/** Network update checker: npm dist-tags first, GitHub Releases fallback. */

import {
  compareOpenAICodexVersions,
  normalizeOpenAICodexVersion,
  OPENAI_CODEX_GITHUB_LATEST_RELEASE_URL,
  OPENAI_CODEX_NPM_METADATA_URL,
  openAICodexReleaseUrl,
  parseOpenAICodexVersion,
} from '../../shared/update.ts'
import type { OpenAICodexUpdateResult } from '../../shared/update.ts'

export * from '../../shared/update.ts'

export const OPENAI_CODEX_UPDATE_TIMEOUT_MS = 8_000
export const OPENAI_CODEX_UPDATE_MAX_METADATA_BYTES = 64 * 1024
export const OPENAI_CODEX_UPDATE_MAX_RELEASE_BYTES = 64 * 1024

type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>

interface UpdateCheckOptions {
  currentVersion: string
  fetchImpl?: FetchImpl
  timeoutMs?: number
}

type SourceLookupResult =
  | { ok: true; latestVersion: string }
  | { ok: false; reason: 'registry-unavailable' | 'invalid-registry-response' }

function boundedText(value: string, maxBytes: number): string {
  if (new TextEncoder().encode(value).byteLength > maxBytes) throw new RangeError('update response is too large')
  return value
}

async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  if (response.body === null) return boundedText(await response.text(), maxBytes)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const chunks: string[] = []
  let total = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      total += next.value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        throw new RangeError('update response is too large')
      }
      chunks.push(decoder.decode(next.value, { stream: true }))
    }
    chunks.push(decoder.decode())
    return chunks.join('')
  } finally {
    reader.releaseLock()
  }
}

async function fetchBounded(
  fetchImpl: FetchImpl,
  url: string,
  maxBytes: number,
  timeoutMs: number,
  headers: Record<string, string>,
): Promise<{ response: Response; text: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => { controller.abort(new Error('update request timed out')) }, timeoutMs)
  try {
    const response = await fetchImpl(url, { headers, signal: controller.signal })
    const text = await readBoundedText(response, maxBytes)
    return { response, text }
  } finally {
    clearTimeout(timer)
  }
}

function registryCandidates(value: unknown): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return []
  const record = value as Record<string, unknown>
  const tags = record['dist-tags'] ?? record
  if (typeof tags !== 'object' || tags === null || Array.isArray(tags)) return []
  return ['latest', 'alpha']
    .map(tag => (tags as Record<string, unknown>)[tag])
    .filter((candidate): candidate is string => typeof candidate === 'string' && parseOpenAICodexVersion(candidate) !== undefined)
    .map(normalizeOpenAICodexVersion)
}

async function lookupNpmLatest(fetchImpl: FetchImpl, timeoutMs: number): Promise<SourceLookupResult> {
  try {
    const { response, text } = await fetchBounded(
      fetchImpl, OPENAI_CODEX_NPM_METADATA_URL, OPENAI_CODEX_UPDATE_MAX_METADATA_BYTES, timeoutMs,
      { accept: 'application/json' },
    )
    if (!response.ok) return { ok: false, reason: 'registry-unavailable' }
    const candidates = registryCandidates(JSON.parse(text) as unknown)
    if (candidates.length === 0) return { ok: false, reason: 'invalid-registry-response' }
    const latestVersion = candidates.reduce((best, candidate) => compareOpenAICodexVersions(candidate, best) > 0 ? candidate : best)
    return { ok: true, latestVersion }
  } catch (error: unknown) {
    return {
      ok: false,
      reason: error instanceof SyntaxError || error instanceof RangeError ? 'invalid-registry-response' : 'registry-unavailable',
    }
  }
}

async function lookupGitHubLatestRelease(fetchImpl: FetchImpl, timeoutMs: number): Promise<SourceLookupResult> {
  try {
    const { response, text } = await fetchBounded(
      fetchImpl, OPENAI_CODEX_GITHUB_LATEST_RELEASE_URL, OPENAI_CODEX_UPDATE_MAX_RELEASE_BYTES, timeoutMs,
      { accept: 'application/vnd.github+json' },
    )
    if (!response.ok) return { ok: false, reason: 'registry-unavailable' }
    const value = JSON.parse(text) as unknown
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return { ok: false, reason: 'invalid-registry-response' }
    }
    const tag = (value as Record<string, unknown>)['tag_name']
    if (typeof tag !== 'string' || parseOpenAICodexVersion(tag) === undefined) {
      return { ok: false, reason: 'invalid-registry-response' }
    }
    return { ok: true, latestVersion: normalizeOpenAICodexVersion(tag) }
  } catch (error: unknown) {
    return {
      ok: false,
      reason: error instanceof SyntaxError || error instanceof RangeError ? 'invalid-registry-response' : 'registry-unavailable',
    }
  }
}

/** Check npm dist-tags first, falling back to GitHub Releases when npm is unavailable. */
export async function checkForOpenAICodexUpdate(options: UpdateCheckOptions): Promise<OpenAICodexUpdateResult> {
  const { currentVersion } = options
  if (parseOpenAICodexVersion(currentVersion) === undefined) {
    return { status: 'unavailable', currentVersion, reason: 'invalid-current-version' }
  }
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? OPENAI_CODEX_UPDATE_TIMEOUT_MS
  const npmResult = await lookupNpmLatest(fetchImpl, timeoutMs)
  let latestVersion: string
  if (npmResult.ok) {
    latestVersion = npmResult.latestVersion
  } else {
    const githubResult = await lookupGitHubLatestRelease(fetchImpl, timeoutMs)
    if (!githubResult.ok) {
      const reason = githubResult.reason === 'invalid-registry-response' || npmResult.reason === 'invalid-registry-response'
        ? 'invalid-registry-response'
        : 'registry-unavailable'
      return { status: 'unavailable', currentVersion, reason }
    }
    latestVersion = githubResult.latestVersion
  }
  if (compareOpenAICodexVersions(latestVersion, currentVersion) <= 0) {
    return { status: 'up-to-date', currentVersion, latestVersion: currentVersion }
  }
  return { status: 'update-available', currentVersion, latestVersion, releaseUrl: openAICodexReleaseUrl(latestVersion) }
}
