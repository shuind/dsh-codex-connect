/** Per-conversation OpenAI Codex speed control for the Composer row. */

import { useSyncExternalStore } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { OpenAICodexSettingsKey } from '../locales/index.ts'
import { OpenAICodexSpeedControl } from './OpenAICodexSpeedControl.tsx'

const CODEX_PROVIDER = 'openai-codex'

type Translate = (key: OpenAICodexSettingsKey, params?: Record<string, unknown>) => string

export interface OpenAICodexFastModeToggleInjected {
  /** Session-scoped model directory shared with the model selector and quota. */
  readonly directory: SnapshotStore<ModelDirectoryState>
}

function isEligible(state: ModelDirectoryState): boolean {
  const current = state.current
  return (state.status === 'ready' || state.status === 'selecting')
    && current?.provider === CODEX_PROVIDER
    && typeof current.model === 'string'
    && current.model.startsWith('gpt-')
}

/** Render the session-addressed Standard/Fast control for GPT models on the Codex provider. */
export function OpenAICodexFastModeToggle(props: OpenAICodexFastModeToggleInjected & { sessionId: string; t: Translate }) {
  const snapshot = useSyncExternalStore(
    listener => props.directory.subscribe(listener),
    () => props.directory.getSnapshot(),
    () => props.directory.getSnapshot(),
  )
  if (!isEligible(snapshot)) return null
  const model = snapshot.current!.model
  return <OpenAICodexSpeedControl key={`${props.sessionId}:${model}`} sessionId={props.sessionId} model={model} t={props.t} selectionPending={snapshot.status === 'selecting'} />
}
