import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CODEX_CONNECT_VERSION } from '../../src/version.ts'
import {
  assertNoOpenAICodexProviderConflict,
  diagnoseOpenAICodex,
} from '../../src/platform/runtime/doctor.ts'

let root: string | undefined
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'dsh-codex-connect-doctor-')) })

afterEach(async () => {
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

describe('Codex Connect doctor', () => {
  it('reports defaults and a missing credential without starting OAuth', async () => {
    const report = await diagnoseOpenAICodex({
      credentialPath: join(root!, 'missing.json'),
    })
    expect(report.version).toBe(CODEX_CONNECT_VERSION)
    expect(report.credentialFile.state).toBe('missing')
    expect(report.capabilities).toEqual({
      modelProvider: true,
      search: false,
      imageGeneration: false,
      changesHarnessDefaultModel: false,
      changesHarnessSearchRoute: false,
    })
  })

  it('uses metadata only and never returns credential content', async () => {
    const filename = join(root!, 'auth.json')
    const secret = 'access-token-must-not-leak'
    await writeFile(filename, secret, { mode: 0o600 })
    if (process.platform !== 'win32') await chmod(filename, 0o644)
    const report = await diagnoseOpenAICodex({ credentialPath: filename })
    expect(JSON.stringify(report)).not.toContain(secret)
    expect(report.credentialFile.state).toBe(process.platform === 'win32' ? 'owner-only' : 'permissions-too-broad')
  })

  it('reports that enabled Codex Search temporarily selects the Harness route', async () => {
    const report = await diagnoseOpenAICodex({ credentialPath: join(root!, 'missing.json'), enableSearch: true })
    expect(report.capabilities.changesHarnessSearchRoute).toBe(true)
  })

  it('gives a focused migration hint for a provider collision', async () => {
    const failure = () => assertNoOpenAICodexProviderConflict(['deepseek-official', 'openai-codex'])
    expect(failure).toThrow(/legacy dsh-codex bundle or manual openai-codex provider row/)
    await expect(diagnoseOpenAICodex({ credentialPath: join(root!, 'missing.json'), providerIds: ['openai-codex'] }))
      .resolves.toMatchObject({ providerConflict: true })
  })

  it('detects legacy unscoped dsh-codex-connect entries in profile cordis.patch.yml without leaking absolute paths', async () => {
    const desktopDir = join(root!, 'profiles', 'desktop')
    const webDir = join(root!, 'profiles', 'web')
    await mkdir(desktopDir, { recursive: true })
    await mkdir(webDir, { recursive: true })
    await writeFile(join(desktopDir, 'cordis.patch.yml'), '- id: llm-openai-codex\n  name: dsh-codex-connect\n  config:\n    enableSearch: true\n')
    await writeFile(join(webDir, 'cordis.patch.yml'), '- id: llm-openai-codex\n  name: "@shuind/dsh-codex-connect"\n  config:\n    enableSearch: true\n')
    const report = await diagnoseOpenAICodex({ credentialPath: join(root!, '.openai-codex-auth.json') })
    expect(report.hints.some(hint => hint.includes('profiles/desktop/cordis.patch.yml') && hint.includes('@shuind/dsh-codex-connect'))).toBe(true)
    expect(report.hints.some(hint => hint.includes('profiles/web/cordis.patch.yml'))).toBe(false)
    expect(report.hints.join('\n')).not.toContain(root!)
  })
})
