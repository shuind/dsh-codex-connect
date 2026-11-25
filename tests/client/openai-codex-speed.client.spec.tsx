// @vitest-environment jsdom
import { act, cleanup, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { OpenAICodexFastModeToggle } from '../../src/client/speed/OpenAICodexFastModeToggle.tsx'
import { en } from '../../src/client/locales/index.ts'
import type { OpenAICodexSettingsKey } from '../../src/client/locales/index.ts'
import { speedLifecycleFixture } from '../support/speed-lifecycle-fixture.ts'
import { BROWSER_REQUEST_TIMEOUT_MS } from '../../src/client/shared/request-json.ts'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers() })
const t = (key: OpenAICodexSettingsKey) => en[key]
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })

function directory(model = 'gpt-6.2-sol', provider = 'openai-codex') {
  let current: ModelDirectoryState = { current: { model, provider }, routable: true, groups: [], failures: [], status: 'ready', pending: null, error: null }
  const listeners = new Set<() => void>()
  const store: SnapshotStore<ModelDirectoryState> = {
    getSnapshot: () => current,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
    update: () => undefined,
    set: () => undefined,
  }
  return {
    store,
    change: (next: string) => {
      current = { ...current, current: { provider, model: next } }
      listeners.forEach(listener => { listener() })
    },
  }
}

async function backend() {
  const f = await speedLifecycleFixture()
  const fetch = vi.fn((path: string, init: RequestInit) => f.request(path, init))
  vi.stubGlobal('fetch', fetch)
  return Object.assign(fetch, f)
}

function openSpeedMenu(view: ReturnType<typeof render>, buttonName: string) {
  fireEvent.click(view.getByRole('button', { name: buttonName }))
  return screen.getByRole('menu')
}

it('renders a compact two-option Standard/Fast menu only for Codex GPT models', async () => {
  const fetch = await backend()
  const view = render(<OpenAICodexFastModeToggle directory={directory().store} sessionId="session" t={t} />)
  await waitFor(() => { expect(view.getByRole('button', { name: en.speedMenuStandardTitle })).toHaveProperty('disabled', false) })
  expect(view.container.querySelectorAll('button')).toHaveLength(1)
  const button = view.getByRole('button', { name: en.speedMenuStandardTitle })
  expect(button.getAttribute('aria-haspopup')).toBe('menu')
  expect(button.getAttribute('aria-pressed')).toBe('false')

  const menu = openSpeedMenu(view, en.speedMenuStandardTitle)
  expect(menu.parentElement).toBe(document.body)
  expect(menu.getAttribute('data-anchor-side')).toBe('top')
  expect(menu.getAttribute('data-anchor-align')).toBe('end')
  const items = within(menu).getAllByRole('menuitemradio')
  expect(items.map(item => item.getAttribute('data-speed-mode'))).toEqual(['standard', 'fast'])
  expect(within(menu).getByRole('menuitemradio', { name: 'Standard' }).getAttribute('aria-checked')).toBe('true')
  expect(within(menu).getByRole('menuitemradio', { name: 'Fast' }).getAttribute('aria-checked')).toBe('false')

  fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'Fast' }))
  await waitFor(() => { expect(view.getByRole('button', { name: en.speedMenuFastTitle }).getAttribute('aria-pressed')).toBe('true') })
  expect(screen.queryByRole('menu')).toBeNull()
  expect(fetch.registry.isEnabled('session')).toBe(true)

  fireEvent.click(within(openSpeedMenu(view, en.speedMenuFastTitle)).getByRole('menuitemradio', { name: 'Standard' }))
  await waitFor(() => { expect(view.getByRole('button', { name: en.speedMenuStandardTitle }).getAttribute('aria-pressed')).toBe('false') })
  expect(fetch.registry.isEnabled('session')).toBe(false)
  expect(fetch.mock.calls.filter(([, init]) => init.method === 'POST').map(([, init]) => JSON.parse(String(init.body)).mode)).toEqual(['fast', 'standard'])

  view.rerender(<OpenAICodexFastModeToggle directory={directory('gpt-6.2-sol', 'other').store} sessionId="session" t={t} />)
  expect(view.container.querySelector('[data-openai-codex-speed-menu]')).toBeNull()
})

