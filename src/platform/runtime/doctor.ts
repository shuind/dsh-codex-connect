/** Lightweight, secret-free local diagnostics and duplicate-provider guidance. */

import { lstat } from 'node:fs/promises'
import { openAICodexAuthPath, OPENAI_CODEX_PROVIDER } from '../auth/store.ts'
import { detectCompatibility } from './compatibility.ts'
import type { CompatibilityDetectionOptions, CompatibilityReport } from './compatibility.ts'
import { CODEX_CONNECT_VERSION } from '../../version.ts'

export { CODEX_CONNECT_VERSION }

export interface OpenAICodexDiagnosticOptions {
  credentialPath?: string
  providerIds?: readonly string[]
  enableSearch?: boolean
  enableImageTool?: boolean
  enableImageGeneration?: boolean
  compatibilityOptions?: CompatibilityDetectionOptions
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
    imageTool: boolean
    imageGeneration: boolean
    changesHarnessDefaultModel: false
    changesHarnessSearchRoute: boolean
  }
  providerConflict: boolean
  compatibility: CompatibilityReport
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

/** Inspect local package versions and OAuth file metadata without reading credential contents. */
export async function diagnoseOpenAICodex(
  options: OpenAICodexDiagnosticOptions = {},
): Promise<OpenAICodexDiagnosticReport> {
  const path = options.credentialPath ?? openAICodexAuthPath()
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
  const compatibility = await detectCompatibility(options.compatibilityOptions)
  const hints: string[] = []
  if (state === 'missing') hints.push('Sign in only when you are ready; installation does not start OAuth.')
  if (state === 'permissions-too-broad') hints.push(`Restrict the OAuth file to its owner before use (current mode ${mode}).`)
  if (state === 'not-a-regular-file') hints.push('Replace the OAuth path with an owner-only regular file created by Codex Connect login.')
  if (state === 'unreadable-metadata') hints.push('Harness could not inspect the OAuth file metadata; check the parent directory and file ownership.')
  if (providerConflict) hints.push(openAICodexConflictMessage())
  if (compatibility.status === 'incompatible') {
    hints.push(`This Node version does not satisfy ${compatibility.node.supported} for the installed DSH version.`)
  } else if (compatibility.status === 'unverified' || compatibility.status === 'unverified-in-range' || compatibility.status === 'known-bad') {
    hints.push('Installed DSH or @earendil-works/pi-ai version is outside the verified 0.2.2-rc.x set.')
  } else if (compatibility.status === 'unknown') {
    hints.push('Compatibility is unknown: run doctor inside a DSH profile installation with readable package manifests.')
  }

  return {
    package: '@shuind/dsh-codex-connect',
    version: CODEX_CONNECT_VERSION,
    node: process.version,
    credentialFile: { path, state, ...(mode === undefined ? {} : { mode }) },
    capabilities: {
      modelProvider: true,
      search: options.enableSearch === true,
      imageTool: options.enableImageTool === true,
      imageGeneration: options.enableImageGeneration === true,
      changesHarnessDefaultModel: false,
      changesHarnessSearchRoute: options.enableSearch === true,
    },
    providerConflict,
    compatibility,
    hints,
  }
}
