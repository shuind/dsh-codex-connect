/** Lightweight, secret-free local diagnostics and duplicate-provider guidance. */

import { lstat, readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { openAICodexAuthPath, OPENAI_CODEX_PROVIDER } from '../auth/store.ts'
import { CODEX_CONNECT_VERSION } from '../../version.ts'

export { CODEX_CONNECT_VERSION }

const MAX_PATCH_BYTES = 512 * 1024

export interface OpenAICodexDiagnosticOptions {
  credentialPath?: string
  dshHome?: string
  providerIds?: readonly string[]
  enableSearch?: boolean
  enableImageGeneration?: boolean
}

export interface OpenAICodexDiagnosticReport {
  package: '@shuind/dsh-codex-connect'
  version: string
  node: string
  credentialFile: {
    path: string
    state: 'missing' | 'owner-only' | 'permissions-too-broad' | 'not-a-regular-file' | 'unreadable-metadata'
    mode?: string
  }
  capabilities: {
    modelProvider: true
    search: boolean
    imageGeneration: boolean
    changesHarnessDefaultModel: false
    changesHarnessSearchRoute: boolean
  }
  providerConflict: boolean
  hints: string[]
}

/** Actionable message for legacy/manual `openai-codex` adapter collisions. */
export function openAICodexConflictMessage(): string {
  return 'Codex Connect cannot register provider "openai-codex" because another adapter already owns it. '
    + 'Remove or disable the legacy dsh-codex bundle or manual openai-codex provider row, then restart Harness.'
}

/** Fail before the generic registry error so the collision has a migration hint. */
export function assertNoOpenAICodexProviderConflict(providerIds: readonly string[]): void {
  if (providerIds.includes(OPENAI_CODEX_PROVIDER)) throw new Error(openAICodexConflictMessage())
}

function hasLegacyPackagePatchEntry(content: string): boolean {
  const blocks = content.split(/\r?\n(?=- )/u)
  return blocks.some(block =>
    /^\s*-?\s*id:\s*["']?llm-openai-codex["']?\s*$/mu.test(block)
    && /^\s*-?\s*name:\s*["']?dsh-codex-connect["']?\s*$/mu.test(block))
}

async function findLegacyProfilePatches(dshHome: string): Promise<string[]> {
  const profilesDir = join(dshHome, 'profiles')
  let entries
  try {
    entries = await readdir(profilesDir, { withFileTypes: true })
  } catch {
    return []
  }
  const matches: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const patchPath = join(profilesDir, entry.name, 'cordis.patch.yml')
    try {
      const info = await lstat(patchPath)
      if (!info.isFile() || info.size > MAX_PATCH_BYTES) continue
      const content = await readFile(patchPath, 'utf8')
      if (hasLegacyPackagePatchEntry(content)) matches.push(entry.name)
    } catch {
      continue
    }
  }
  return matches.sort()
}

/** Inspect local OAuth file metadata without reading credential contents. */
export async function diagnoseOpenAICodex(
  options: OpenAICodexDiagnosticOptions = {},
): Promise<OpenAICodexDiagnosticReport> {
  const path = options.credentialPath ?? openAICodexAuthPath()
  const dshHome = options.dshHome ?? dirname(path)
  let state: OpenAICodexDiagnosticReport['credentialFile']['state'] = 'missing'
  let mode: string | undefined
  try {
    const info = await lstat(path)
    if (!info.isFile()) {
      state = 'not-a-regular-file'
    } else if (process.platform === 'win32') {
      state = 'owner-only'
    } else {
      mode = (info.mode & 0o777).toString(8).padStart(3, '0')
      state = (info.mode & 0o077) === 0 ? 'owner-only' : 'permissions-too-broad'
    }
  } catch (error: unknown) {
    state = (error as NodeJS.ErrnoException | null)?.code === 'ENOENT' ? 'missing' : 'unreadable-metadata'
  }

  const providerConflict = options.providerIds?.includes(OPENAI_CODEX_PROVIDER) ?? false
  const legacyProfiles = await findLegacyProfilePatches(dshHome)
  const hints: string[] = []
  if (state === 'missing') hints.push('Sign in only when you are ready; installation does not start OAuth.')
  if (state === 'permissions-too-broad') hints.push(`Restrict the OAuth file to its owner before use (current mode ${mode}).`)
  if (state === 'not-a-regular-file') hints.push('Replace the OAuth path with an owner-only regular file created by Codex Connect login.')
  if (state === 'unreadable-metadata') hints.push('Harness could not inspect the OAuth file metadata; check the parent directory and file ownership.')
  if (providerConflict) hints.push(openAICodexConflictMessage())
  for (const profile of legacyProfiles) {
    hints.push(`Legacy package name "dsh-codex-connect" found for llm-openai-codex in profiles/${profile}/cordis.patch.yml; change name to "@shuind/dsh-codex-connect" (or remove the old entry) and restart DSH.`)
  }

  return {
    package: '@shuind/dsh-codex-connect',
    version: CODEX_CONNECT_VERSION,
    node: process.version,
    credentialFile: { path, state, ...(mode === undefined ? {} : { mode }) },
    capabilities: {
      modelProvider: true,
      search: options.enableSearch === true,
      imageGeneration: options.enableImageGeneration === true,
      changesHarnessDefaultModel: false,
      changesHarnessSearchRoute: options.enableSearch === true,
    },
    providerConflict,
    hints,
  }
}
