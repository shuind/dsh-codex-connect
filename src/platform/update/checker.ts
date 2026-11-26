/** Network update checker: npm dist-tags first, GitHub Releases fallback, with DSH compatibility check. */

import { readFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  compareOpenAICodexVersions,
  normalizeOpenAICodexVersion,
  OPENAI_CODEX_GITHUB_LATEST_RELEASE_URL,
  OPENAI_CODEX_NPM_METADATA_URL,
  OPENAI_CODEX_PACKAGE_NAME,
  openAICodexGitHubRawPackageUrl,
  openAICodexNpmVersionUrl,
  openAICodexReleaseUrl,
  parseOpenAICodexVersion,
  satisfiesOpenAICodexDshRange,
} from '../../shared/update.ts'
import type { OpenAICodexUpdateResult } from '../../shared/update.ts'

export * from '../../shared/update.ts'

export const OPENAI_CODEX_UPDATE_TIMEOUT_MS = 8_000
export const OPENAI_CODEX_UPDATE_MAX_METADATA_BYTES = 64 * 1024
export const OPENAI_CODEX_UPDATE_MAX_RELEASE_BYTES = 64 * 1024

const MODULE_DIR = dirname(fileURLToPath(import.meta.url))
const DSH_HOST_VERSION_PACKAGE = '@deepseek-ai/dsh-llm'
const MAX_ROOT_WALK_DEPTH = 6

type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>

interface UpdateCheckOptions {
  currentVersion: string
  /** Override detected DSH version, or pass null to skip DSH compatibility checking. */
  dshVersion?: string | null
  fetchImpl?: FetchImpl
  timeoutMs?: number
}

type SourceLookupResult =
  | { ok: true; latestVersion: string; source: 'npm' | 'github' }
  | { ok: false; reason: 'registry-unavailable' | 'invalid-registry-response' }

async function isPluginRoot(dir: string): Promise<boolean> {
  try {
    const raw = await readFile(join(dir, 'package.json'), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return false
    return (parsed as Record<string, unknown>)['name'] === OPENAI_CODEX_PACKAGE_NAME
  } catch {
    return false
  }
}

/** Walk upward from the current module directory to find this plugin's root in both src and bundled lib layouts. */
export async function resolveOpenAICodexPluginRoot(startDir = MODULE_DIR): Promise<string> {
  let current = startDir
  for (let depth = 0; depth <= MAX_ROOT_WALK_DEPTH; depth += 1) {
    if (await isPluginRoot(current)) return current
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return startDir
}

function dependencyRoots(packageDir: string): string[] {
  const roots = [join(packageDir, 'node_modules')]
  const parent = dirname(packageDir)
  if (basename(parent) === 'node_modules') {
    roots.push(parent)
  } else if (basename(parent).startsWith('@') && basename(dirname(parent)) === 'node_modules') {
    roots.push(dirname(parent))
  }
  return roots
}

/** Read the installed DSH host version from peer package metadata without executing code. */
export async function readInstalledDshVersion(packageDir?: string): Promise<string | undefined> {
  const rootDir = packageDir ?? await resolveOpenAICodexPluginRoot()
  for (const root of dependencyRoots(rootDir)) {
    try {
      const raw = await readFile(join(root, DSH_HOST_VERSION_PACKAGE, 'package.json'), 'utf8')
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) continue
      const record = parsed as Record<string, unknown>
      if (record['name'] !== DSH_HOST_VERSION_PACKAGE || typeof record['version'] !== 'string') continue
      const trimmed = record['version'].trim()
      if (parseOpenAICodexVersion(trimmed) !== undefined) return normalizeOpenAICodexVersion(trimmed)
    } catch {
      continue
    }
  }
  return undefined
}

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

function extractRequiredDshRange(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const engines = (value as Record<string, unknown>)['engines']
  if (typeof engines !== 'object' || engines === null || Array.isArray(engines)) return undefined
  const range = (engines as Record<string, unknown>)['dsh']
  if (typeof range !== 'string') return undefined
  const trimmed = range.trim()
  return trimmed.length > 0 && trimmed.length <= 256 ? trimmed : undefined
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
    return { ok: true, latestVersion, source: 'npm' }
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
    return { ok: true, latestVersion: normalizeOpenAICodexVersion(tag), source: 'github' }
  } catch (error: unknown) {
    return {
      ok: false,
      reason: error instanceof SyntaxError || error instanceof RangeError ? 'invalid-registry-response' : 'registry-unavailable',
    }
  }
}

