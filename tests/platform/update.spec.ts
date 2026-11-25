import { describe, expect, it, vi } from 'vitest'
import {
  checkForOpenAICodexUpdate,
  compareOpenAICodexVersions,
  OPENAI_CODEX_GITHUB_LATEST_RELEASE_URL,
  OPENAI_CODEX_NPM_METADATA_URL,
  OPENAI_CODEX_PACKAGE_NAME,
  OPENAI_CODEX_RELEASE_PAGE_BASE,
  parseOpenAICodexUpdateResult,
  parseOpenAICodexVersion,
} from '../../src/platform/update/checker.ts'

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('Codex Connect update checker', () => {
  it('targets @shuind/dsh-codex-connect on npm with GitHub Releases fallback', () => {
    expect(OPENAI_CODEX_PACKAGE_NAME).toBe('@shuind/dsh-codex-connect')
    expect(OPENAI_CODEX_NPM_METADATA_URL).toBe('https://registry.npmjs.org/-/package/@shuind/dsh-codex-connect/dist-tags')
    expect(OPENAI_CODEX_GITHUB_LATEST_RELEASE_URL).toBe('https://api.github.com/repos/shuind/dsh-codex-connect/releases/latest')
    expect(OPENAI_CODEX_RELEASE_PAGE_BASE).toBe('https://github.com/shuind/dsh-codex-connect/releases/tag/v')
  })

  it('compares SemVer versions including prereleases', () => {
    expect(parseOpenAICodexVersion('0.2.0')).toEqual({ major: 0, minor: 2, patch: 0, prerelease: [] })
    expect(parseOpenAICodexVersion('v0.2.1')).toEqual({ major: 0, minor: 2, patch: 1, prerelease: [] })
    expect(parseOpenAICodexVersion('0.2.0-alpha.16')).toEqual({ major: 0, minor: 2, patch: 0, prerelease: ['alpha', 16] })
    expect(parseOpenAICodexVersion('not-a-version')).toBeUndefined()
    expect(compareOpenAICodexVersions('0.2.0', '0.2.0-alpha.16')).toBeGreaterThan(0)
    expect(compareOpenAICodexVersions('0.2.1', '0.2.0')).toBeGreaterThan(0)
    expect(compareOpenAICodexVersions('0.2.0', '0.2.0')).toBe(0)
  })

  it('prefers npm dist-tags and skips GitHub when npm succeeds', async () => {
    const fetchMock = vi.fn(async (url: string): Promise<Response> => {
      expect(url).toBe(OPENAI_CODEX_NPM_METADATA_URL)
      return json({ latest: '0.2.1' })
    })
    const result = await checkForOpenAICodexUpdate({ currentVersion: '0.2.0', fetchImpl: fetchMock })
    expect(result).toEqual({
      status: 'update-available',
      currentVersion: '0.2.0',
      latestVersion: '0.2.1',
      releaseUrl: 'https://github.com/shuind/dsh-codex-connect/releases/tag/v0.2.1',
    })
    expect(parseOpenAICodexUpdateResult(result)).toEqual(result)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('falls back to GitHub Releases when npm returns 404 or fails', async () => {
    const fetchMock = vi.fn(async (url: string): Promise<Response> => {
      if (url === OPENAI_CODEX_NPM_METADATA_URL) return json({ error: 'Not found' }, 404)
      expect(url).toBe(OPENAI_CODEX_GITHUB_LATEST_RELEASE_URL)
      return json({ tag_name: 'v0.2.2', html_url: 'https://github.com/shuind/dsh-codex-connect/releases/tag/v0.2.2' })
    })
    const result = await checkForOpenAICodexUpdate({ currentVersion: '0.2.0', fetchImpl: fetchMock })
    expect(result).toEqual({
      status: 'update-available',
      currentVersion: '0.2.0',
      latestVersion: '0.2.2',
      releaseUrl: 'https://github.com/shuind/dsh-codex-connect/releases/tag/v0.2.2',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('reports up-to-date when npm or GitHub reports the current or older version', async () => {
    const fromNpm = await checkForOpenAICodexUpdate({
      currentVersion: '0.2.0',
      fetchImpl: vi.fn(async () => json({ latest: '0.2.0' })),
    })
    expect(fromNpm).toEqual({ status: 'up-to-date', currentVersion: '0.2.0', latestVersion: '0.2.0' })

    const fromGitHub = await checkForOpenAICodexUpdate({
      currentVersion: '0.2.0',
      fetchImpl: vi.fn(async (url: string) => url === OPENAI_CODEX_NPM_METADATA_URL
        ? Promise.reject(new Error('network down'))
        : json({ tag_name: 'v0.2.0' })),
    })
    expect(fromGitHub).toEqual({ status: 'up-to-date', currentVersion: '0.2.0', latestVersion: '0.2.0' })
  })

  it('reports unavailable when both npm and GitHub fail or return invalid payloads', async () => {
    const bothDown = await checkForOpenAICodexUpdate({
      currentVersion: '0.2.0',
      fetchImpl: vi.fn(async () => json({ error: 'unavailable' }, 503)),
    })
    expect(bothDown).toEqual({ status: 'unavailable', currentVersion: '0.2.0', reason: 'registry-unavailable' })

    const invalid = await checkForOpenAICodexUpdate({
      currentVersion: '0.2.0',
      fetchImpl: vi.fn(async () => json({ unexpected: true })),
    })
    expect(invalid).toEqual({ status: 'unavailable', currentVersion: '0.2.0', reason: 'invalid-registry-response' })

    const badCurrent = await checkForOpenAICodexUpdate({
      currentVersion: 'invalid',
      fetchImpl: vi.fn(),
    })
    expect(badCurrent).toEqual({ status: 'unavailable', currentVersion: 'invalid', reason: 'invalid-current-version' })
  })

  it('rejects untrusted release URLs and malformed results in parseOpenAICodexUpdateResult', () => {
    expect(parseOpenAICodexUpdateResult({
      status: 'update-available',
      currentVersion: '0.2.0',
      latestVersion: '0.2.1',
      releaseUrl: 'https://evil.example/v0.2.1',
    })).toBeUndefined()
    expect(parseOpenAICodexUpdateResult({
      status: 'update-available',
      currentVersion: '0.2.1',
      latestVersion: '0.2.0',
      releaseUrl: 'https://github.com/shuind/dsh-codex-connect/releases/tag/v0.2.0',
    })).toBeUndefined()
  })
})
