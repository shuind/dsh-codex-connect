import { expect, it } from 'vitest'
import { ConversationSpeedRegistry, createConversationSpeedRegistry } from '../../src/features/provider/speed/conversation-speed.ts'
import { httpRouteTestContext } from '../support/http-route-test-context.ts'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import Sessions, { SessionId } from '@deepseek-ai/dsh-session'
import type { ConversationSpeedScope } from '../../src/features/provider/speed/conversation-speed.ts'

const scope: ConversationSpeedScope = {
  workspace: 'fixture-workspace',
  accountKey: 'acct_' + 'a'.repeat(43),
  provider: 'openai-codex',
  model: 'gpt-6.2-sol',
}

function choose(
  registry: ConversationSpeedRegistry,
  mode: 'standard' | 'fast',
  currentScope = scope,
  session = 'session',
) {
  const state = registry.readSpeed(session, currentScope)
  return registry.selectSpeed(session, currentScope, state.generation, state.revision, mode)
}

it('starts Standard and switches cleanly between Standard and Fast', () => {
  const registry = new ConversationSpeedRegistry()
  expect(registry.readSpeed('session', scope)).toMatchObject({ mode: 'standard', model: 'gpt-6.2-sol' })
  expect(choose(registry, 'fast').mode).toBe('fast')
  expect(registry.isEnabled('session')).toBe(true)
  expect(registry.requestSpeed('session', scope)).toBe('fast')
  expect(choose(registry, 'standard').mode).toBe('standard')
  expect(registry.isEnabled('session')).toBe(false)
  expect(registry.requestSpeed('session', scope)).toBe('standard')
})

it('preserves an explicitly enabled Fast choice across model and account changes', () => {
  const registry = new ConversationSpeedRegistry()
  const before = { ...scope, workspace: registry.workspaceFor('session') }
  const old = choose(registry, 'fast', before)
  expect(registry.readSpeed('session', { ...before, model: 'gpt-6.2-astra' }).mode).toBe('fast')
  registry.invalidateAccountSelections()
  const after = { ...scope, workspace: registry.workspaceFor('session') }
  expect(() => registry.selectSpeed('session', after, old.generation, old.revision, 'standard')).toThrow('SPEED_SELECTION_STALE')
  expect(registry.readSpeed('session', after).mode).toBe('fast')
  expect(registry.isEnabled('session')).toBe(true)
})

it('ignores a foreign Session incarnation with the same id and advances workspace on live model selection', async () => {
  const { ctx } = httpRouteTestContext()
  await ctx.plugin(Sessions)
  const sessions = ctx.get('sessions') as unknown as Sessions
  const session = sessions.create(SessionId('native-speed'))
  const registry = createConversationSpeedRegistry(ctx)
  const before = { ...scope, workspace: registry.workspaceFor(session.id) }
  const selected = choose(registry, 'fast', before, session.id)

  const foreign = { id: session.id } as Session
  ctx.emit('session/event', foreign, { type: 'model/selection', seq: 1 } as SessionEvent)
  expect(registry.workspaceFor(session.id)).toBe(before.workspace)

  session.append('model/selection', { provider: 'openai-codex', model: 'gpt-6.2-astra' })
  const after = { ...scope, workspace: registry.workspaceFor(session.id) }
  expect(after.workspace).not.toBe(before.workspace)
  expect(() => registry.selectSpeed(session.id, after, selected.generation, selected.revision, 'standard')).toThrow('SPEED_SELECTION_STALE')
  expect(registry.readSpeed(session.id, after).mode).toBe('fast')
})

it('rejects stale generations after bounded control eviction or duplicate mutations', () => {
  const bounded = new ConversationSpeedRegistry(1)
  const old = choose(bounded, 'fast')
  bounded.readSpeed('other', scope)
  expect(() => bounded.selectSpeed('session', scope, old.generation, old.revision, 'standard')).toThrow('SPEED_SELECTION_STALE')
  expect(bounded.readSpeed('session', scope).generation).not.toBe(old.generation)

  const registry = new ConversationSpeedRegistry()
  const initial = registry.readSpeed('session', scope)
  registry.selectSpeed('session', scope, initial.generation, initial.revision, 'fast')
  expect(() => registry.selectSpeed('session', scope, initial.generation, initial.revision, 'standard')).toThrow('SPEED_SELECTION_STALE')
  expect(registry.requestSpeed('session', scope)).toBe('fast')
})
