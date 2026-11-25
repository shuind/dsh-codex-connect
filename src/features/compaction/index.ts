/** Provider-native Responses V2 compaction bridged through DSH's compaction transaction. */

import { createAssistantMessageEventStream } from '@earendil-works/pi-ai'
import type { Api, AssistantMessageEventStream, Model, Provider, SimpleStreamOptions, TranscriptContext } from '@earendil-works/pi-ai'
import {
  decodeNativeCompactionCheckpoint,
  encodeNativeCompactionCheckpoint,
  getNativeCompactionScope,
  OPENAI_CODEX_NATIVE_COMPACTION_MAX_CHECKPOINT_BYTES,
  OPENAI_CODEX_NATIVE_COMPACTION_RETAINED_BYTES,
  OPENAI_CODEX_NATIVE_COMPACTION_URL,
  retainedNativeCompactionInput,
  streamWithNativeCompactionScope,
  transformCompactionPayload,
  type NativeCompactionScope,
} from './checkpoint.ts'
import { failedStream, markerStream } from './sse-parser.ts'
import { requestNativeCompaction } from './request.ts'

export {
  decodeNativeCompactionCheckpoint,
  encodeNativeCompactionCheckpoint,
  OPENAI_CODEX_NATIVE_COMPACTION_MAX_CHECKPOINT_BYTES,
  OPENAI_CODEX_NATIVE_COMPACTION_RETAINED_BYTES,
  OPENAI_CODEX_NATIVE_COMPACTION_URL,
  retainedNativeCompactionInput,
  streamWithNativeCompactionScope,
}

function standardStream(
  provider: Provider,
  model: Model<Api>,
  context: TranscriptContext,
  options: SimpleStreamOptions | undefined,
  scope: NativeCompactionScope | undefined,
): AssistantMessageEventStream {
  if (scope === undefined || scope.expansions.size === 0) return provider.streamSimple(model, context, options)
  return provider.streamSimple(model, context, {
    ...options,
    onPayload: async (payload, payloadModel) => {
      const transformed = transformCompactionPayload(payload, scope)
      const replacement = await options?.onPayload?.(transformed, payloadModel)
      return replacement === undefined ? transformed : replacement
    },
  })
}

function nativeCompactionStream(
  provider: Provider,
  model: Model<Api>,
  context: TranscriptContext,
  options: SimpleStreamOptions | undefined,
  scope: NativeCompactionScope,
): AssistantMessageEventStream {
  const target = createAssistantMessageEventStream()
  void (async () => {
    let source: AssistantMessageEventStream
    try {
      const response = await requestNativeCompaction(model, context, options, scope)
      options?.signal?.throwIfAborted()
      source = markerStream(model, response)
    } catch (error: unknown) {
      source = options?.signal?.aborted === true
        ? failedStream(model, error, options.signal)
        : standardStream(provider, model, context, options, scope)
    }
    for await (const event of source) target.push(event)
  })().catch(async (error: unknown) => {
    for await (const event of failedStream(model, error, options?.signal)) target.push(event)
  })
  return target
}

/** Add native-compaction behavior while keeping ordinary provider requests unchanged. */
export function withOpenAICodexNativeCompaction(provider: Provider): Provider {
  return {
    ...provider,
    streamSimple(model, context, options) {
      const scope = getNativeCompactionScope()
      if (scope?.useNativeCompaction === true) {
        return nativeCompactionStream(provider, model, context, options, scope)
      }
      return standardStream(provider, model, context, options, scope)
    },
  }
}