async function fetchRequiredDshFromUrl(
  fetchImpl: FetchImpl,
  url: string,
  timeoutMs: number,
): Promise<string | undefined> {
  try {
    const { response, text } = await fetchBounded(
      fetchImpl, url, OPENAI_CODEX_UPDATE_MAX_METADATA_BYTES, timeoutMs,
      { accept: 'application/json' },
    )
    if (!response.ok) return undefined
    return extractRequiredDshRange(JSON.parse(text) as unknown)
  } catch {
    return undefined
  }
}

async function lookupRequiredDshRange(
  fetchImpl: FetchImpl,
  version: string,
  source: 'npm' | 'github',
  timeoutMs: number,
): Promise<string | undefined> {
  if (source === 'npm') {
    const fromNpm = await fetchRequiredDshFromUrl(fetchImpl, openAICodexNpmVersionUrl(version), timeoutMs)
    if (fromNpm !== undefined) return fromNpm
  }
  return fetchRequiredDshFromUrl(fetchImpl, openAICodexGitHubRawPackageUrl(version), timeoutMs)
}

/** Check npm dist-tags first, falling back to GitHub Releases, and verify DSH version compatibility. */
export async function checkForOpenAICodexUpdate(options: UpdateCheckOptions): Promise<OpenAICodexUpdateResult> {
  const { currentVersion } = options
  if (parseOpenAICodexVersion(currentVersion) === undefined) {
    return { status: 'unavailable', currentVersion, reason: 'invalid-current-version' }
  }
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? OPENAI_CODEX_UPDATE_TIMEOUT_MS
  const npmResult = await lookupNpmLatest(fetchImpl, timeoutMs)
  let latestVersion: string
  let source: 'npm' | 'github'
  if (npmResult.ok) {
    latestVersion = npmResult.latestVersion
    source = 'npm'
  } else {
    const githubResult = await lookupGitHubLatestRelease(fetchImpl, timeoutMs)
    if (!githubResult.ok) {
      const reason = githubResult.reason === 'invalid-registry-response' || npmResult.reason === 'invalid-registry-response'
        ? 'invalid-registry-response'
        : 'registry-unavailable'
      return { status: 'unavailable', currentVersion, reason }
    }
    latestVersion = githubResult.latestVersion
    source = 'github'
  }
  if (compareOpenAICodexVersions(latestVersion, currentVersion) <= 0) {
    return { status: 'up-to-date', currentVersion, latestVersion: currentVersion }
  }
  const baseResult = {
    status: 'update-available' as const,
    currentVersion,
    latestVersion,
    releaseUrl: openAICodexReleaseUrl(latestVersion),
  }
  const rawDshVersion = options.dshVersion === undefined ? await readInstalledDshVersion() : options.dshVersion
  if (typeof rawDshVersion !== 'string' || parseOpenAICodexVersion(rawDshVersion) === undefined) {
    return baseResult
  }
  const dshVersion = normalizeOpenAICodexVersion(rawDshVersion)
  const requiredDsh = await lookupRequiredDshRange(fetchImpl, latestVersion, source, timeoutMs)
  if (requiredDsh === undefined) return baseResult
  const dshCompatible = satisfiesOpenAICodexDshRange(dshVersion, requiredDsh)
  if (dshCompatible === undefined) return baseResult
  return { ...baseResult, dshVersion, requiredDsh, dshCompatible }
}
