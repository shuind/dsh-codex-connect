/** Bounded explicit Standard/Fast speed choices per conversation. */
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { Session, SessionStore } from '@deepseek-ai/dsh-session'
import { FastModeRegistry, isFastModeSessionId, OPENAI_CODEX_FAST_MODE_MAX_SESSIONS } from './fast-mode.ts'
import type { OpenAICodexSpeedMode, ConversationSpeedState } from '../../../shared/models.ts'

export interface ConversationSpeedScope {
  readonly workspace: string
  readonly accountKey: string | undefined
  readonly provider: string
  readonly model: string
}

interface Control {
  readonly generation: string
  revision: number
  mode: OpenAICodexSpeedMode
  readonly scope: ConversationSpeedScope
}

const sameScope = (a: ConversationSpeedScope, b: ConversationSpeedScope): boolean =>
  a.workspace === b.workspace && a.accountKey === b.accountKey && a.provider === b.provider && a.model === b.model

function validScope(scope: ConversationSpeedScope): void {
  if (scope.provider !== 'openai-codex' || typeof scope.workspace !== 'string' || !scope.workspace.trim() || scope.workspace.length > 256
    || typeof scope.model !== 'string' || !scope.model.trim() || scope.model.length > 256
    || (scope.accountKey !== undefined && !/^acct_[A-Za-z0-9_-]{43}$/u.test(scope.accountKey))) {
    throw new TypeError('Invalid speed scope')
  }
}

/** Per-conversation Standard/Fast selector backed by FastModeRegistry. */
export class ConversationSpeedRegistry extends FastModeRegistry {
  readonly workspace = randomUUID()
  private readonly controls = new Map<string, Control>()
  private readonly controlLimit: number
  private accountEpoch = 0

  constructor(limit = OPENAI_CODEX_FAST_MODE_MAX_SESSIONS, private readonly selectionKey?: (sessionId: string) => string | undefined) {
    super(limit)
    this.controlLimit = limit
  }

  override set(sessionId: unknown, enabled: boolean): void {
    super.set(sessionId, enabled)
    this.controls.delete(sessionId as string)
  }

  override delete(sessionId: unknown): void {
    super.delete(sessionId)
    if (typeof sessionId === 'string') this.controls.delete(sessionId)
  }

  override clear(): void {
    super.clear()
    this.controls.clear()
  }

  /** Advance the account scope epoch when accounts change; preserves Fast preferences. */
  invalidateAccountSelections(): void {
    this.accountEpoch++
    this.controls.clear()
  }

  /** Retire a session's cached control revision when Host model selection changes. */
  invalidateModelSelection(sessionId: unknown): void {
    if (isFastModeSessionId(sessionId)) this.controls.delete(sessionId)
  }

  workspaceFor(sessionId: unknown): string {
    const key = typeof sessionId === 'string' ? this.selectionKey?.(sessionId) : undefined
    const workspace = this.accountEpoch === 0 ? this.workspace : this.workspace + ':account-' + this.accountEpoch
    return this.selectionKey === undefined ? workspace : workspace + ':' + (key ?? 'selection-unavailable')
  }

  readSpeed(sessionId: string, scope: ConversationSpeedScope): ConversationSpeedState {
    if (!isFastModeSessionId(sessionId)) throw new TypeError('Invalid speed session')
    validScope(scope)
    let control = this.controls.get(sessionId)
    const mode: OpenAICodexSpeedMode = super.isEnabled(sessionId) ? 'fast' : 'standard'
    if (control === undefined || !sameScope(control.scope, scope)) {
      control = { generation: randomUUID(), revision: 0, mode, scope: { ...scope } }
    } else {
      control.mode = mode
    }
    this.controls.delete(sessionId)
    while (this.controls.size >= this.controlLimit) this.controls.delete(this.controls.keys().next().value!)
    this.controls.set(sessionId, control)
    return this.snapshot(control)
  }

  selectSpeed(sessionId: string, scope: ConversationSpeedScope, generation: string, revision: number, mode: OpenAICodexSpeedMode): ConversationSpeedState {
    validScope(scope)
    const control = this.controls.get(sessionId)
    if (control === undefined || !sameScope(control.scope, scope) || control.generation !== generation || control.revision !== revision) {
      throw new TypeError('SPEED_SELECTION_STALE')
    }
    if (mode !== 'standard' && mode !== 'fast') throw new TypeError('Invalid speed mode')
    super.set(sessionId, mode === 'fast')
    control.mode = mode
    control.revision++
    return this.snapshot(control)
  }

  requestSpeed(sessionId: unknown, scope: ConversationSpeedScope): OpenAICodexSpeedMode {
    if (!isFastModeSessionId(sessionId)) return 'standard'
    validScope(scope)
    return super.isEnabled(sessionId) ? 'fast' : 'standard'
  }

  private snapshot(control: Control): ConversationSpeedState {
    return {
      generation: control.generation,
      revision: control.revision,
      mode: control.mode,
      model: control.scope.model,
    }
  }
}

/** Track Host model-selection revisions so concurrent UI edits stay serialized. */
export function createConversationSpeedRegistry(ctx: Context): ConversationSpeedRegistry {
  const selections = new WeakMap<Session, { generation: string; revision: number }>()
  const liveSession = (sessionId: string): Session | undefined => {
    const sessions = ctx.get('sessions') as Partial<SessionStore> | undefined
    return sessions?.get?.(SessionId(sessionId))
  }
  const entry = (session: Session) => {
    let value = selections.get(session)
    if (value === undefined) { value = { generation: randomUUID(), revision: 0 }; selections.set(session, value) }
    return value
  }
  const registry = new ConversationSpeedRegistry(OPENAI_CODEX_FAST_MODE_MAX_SESSIONS, sessionId => {
    const session = liveSession(sessionId)
    if (session === undefined) return undefined
    const selection = entry(session)
    return selection.generation + ':' + selection.revision
  })
  ctx.on('session/event', (session, event) => {
    if (event.type !== 'model/selection' || liveSession(session.id) !== session) return
    entry(session).revision++
    registry.invalidateModelSelection(session.id)
  }, { global: true })
  return registry
}
