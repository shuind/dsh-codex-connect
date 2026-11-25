import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('bundle defaults', () => {
  it('installs only its plugin row and leaves Harness routing unchanged', async () => {
    const patch = await readFile(new URL('../../cordis.patch.yml', import.meta.url), 'utf8')
    expect(patch).toContain('name: "@shuind/dsh-codex-connect"')
    expect(patch).not.toContain('enableProxy')
    expect(patch).toContain('enableSearch: false')
    expect(patch).toContain('enableNativeCompaction: false')
    expect(patch).toContain('enableImageGeneration: false')
    expect(patch).not.toMatch(/^- id: agent-default-model/mu)
    expect(patch).not.toMatch(/searchProvider:\s*openai-codex/u)
  })
})
