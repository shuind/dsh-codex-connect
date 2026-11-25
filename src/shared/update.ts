/** Node-free update route constants, version helpers, DSH range matching, and result validation. */

export const OPENAI_CODEX_UPDATE_PATH = '/openai-codex/update'
export const OPENAI_CODEX_PACKAGE_NAME = '@shuind/dsh-codex-connect'
export const OPENAI_CODEX_NPM_METADATA_URL = `https://registry.npmjs.org/-/package/${OPENAI_CODEX_PACKAGE_NAME}/dist-tags`
export const OPENAI_CODEX_NPM_VERSION_METADATA_BASE = `https://registry.npmjs.org/${OPENAI_CODEX_PACKAGE_NAME}/`
export const OPENAI_CODEX_GITHUB_LATEST_RELEASE_URL = 'https://api.github.com/repos/shuind/dsh-codex-connect/releases/latest'
export const OPENAI_CODEX_GITHUB_RAW_PACKAGE_URL_BASE = 'https://raw.githubusercontent.com/shuind/dsh-codex-connect/v'
export const OPENAI_CODEX_RELEASE_PAGE_BASE = 'https://github.com/shuind/dsh-codex-connect/releases/tag/v'

const MAX_DSH_RANGE_LENGTH = 256

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
      dshVersion?: string
      requiredDsh?: string
      dshCompatible?: boolean
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

export function openAICodexNpmVersionUrl(version: string): string {
  return `${OPENAI_CODEX_NPM_VERSION_METADATA_BASE}${encodeURIComponent(normalizeOpenAICodexVersion(version))}`
}

export function openAICodexGitHubRawPackageUrl(version: string): string {
  return `${OPENAI_CODEX_GITHUB_RAW_PACKAGE_URL_BASE}${encodeURIComponent(normalizeOpenAICodexVersion(version))}/package.json`
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

function matchComparator(dshVersion: string, token: string): boolean | undefined {
  const match = /^(>=|<=|>|<|=|\^|~)?(.+)$/u.exec(token)
  if (match === null) return undefined
  const operator = match[1] ?? '='
  const rawTarget = match[2] ?? ''
  const target = parseOpenAICodexVersion(rawTarget)
  if (target === undefined) return undefined
  const normalizedTarget = normalizeOpenAICodexVersion(rawTarget)
  if (operator === '=') return compareOpenAICodexVersions(dshVersion, normalizedTarget) === 0
  if (operator === '>=') return compareOpenAICodexVersions(dshVersion, normalizedTarget) >= 0
  if (operator === '<=') return compareOpenAICodexVersions(dshVersion, normalizedTarget) <= 0
  if (operator === '>') return compareOpenAICodexVersions(dshVersion, normalizedTarget) > 0
  if (operator === '<') {
    const ceiling = target.prerelease.length === 0 ? `${target.major}.${target.minor}.${target.patch}-0` : normalizedTarget
    return compareOpenAICodexVersions(dshVersion, ceiling) < 0
  }
  if (operator === '^') {
    if (compareOpenAICodexVersions(dshVersion, normalizedTarget) < 0) return false
    const ceiling = target.major > 0
      ? `${target.major + 1}.0.0-0`
      : target.minor > 0
        ? `0.${target.minor + 1}.0-0`
        : `0.0.${target.patch + 1}-0`
    return compareOpenAICodexVersions(dshVersion, ceiling) < 0
  }
  if (operator === '~') {
    if (compareOpenAICodexVersions(dshVersion, normalizedTarget) < 0) return false
    return compareOpenAICodexVersions(dshVersion, `${target.major}.${target.minor + 1}.0-0`) < 0
  }
  return undefined
}

/** Check whether an installed DSH version satisfies a plugin `engines.dsh` SemVer range. */
export function satisfiesOpenAICodexDshRange(dshVersion: string, range: string): boolean | undefined {
  if (parseOpenAICodexVersion(dshVersion) === undefined) return undefined
  const trimmed = range.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_DSH_RANGE_LENGTH) return undefined
  const normalizedDsh = normalizeOpenAICodexVersion(dshVersion)
  const clauses = trimmed.split('||').map(part => part.trim())
  if (clauses.some(clause => clause.length === 0)) return undefined
  let matched = false
  for (const clause of clauses) {
    const tokens = clause.split(/\s+/u).filter(Boolean)
    if (tokens.length === 0) return undefined
    let clauseMatches = true
    for (const token of tokens) {
      const result = matchComparator(normalizedDsh, token)
      if (result === undefined) return undefined
      if (!result) clauseMatches = false
    }
    if (clauseMatches) matched = true
  }
  return matched
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
  const dshVersion = record['dshVersion']
  const requiredDsh = record['requiredDsh']
  const dshCompatible = record['dshCompatible']
  const hasAnyCompat = dshVersion !== undefined || requiredDsh !== undefined || dshCompatible !== undefined
  if (!hasAnyCompat) {
    return { status: 'update-available', currentVersion, latestVersion, releaseUrl: expectedUrl }
  }
  if (typeof dshVersion !== 'string' || parseOpenAICodexVersion(dshVersion) === undefined) return undefined
  if (typeof requiredDsh !== 'string' || requiredDsh.trim().length === 0 || requiredDsh.length > MAX_DSH_RANGE_LENGTH) return undefined
  if (typeof dshCompatible !== 'boolean') return undefined
  return {
    status: 'update-available',
    currentVersion,
    latestVersion,
    releaseUrl: expectedUrl,
    dshVersion: normalizeOpenAICodexVersion(dshVersion),
    requiredDsh: requiredDsh.trim(),
    dshCompatible,
  }
}
