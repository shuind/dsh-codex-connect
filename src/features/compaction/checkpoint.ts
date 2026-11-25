/** Checkpoint codec, AsyncLocalStorage scope, and retained-input projection for native compaction. */

import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import type { GenerateOptions, Message, RequestMessage, StreamChunk } from '@deepseek-ai/dsh-llm'
import { isCompactCheckpointSource as hasCompactCheckpointSource } from '@deepseek-ai/dsh-compaction'

export const OPENAI_CODEX_NATIVE_COMPACTION_URL = 'https://chatgpt.com/backend-api/codex/responses'
export const OPENAI_CODEX_NATIVE_COMPACTION_RETAINED_BYTES = 64_000
export const OPENAI_CODEX_NATIVE_COMPACTION_MAX_CHECKPOINT_BYTES = 2 * 1024 * 1024

const CHECKPOINT_OPEN = '<dsh-codex-connect-native-compaction-v1>'
const CHECKPOINT_CLOSE = '</dsh-codex-connect-native-compaction-v1>'
const SENTINEL_PREFIX = '<dsh-codex-connect-native-checkpoint:'
const SENTINEL_SUFFIX = '>'

export type JsonRecord = Record<string, unknown>

export interface NativeCompactionScope {
  readonly useNativeCompaction: boolean
  readonly expansions: ReadonlyMap<string, readonly unknown[]>
}

const nativeCompactionScope = new AsyncLocalStorage<NativeCompactionScope>()

export function getNativeCompactionScope(): NativeCompactionScope | undefined {
  return nativeCompactionScope.getStore()
}

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTextBlock(value: unknown): value is { type: 'text'; text: string } {
  return isRecord(value) && value['type'] === 'text' && typeof value['text'] === 'string'
}

function isCompactionInstructionMessage(message: RequestMessage | undefined): boolean {
  if (message === undefined || message.role !== 'user' || 'id' in message) return false
  return message.content.length === 1
    && isTextBlock(message.content[0])
    && message.content[0].text.startsWith('You are now acting as a compaction engine for this AI coding assistant.')
}

function validateNativeItems(value: unknown): readonly unknown[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 1024) {
    throw new Error('Codex native compaction checkpoint has an invalid item list')
  }
  let compactions = 0
  for (const item of value) {
    if (!isRecord(item)) throw new Error('Codex native compaction checkpoint contains a malformed item')
    if (item['type'] === 'compaction') {
      const encrypted = item['encrypted_content']
      if (typeof encrypted !== 'string' || encrypted.trim().length === 0
        || (item['id'] !== undefined && (typeof item['id'] !== 'string' || item['id'].length === 0))) {
        throw new Error('Codex native compaction checkpoint contains invalid encrypted content or identity')
      }
      compactions += 1
    } else if (item['role'] !== 'user' || (item['type'] !== undefined && item['type'] !== 'message')
      || !Array.isArray(item['content'])) {
      throw new Error('Codex native compaction checkpoint contains an unsupported retained item')
    }
  }
  if (compactions !== 1 || !isRecord(value.at(-1)) || value.at(-1)?.['type'] !== 'compaction') {
    throw new Error('Codex native compaction checkpoint must end with exactly one compaction item')
  }
  return value
}

/** Encode one validated native history payload into text that DSH can persist as a summary checkpoint. */
export function encodeNativeCompactionCheckpoint(items: readonly unknown[]): string {
  validateNativeItems(items)
  const payload = JSON.stringify({ version: 1, items })
  if (Buffer.byteLength(payload) > OPENAI_CODEX_NATIVE_COMPACTION_MAX_CHECKPOINT_BYTES) {
    throw new Error('Codex native compaction checkpoint exceeds the local size limit')
  }
  return `${CHECKPOINT_OPEN}${Buffer.from(payload).toString('base64url')}${CHECKPOINT_CLOSE}`
}

/** Decode only a plugin-owned DSH compaction checkpoint. User-authored marker text is never authority. */
export function decodeNativeCompactionCheckpoint(message: Message): readonly unknown[] | undefined {
  if (!hasCompactCheckpointSource(message.source)) return undefined
  const marked = message.content.filter(isTextBlock).map(block => block.text)
    .filter(text => text.includes(CHECKPOINT_OPEN) || text.includes(CHECKPOINT_CLOSE))
  if (marked.length === 0) return undefined
  if (marked.length !== 1) throw new Error('Codex native compaction checkpoint marker is ambiguous')
  const text = marked[0]!
  if (!text.startsWith(CHECKPOINT_OPEN) || !text.endsWith(CHECKPOINT_CLOSE)) {
    throw new Error('Codex native compaction checkpoint marker is malformed')
  }
  const encoded = text.slice(CHECKPOINT_OPEN.length, text.length - CHECKPOINT_CLOSE.length)
  if (encoded.length === 0 || Buffer.byteLength(encoded) > Math.ceil(OPENAI_CODEX_NATIVE_COMPACTION_MAX_CHECKPOINT_BYTES * 4 / 3) + 32) {
    throw new Error('Codex native compaction checkpoint payload is invalid or oversized')
  }
  let decoded: unknown
  try {
    const payload = Buffer.from(encoded, 'base64url')
    if (payload.byteLength > OPENAI_CODEX_NATIVE_COMPACTION_MAX_CHECKPOINT_BYTES) throw new Error('oversized')
    decoded = JSON.parse(payload.toString('utf8'))
  } catch (error: unknown) {
    throw new Error('Codex native compaction checkpoint payload is unreadable', { cause: error })
  }
  if (!isRecord(decoded) || decoded['version'] !== 1) {
    throw new Error('Codex native compaction checkpoint version is unsupported')
  }
  return validateNativeItems(decoded['items'])
}

