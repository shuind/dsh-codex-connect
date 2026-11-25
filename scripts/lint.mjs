import { readFile, stat } from 'node:fs/promises'
import semver from 'semver'
import './lib/vendor-codex-oauth.mjs'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const failures = []

if (packageJson.name !== '@shuind/dsh-codex-connect') failures.push('package name must be @shuind/dsh-codex-connect')
if (typeof packageJson.version !== 'string' || semver.valid(packageJson.version) !== packageJson.version || packageJson.version.includes('+')) {
  failures.push('package version must be a valid SemVer version without build metadata')
}
if (packageJson.publishConfig?.access !== 'public') failures.push('publishConfig.access must be public')
if (packageJson.displayName !== 'Codex Connect') failures.push('displayName mismatch')
if (packageJson.description !== 'ChatGPT OAuth and Codex models for DeepSeek Harness.') failures.push('description mismatch')
if (packageJson.author !== 'shuind') failures.push('package author must be shuind')
if (!Array.isArray(packageJson.contributors)
  || !packageJson.contributors.includes('Frank Song (original dsh-codex-connect author)')
  || !packageJson.contributors.includes('Yan-Zero (original dsh-codex author)')) {
  failures.push('package contributors must retain upstream authorship')
}
for (const keyword of ['dsh-plugin', 'deepseek-harness', 'openai-codex', 'chatgpt-oauth']) {
  if (!Array.isArray(packageJson.keywords) || !packageJson.keywords.includes(keyword)) failures.push(`package keywords must include ${keyword}`)
}

const productFiles = [
  'package.json',
  'README.md',
  'docs/README.zh.md',
  'INSTALL.md',
  'MIGRATION.md',
  'NOTICE',
  'LICENSE',
  'docs/design.md',
  'docs/design.zh.md',
]
const forbiddenProductTerms = [`${'conserv'}ative`, `${'unoff'}icial`]
for (const filename of productFiles) {
  const text = await readFile(new URL(`../${filename}`, import.meta.url), 'utf8')
  if (forbiddenProductTerms.some(term => text.toLowerCase().includes(term))) failures.push(`${filename} contains a forbidden product-description term`)
  if (/BEGIN (?:RSA |OPENSSH )?PRIVATE KEY|\bsk-[A-Za-z0-9_-]{16,}|refresh_token\s*[=:]\s*[^\s"']+/u.test(text)) {
    failures.push(`${filename} appears to contain secret material`)
  }
}

try {
  await stat(new URL('../README.zh.md', import.meta.url))
  failures.push('root README.zh.md must migrate to docs/README.zh.md')
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
}

const notice = await readFile(new URL('../NOTICE', import.meta.url), 'utf8')
const license = await readFile(new URL('../LICENSE', import.meta.url), 'utf8')
for (const [filename, text] of [['NOTICE', notice], ['LICENSE', license]]) {
  if (!text.includes('Copyright 2026 Frank Song')) failures.push(`${filename} must state upstream Codex Connect copyright`)
  if (!text.includes('Copyright 2026 Yan-Zero')) failures.push(`${filename} must retain original upstream copyright`)
}

const patch = (await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')).replace(/\r\n/gu, '\n')
if (!/^\s*name:\s*["']?@shuind\/dsh-codex-connect["']?$/mu.test(patch)) {
  failures.push('cordis.patch.yml must reference @shuind/dsh-codex-connect')
}
if (!/^\s*- id:\s*llm-openai-codex$/mu.test(patch)) {
  failures.push('cordis.patch.yml must keep row id llm-openai-codex')
}
if (/^- id: agent-default-model/mu.test(patch) || /searchProvider:\s*openai-codex/u.test(patch)) {
  failures.push('bundle patch must not take over Harness routing')
}
if (!/^\s+enableNativeCompaction: false$/mu.test(patch)) {
  failures.push('bundle patch must keep native compaction disabled by default')
}
if (!/^\s+enableImageGeneration: false$/mu.test(patch)) {
  failures.push('bundle patch must keep image generation disabled by default')
}

const clientInject = packageJson.dsh?.client?.inject
for (const platformModule of ['@deepseek-ai/dsh-client-ui-attachment', '@deepseek-ai/dsh-client-ui-slots']) {
  if (Array.isArray(clientInject) && clientInject.includes(platformModule)) {
    failures.push(`dsh.client.inject must not treat static platform module ${platformModule} as a plugin`)
  }
}
if (Object.keys(packageJson.scripts ?? {}).some(script => /images-install|release-workflow-images|workspace-linkage/u.test(script))) {
  failures.push('root package must not expose companion-package scripts')
}
try {
  await stat(new URL('../packages/images/package.json', import.meta.url))
  failures.push('companion images package must not remain in the single-plugin repository')
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
}

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`lint: ${failure}\n`)
  process.exitCode = 1
}
