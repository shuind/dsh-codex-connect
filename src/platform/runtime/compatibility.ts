/** Lightweight package-version detection over the shared compatibility policy. */

import { readFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { COMPATIBILITY_PACKAGES, evaluateCompatibility, PI_AI_PACKAGE } from '../../shared/compatibility.ts'
import type { CompatibilityEvaluationInput, CompatibilityPackageName, CompatibilityReport } from '../../shared/compatibility.ts'

export * from '../../shared/compatibility.ts'

const PLUGIN_ROOT = fileURLToPath(new URL('../../..', import.meta.url))

export interface CompatibilityDetectionOptions extends CompatibilityEvaluationInput {
  readPackageVersion?: (name: CompatibilityPackageName) => string | null | undefined | Promise<string | null | undefined>
  installAnchor?: string
  pluginManifestPath?: string
}

async function readManifestVersion(manifestPath: string, expectedName: string): Promise<string | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(manifestPath, 'utf8'))
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
    const record = parsed as Record<string, unknown>
    return record['name'] === expectedName && typeof record['version'] === 'string' && record['version'].trim() !== ''
      ? record['version'].trim()
      : undefined
  } catch {
    return undefined
  }
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

/** Read one installed dependency version from the plugin or explicit host root without executing it. */
export async function readInstalledPackageVersion(
  name: string,
  installAnchor?: string,
  pluginManifestPath?: string,
): Promise<string | undefined> {
  const baseDir = installAnchor !== undefined && isAbsolute(installAnchor)
    ? dirname(installAnchor)
    : pluginManifestPath !== undefined && isAbsolute(pluginManifestPath)
      ? dirname(pluginManifestPath)
      : PLUGIN_ROOT
  for (const root of dependencyRoots(baseDir)) {
    const version = await readManifestVersion(join(root, name, 'package.json'), name)
    if (version !== undefined) return version
  }
  return undefined
}

/** Detect Node, DSH plugin API, and plugin-owned pi-ai compatibility. */
export async function detectCompatibility(options: CompatibilityDetectionOptions = {}): Promise<CompatibilityReport> {
  const supplied = options.packageVersions ?? options.packages ?? options.installed?.packages
  let packageVersions = supplied
  if (packageVersions === undefined) {
    const readVersion = options.readPackageVersion ?? ((name: CompatibilityPackageName) => {
      const anchor = name === PI_AI_PACKAGE ? undefined : options.installAnchor
      return readInstalledPackageVersion(name, anchor, options.pluginManifestPath)
    })
    packageVersions = Object.fromEntries(
      await Promise.all(COMPATIBILITY_PACKAGES.map(async name => [name, await readVersion(name)] as const)),
    )
  }
  const report = evaluateCompatibility({
    nodeVersion: options.nodeVersion ?? options.node ?? options.installed?.node ?? process.version,
    packageVersions,
  })
  if (options.installAnchor !== undefined && isAbsolute(options.installAnchor) && report.status === 'compatible') {
    const anchorVersion = await readManifestVersion(options.installAnchor, '@deepseek-ai/dsh')
    const peerVersion = report.packages['@deepseek-ai/dsh-llm'].installed
    if (anchorVersion !== undefined && peerVersion !== null && anchorVersion !== peerVersion) {
      return { ...report, status: 'unverified' }
    }
  }
  return report
}