function prepareScopedRequest(options: GenerateOptions, enabled: boolean): { options: GenerateOptions; scope: NativeCompactionScope } {
  const expansions = new Map<string, readonly unknown[]>()
  let changed = false
  const messages = options.messages.map(message => {
    const items = 'id' in message && message.id !== undefined ? decodeNativeCompactionCheckpoint(message) : undefined
    if (items === undefined) return message
    const sentinel = `${SENTINEL_PREFIX}${randomUUID()}${SENTINEL_SUFFIX}`
    expansions.set(sentinel, items)
    changed = true
    return { ...message, content: [{ type: 'text' as const, text: sentinel }] }
  })
  const instructionVerified = options.purpose === 'compaction' && isCompactionInstructionMessage(options.messages.at(-1))
  return {
    options: changed ? { ...options, messages } : options,
    scope: { useNativeCompaction: enabled && instructionVerified, expansions },
  }
}

/** Keep request-local compaction intent and trusted checkpoint expansion through PiAiAdapter's lazy stream boundary. */
export async function* streamWithNativeCompactionScope(
  stream: (options: GenerateOptions) => AsyncIterable<StreamChunk>,
  options: GenerateOptions,
  enabled: boolean,
): AsyncIterable<StreamChunk> {
  const prepared = prepareScopedRequest(options, enabled)
  const iterator = nativeCompactionScope.run(prepared.scope, () => stream(prepared.options)[Symbol.asyncIterator]())
  try {
    while (true) {
      const next = await nativeCompactionScope.run(prepared.scope, () => iterator.next())
      if (next.done) return
      yield next.value
    }
  } finally {
    if (iterator.return !== undefined) {
      await nativeCompactionScope.run(prepared.scope, () => iterator.return!())
    }
  }
}

function inputText(value: unknown): string | undefined {
  if (!isRecord(value) || !Array.isArray(value['content'])) return undefined
  const content = value['content']
  if (content.length !== 1 || !isRecord(content[0]) || content[0]['type'] !== 'input_text' || typeof content[0]['text'] !== 'string') return undefined
  return content[0]['text']
}

export function expandScopedInput(input: readonly unknown[], scope: NativeCompactionScope): unknown[] {
  if (scope.expansions.size === 0) return [...input]
  const consumed = new Set<string>()
  const expanded: unknown[] = []
  for (const item of input) {
    const text = inputText(item)
    const replacement = text === undefined ? undefined : scope.expansions.get(text)
    if (replacement === undefined) { expanded.push(item); continue }
    consumed.add(text!)
    expanded.push(...replacement)
  }
  if (consumed.size !== scope.expansions.size) {
    throw new Error('Codex native compaction checkpoint could not be projected into the provider request')
  }
  return expanded
}

export function transformCompactionPayload(payload: unknown, scope: NativeCompactionScope): JsonRecord {
  if (!isRecord(payload)) throw new Error('OpenAI Codex generated a non-object Responses payload')
  if (scope.expansions.size === 0) return payload
  const input = payload['input']
  if (!Array.isArray(input)) throw new Error('OpenAI Codex generated a Responses payload without an input array')
  return { ...payload, input: expandScopedInput(input, scope) }
}

function serializedBytes(value: unknown): number {
  try { return Buffer.byteLength(JSON.stringify(value)) } catch { return Number.POSITIVE_INFINITY }
}

/** Retain newest user-role provider items whose serialized UTF-8 fits within the 64k-byte budget. */
export function retainedNativeCompactionInput(input: readonly unknown[]): readonly unknown[] {
  const retained: unknown[] = []
  let used = 2
  for (let index = input.length - 1; index >= 0; index -= 1) {
    const item = input[index]
    if (!isRecord(item) || item['role'] !== 'user') continue
    const size = serializedBytes(item) + (retained.length === 0 ? 0 : 1)
    if (!Number.isFinite(size) || size <= 0 || size > OPENAI_CODEX_NATIVE_COMPACTION_RETAINED_BYTES - used) continue
    retained.push(item)
    used += size
  }
  return retained.reverse()
}