it('retains a Fast choice across unmount/remount and across concurrent views', async () => {
  const fetch = await backend(), d = directory()
  const props = { directory: d.store, sessionId: 'session', t }
  const a = render(<OpenAICodexFastModeToggle {...props} />)
  const b = render(<OpenAICodexFastModeToggle {...props} />)
  const aView = within(a.container), bView = within(b.container)
  await waitFor(() => { expect(aView.getByRole('button', { name: en.speedMenuStandardTitle })).toHaveProperty('disabled', false) })
  await waitFor(() => { expect(bView.getByRole('button', { name: en.speedMenuStandardTitle })).toHaveProperty('disabled', false) })
  fireEvent.click(bView.getByRole('button', { name: en.speedMenuStandardTitle }))
  fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitemradio', { name: 'Fast' }))
  await waitFor(() => { expect(bView.getByRole('button', { name: en.speedMenuFastTitle }).getAttribute('aria-pressed')).toBe('true') })
  await act(async () => { a.unmount() })
  expect(fetch.registry.isEnabled('session')).toBe(true)
  await act(async () => { b.unmount() })
  render(<OpenAICodexFastModeToggle {...props} />)
  await waitFor(() => { expect(screen.getByRole('button', { name: en.speedMenuFastTitle }).getAttribute('aria-pressed')).toBe('true') })
})

it('supports keyboard navigation (Arrow, Enter, Escape, Tab) and outside pointer close', async () => {
  const fetch = await backend()
  const view = render(<OpenAICodexFastModeToggle directory={directory().store} sessionId="session" t={t} />)
  await waitFor(() => { expect(view.getByRole('button', { name: en.speedMenuStandardTitle })).toBeTruthy() })

  let menu = openSpeedMenu(view, en.speedMenuStandardTitle)
  fireEvent.keyDown(menu, { key: 'Escape' })
  expect(screen.queryByRole('menu')).toBeNull()

  openSpeedMenu(view, en.speedMenuStandardTitle)
  fireEvent.pointerDown(document.body)
  expect(screen.queryByRole('menu')).toBeNull()

  menu = openSpeedMenu(view, en.speedMenuStandardTitle)
  const fastRow = within(menu).getByRole('menuitemradio', { name: 'Fast' })
  fastRow.focus()
  const tab = createEvent.keyDown(fastRow, { key: 'Tab' })
  fireEvent(fastRow, tab)
  expect(screen.queryByRole('menu')).toBeNull()
  expect(tab.defaultPrevented).toBe(true)
  expect(document.activeElement).toBe(view.getByRole('button', { name: en.speedMenuStandardTitle }))

  menu = openSpeedMenu(view, en.speedMenuStandardTitle)
  expect(document.activeElement).toBe(within(menu).getByRole('menuitemradio', { name: 'Standard' }))
  fireEvent.keyDown(menu, { key: 'ArrowDown' })
  expect(document.activeElement).toBe(within(menu).getByRole('menuitemradio', { name: 'Fast' }))
  fireEvent.keyDown(document.activeElement as Element, { key: 'Enter' })
  await waitFor(() => { expect(view.getByRole('button', { name: en.speedMenuFastTitle }).getAttribute('aria-pressed')).toBe('true') })
  expect(fetch.mock.calls.filter(([, init]) => init.method === 'POST').map(([, init]) => JSON.parse(String(init.body)).mode)).toEqual(['fast'])
})

