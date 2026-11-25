#!/usr/bin/env node

import { cp, mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runBoundedCommand } from './lib/bounded-command.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const missingHostPeers = new Set(['@deepseek-ai/schemastery', '@earendil-works/pi-ai'])
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const fixture = await mkdtemp(join(tmpdir(), 'codex-connect-isolated-import-'))

function isolatedEnv() {
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (/^(?:HTTP|HTTPS|ALL|NO)_PROXY$/iu.test(key) || key === 'NODE_USE_ENV_PROXY' || key === 'NODE_OPTIONS' || key === 'NODE_PATH') {
      delete env[key]
    }
  }
  env.DSH_HOME = join(fixture, 'dsh-home')
  return env
}

async function linkPackage(nodeModules, name) {
  const target = join(root, 'node_modules', name)
  const location = join(nodeModules, name)
  await mkdir(dirname(location), { recursive: true })
  await symlink(target, location, process.platform === 'win32' ? 'junction' : 'dir')
}

try {
  const profileNodeModules = join(fixture, 'node_modules')
  const pluginRoot = join(profileNodeModules, packageJson.name)
  await mkdir(pluginRoot, { recursive: true })
  await cp(join(root, 'package.json'), join(pluginRoot, 'package.json'))
  await cp(join(root, 'lib'), join(pluginRoot, 'lib'), { recursive: true })

  for (const name of Object.keys(packageJson.peerDependencies ?? {})) {
    if (!missingHostPeers.has(name)) await linkPackage(profileNodeModules, name)
  }
  const pluginNodeModules = join(pluginRoot, 'node_modules')
  for (const name of Object.keys(packageJson.dependencies ?? {})) {
    await linkPackage(pluginNodeModules, name)
  }

  const env = isolatedEnv()
  const result = await runBoundedCommand(
    process.execPath,
    ['--input-type=module', '--eval', `await import(${JSON.stringify(packageJson.name)}); console.log('imported')`],
    { cwd: fixture, env, timeoutMs: 15_000, maxBuffer: 8192 },
  )
  if (result.error || result.cleanupError || result.status !== 0 || result.stdout.trim() !== 'imported') {
    const missing = result.stderr.match(/Cannot find package '([^'\r\n]+)'/u)?.[1]
    const outdated = result.stderr.includes('volatile is not a function')
    throw new Error(`isolated plugin import failed (exit=${result.status ?? 'unknown'}, missing=${missing ?? 'none'}, outdatedSchema=${outdated})`)
  }
  process.stdout.write('isolated plugin import passed without host schemastery or pi-ai peers\n')

  const doctor = await runBoundedCommand(
    process.execPath,
    [join(pluginRoot, 'lib', 'bin.js'), 'doctor', '--json'],
    { cwd: fixture, env, timeoutMs: 15_000, maxBuffer: 16_384 },
  )
  if (doctor.error || doctor.cleanupError || (doctor.status !== 0 && doctor.status !== 1)) {
    throw new Error(`isolated doctor failed (exit=${doctor.status ?? 'unknown'}): ${doctor.stderr}`)
  }
  const parsed = JSON.parse(doctor.stdout)
  if (parsed.package !== packageJson.name || parsed.version !== packageJson.version) {
    throw new Error(`isolated doctor returned unexpected package identity: ${doctor.stdout}`)
  }
  process.stdout.write('isolated doctor --json passed\n')
} finally {
  await rm(fixture, { recursive: true, force: true })
}
