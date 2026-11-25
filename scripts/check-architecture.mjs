#!/usr/bin/env node
/** Enforce directory fan-out, file line budgets, and unidirectional layer boundaries. */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC_ROOT = path.join(REPO_ROOT, 'src')
const SCRIPTS_ROOT = path.join(REPO_ROOT, 'scripts')
const TESTS_ROOT = path.join(REPO_ROOT, 'tests')

const MAX_DIR_ENTRIES = 8
const MAX_FILE_LINES = 500

const failures = []

function walkDirs(dir, rootLabel) {
  const entries = readdirSync(dir)
  if (entries.length > MAX_DIR_ENTRIES) {
    failures.push(`${rootLabel}: directory ${path.relative(REPO_ROOT, dir)} has ${entries.length} entries (max ${MAX_DIR_ENTRIES})`)
  }
  const files = []
  for (const name of entries) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) {
      files.push(...walkDirs(full, rootLabel))
    } else {
      files.push(full)
    }
  }
  return files
}

const srcFiles = walkDirs(SRC_ROOT, 'src')
walkDirs(SCRIPTS_ROOT, 'scripts')
walkDirs(TESTS_ROOT, 'tests')

const importPattern = /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/gu

for (const file of srcFiles) {
  const rel = path.relative(SRC_ROOT, file).replace(/\\/gu, '/')
  const content = readFileSync(file, 'utf8')
  const lineCount = content.split(/\r?\n/u).length
  if (lineCount >= MAX_FILE_LINES) {
    failures.push(`src/${rel} has ${lineCount} lines (must be < ${MAX_FILE_LINES})`)
  }
  const layer = rel.split('/')[0]
  if (layer !== 'shared' && layer !== 'platform' && layer !== 'client') continue

  for (const match of content.matchAll(importPattern)) {
    const spec = match[1] ?? match[2]
    if (!spec) continue
    if (spec.startsWith('node:')) {
      if (layer === 'shared' || layer === 'client') {
        failures.push(`src/${rel} (${layer} layer) must not import Node builtin ${spec}`)
      }
      continue
    }
    if (!spec.startsWith('.')) continue
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec))
    const targetLayer = resolved.split('/')[0]
    if (layer === 'shared' && (targetLayer === 'platform' || targetLayer === 'features' || targetLayer === 'client')) {
      failures.push(`src/${rel} (shared layer) must not import ${resolved}`)
    } else if (layer === 'platform' && (targetLayer === 'features' || targetLayer === 'client')) {
      failures.push(`src/${rel} (platform layer) must not import ${resolved}`)
    } else if (layer === 'client' && (targetLayer === 'platform' || targetLayer === 'features')) {
      failures.push(`src/${rel} (client layer) must not import ${resolved}`)
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`architecture: ${failure}\n`)
  process.exitCode = 1
} else {
  process.stdout.write(`Architecture gate passed: ${srcFiles.length} src files checked (dirs <= ${MAX_DIR_ENTRIES}, files < ${MAX_FILE_LINES} lines, layer boundaries clean)\n`)
}