it('recovers an uncertain POST via explicit GET and announces transitions in the live region', async () => {
  const fetch = await backend(), normal = fetch.getMockImplementation()!
  fetch.mockImplementation((path, init) => init.method === 'POST' ? Promise.resolve(json({ error: 'forbidden' }, 403)) : normal(path, init))
  const view = render(<OpenAICodexFastModeToggle directory={directory().store} sessionId="session" t={t} />)
  const live = within(view.container).getByRole('status')
  expect(live.textContent).toBe(en.speedLoading)
  await waitFor(() => { expect(live.textContent).toBe(en.speedMenuStandardTitle) })
  fireEvent.click(within(openSpeedMenu(view, en.speedMenuStandardTitle)).getByRole('menuitemradio', { name: 'Fast' }))
  await waitFor(() => { expect(view.getByRole('button', { name: en.speedRecover })).toBeTruthy() })
  fireEvent.click(view.getByRole('button', { name: en.speedRecover }))
  await waitFor(() => { expect(view.getByRole('button', { name: en.speedMenuStandardTitle }).getAttribute('aria-pressed')).toBe('false') })
  expect(fetch.mock.calls.filter(([, init]) => init.method === 'POST')).toHaveLength(1)
})

const stalledState = { generation: 'stalled-generation', revision: 0, mode: 'fast' as const, model: 'gpt-6.2-sol' }

it.each([['GET', 'headers'], ['GET', 'body'], ['POST', 'headers'], ['POST', 'body']] as const)(
  'bounds a stalled %s %s and recovers only through an explicit read', async (method, kind) => {
    vi.useFakeTimers()
    const raw = await speedLifecycleFixture()
    let armed = true
    let signal: AbortSignal | undefined
    let releaseLate!: () => void
    const gate = new Promise<void>(done => { releaseLate = done })
    const fetchMock = vi.fn((path: string, init: RequestInit) => {
      const requestMethod = init.method ?? 'GET'
      if (armed && requestMethod === method) {
        armed = false
        signal = init.signal ?? undefined
        return kind === 'headers'
          ? gate.then(() => json(stalledState))
          : Promise.resolve({ ok: true, json: () => gate.then(() => stalledState) } as unknown as Response)
      }
      return raw.request(path, init)
    })
    vi.stubGlobal('fetch', fetchMock)
    const view = render(<OpenAICodexFastModeToggle directory={directory().store} sessionId="session" t={t} />)
    await act(async () => {})
    if (method === 'POST') fireEvent.click(within(openSpeedMenu(view, en.speedMenuStandardTitle)).getByRole('menuitemradio', { name: 'Fast' }))
    await act(async () => {})
    await act(async () => { await vi.advanceTimersByTimeAsync(BROWSER_REQUEST_TIMEOUT_MS) })
    expect(signal?.aborted).toBe(true)
    const recover = view.getByRole('button', { name: en.speedRecover })
    expect(recover).toHaveProperty('disabled', false)
    fireEvent.click(recover)
    await act(async () => {})
    for (let tick = 0; tick < 8 && view.queryByRole('button', { name: en.speedMenuStandardTitle }) === null; tick++) await act(async () => {})
    expect(view.getByRole('button', { name: en.speedMenuStandardTitle }).getAttribute('aria-pressed')).toBe('false')
    await act(async () => { releaseLate(); await gate })
    expect(view.getByRole('button', { name: en.speedMenuStandardTitle }).getAttribute('aria-pressed')).toBe('false')
    expect(fetchMock.mock.calls.filter(([, init]) => (init.method ?? 'GET') === 'POST')).toHaveLength(method === 'POST' ? 1 : 0)
  },
)

it('aborts an in-flight POST when unmounting or switching sessions', async () => {
  const raw = await speedLifecycleFixture()
  let postSignal: AbortSignal | undefined
  const fetchMock = vi.fn((path: string, init: RequestInit) => (init.method ?? 'GET') === 'POST'
    ? ((postSignal = init.signal ?? undefined), new Promise<Response>(() => {}))
    : raw.request(path, init))
  vi.stubGlobal('fetch', fetchMock)
  const view = render(<OpenAICodexFastModeToggle directory={directory().store} sessionId="session" t={t} />)
  await waitFor(() => { expect(view.getByRole('button', { name: en.speedMenuStandardTitle })).toHaveProperty('disabled', false) })
  fireEvent.click(within(openSpeedMenu(view, en.speedMenuStandardTitle)).getByRole('menuitemradio', { name: 'Fast' }))
  await waitFor(() => { expect(postSignal).toBeDefined() })
  await act(async () => { view.unmount() })
  expect(postSignal?.aborted).toBe(true)
})
