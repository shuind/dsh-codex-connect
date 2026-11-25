/** Node-free update route constants, version helpers, and result validation. */

export const OPENAI_CODEX_UPDATE_PATH = '/openai-codex/update'
export const OPENAI_CODEX_PACKAGE_NAME = '@shuind/dsh-codex-connect'
export const OPENAI_CODEX_NPM_METADATA_URL = `https://registry.npmjs.org/-/package/${OPENAI_CODEX_PACKAGE_NAME}/dist-tags`
export const OPENAI_CODEX_GITHUB_LATEST_RELEASE_URL = 'https://api.github.com/repos/shuind/dsh-codex-connect/releases/latest'
export const OPENAI_CODEX_RELEASE_PAGE_BASE = 'https://github.com/shuind/dsh-codex-connect/releases/tag/v'

export type OpenAICodexUpdateResult =
  | {
      status: 'up-to-date'
      currentVersion: string
      latestVersion: string
    }
  | {
      status: 'update-available'
      currentVersion: string
      latestVersion: string
      releaseUrl: string
    }
  | {
      status: 'unavailable'
      currentVersion: string
      reason: 'invalid-current-version' | 'registry-unavailable' | 'invalid-registry-response'
    }

interface ParsedVersion {
  major: number
  minor: number
  patch: number
  prerelease: Array<number | string>
}

export function normalizeOpenAICodexVersion(raw: string): string {
  return raw.startsWith('v') ? raw.slice(1) : raw
}

export function openAICodexReleaseUrl(version: string): string {
  return `${OPENAI_CODEX_RELEASE_PAGE_BASE}${normalizeOpenAICodexVersion(version)}`
}

function parseVersionParts(raw: string): ParsedVersion | undefined {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u.exec(raw)
  if (match === null) return undefined
  const rawPrerelease = match[4] === undefined ? [] : match[4].split('.')
  if (rawPrerelease.some(identifier => /^\d+$/u.test(identifier) && !/^(0|[1-9]\d*)$/u.test(identifier))) return undefined
  const prerelease = rawPrerelease.map(identifier => /^(0|[1-9]\d*)$/u.test(identifier) ? Number(identifier) : identifier)
  if (prerelease.some(identifier => typeof identifier === 'number' && !Number.isSafeInteger(identifier))) return undefined
  const parsed = { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), prerelease }
  return [parsed.major, parsed.minor, parsed.patch].every(Number.isSafeInteger) ? parsed : undefined
}

/** Parse one exact package version, accepting the conventional leading `v`. */
export function parseOpenAICodexVersion(raw: string): ParsedVersion | undefined {
  if (typeof raw !== 'string') return undefined
  return parseVersionParts(normalizeOpenAICodexVersion(raw))
}

function compareIdentifiers(left: number | string, right: number | string): number {
  if (typeof left === 'number' && typeof right === 'number') return left < right ? -1 : left > right ? 1 : 0
  if (typeof left === 'number') return -1
  if (typeof right === 'number') return 1
  return left < right ? -1 : left > right ? 1 : 0
}

/** Compare two package versions using SemVer precedence (build metadata ignored). */
export function compareOpenAICodexVersions(left: string, right: string): number {
  const a = parseOpenAICodexVersion(left)
  const b = parseOpenAICodexVersion(right)
  if (a === undefined || b === undefined) throw new TypeError('invalid OpenAI Codex version')
  for (const [aPart, bPart] of [[a.major, b.major], [a.minor, b.minor], [a.patch, b.patch]] as const) {
    if (aPart !== bPart) return aPart < bPart ? -1 : 1
  }
  if (a.prerelease.length === 0 && b.prerelease.length !== 0) return 1
  if (a.prerelease.length !== 0 && b.prerelease.length === 0) return -1
  for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index += 1) {
    const aPart = a.prerelease[index]
    const bPart = b.prerelease[index]
    if (aPart === undefined) return -1
    if (bPart === undefined) return 1
    const comparison = compareIdentifiers(aPart, bPart)
    if (comparison !== 0) return comparison
  }
  return 0
}

/** Validate a route response before it is rendered by the browser. */
export function parseOpenAICodexUpdateResult(value: unknown): OpenAICodexUpdateResult | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const currentVersion = record['currentVersion']
  if (typeof currentVersion !== 'string' || parseOpenAICodexVersion(currentVersion) === undefined) return undefined
  if (record['status'] === 'unavailable') {
    const reason = record['reason']
    return reason === 'invalid-current-version' || reason === 'registry-unavailable' || reason === 'invalid-registry-response'
      ? { status: 'unavailable', currentVersion, reason }
      : undefined
  }
  const latestVersion = record['latestVersion']
  if (typeof latestVersion !== 'string' || parseOpenAICodexVersion(latestVersion) === undefined) return undefined
  if (record['status'] === 'up-to-date') {
    return { status: 'up-to-date', currentVersion, latestVersion }
  }
  if (record['status'] !== 'update-available' || compareOpenAICodexVersions(latestVersion, currentVersion) <= 0) return undefined
  const expectedUrl = openAICodexReleaseUrl(latestVersion)
  if (record['releaseUrl'] !== expectedUrl) return undefined
  return { status: 'update-available', currentVersion, latestVersion, releaseUrl: expectedUrl }
}
