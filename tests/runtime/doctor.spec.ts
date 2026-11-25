import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
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
      compatibilityOptions: {
        nodeVersion: 'v24.21.0',
        packageVersions: {
          '@deepseek-ai/dsh-llm': '0.2.2-rc.5',
          '@deepseek-ai/dsh-llm-pi-ai': '0.2.2-rc.5',
          '@deepseek-ai/dsh-compaction': '0.2.2-rc.5',
          '@earendil-works/pi-ai': '1.6.0',
        },
      },
    })
    expect(report.version).toBe(CODEX_CONNECT_VERSION)
    expect(report.credentialFile.state).toBe('missing')
    expect(report.capabilities).toEqual({
      modelProvider: true,
      search: false,
      imageTool: false,
      imageGeneration: false,
      changesHarnessDefaultModel: false,
      changesHarnessSearchRoute: false,
    })
    expect(report.compatibility.status).toBe('compatible')
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

  it('reports an incompatible Node engine without recommending a DSH downgrade', async () => {
    const report = await diagnoseOpenAICodex({
      credentialPath: join(root!, 'missing.json'),
      compatibilityOptions: {
        nodeVersion: 'v20.0.0',
        packageVersions: {
          '@deepseek-ai/dsh-llm': '0.1.1-rc.2',
          '@deepseek-ai/dsh-llm-pi-ai': '0.1.0-rc.6',
          '@deepseek-ai/dsh-compaction': '0.1.0-rc.6',
          '@earendil-works/pi-ai': '0.82.1',
        },
      },
    })
    expect(report.compatibility.status).toBe('incompatible')
    expect(report.hints.join('\n')).toMatch(/Node version does not satisfy/)
  })

  it('reports DSH and pi-ai mismatches as unverified', async () => {
    const report = await diagnoseOpenAICodex({
      credentialPath: join(root!, 'missing.json'),
      compatibilityOptions: {
        nodeVersion: 'v24.0.0',
        packageVersions: {
          '@deepseek-ai/dsh-llm': '0.1.1-rc.2',
          '@deepseek-ai/dsh-llm-pi-ai': '0.1.0-rc.6',
          '@deepseek-ai/dsh-compaction': '0.1.0-rc.6',
          '@earendil-works/pi-ai': '0.82.1',
        },
      },
    })
    expect(report.compatibility.status).toBe('unverified')
    expect(report.hints.join('\n')).toMatch(/outside the verified/u)
  })

  it('reports unknown compatibility without pretending it is supported', async () => {
    const report = await diagnoseOpenAICodex({
      credentialPath: join(root!, 'missing.json'),
      compatibilityOptions: { nodeVersion: 'not-a-node-version', packageVersions: {} },
    })
    expect(report.compatibility.status).toBe('unknown')
    expect(report.hints.join('\n')).toMatch(/Compatibility is unknown/)
  })
})
