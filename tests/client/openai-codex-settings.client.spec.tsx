// @vitest-environment jsdom

import { StrictMode } from 'react'
import { BROWSER_REQUEST_TIMEOUT_MS } from '../../src/client/shared/request-json.ts'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import { formatOpenAICodexResetAt, OpenAICodexSettings } from '../../src/client/settings/OpenAICodexSettings.tsx'
import { OpenAICodexConfiguration, validContextEdits } from '../../src/client/settings/OpenAICodexConfiguration.tsx'
import { en, zh } from '../../src/client/locales/index.ts'
import type { OpenAICodexSettingsKey } from '../../src/client/locales/index.ts'
import { DEFAULT_OPENAI_CODEX_SETTINGS } from '../../src/shared/settings.ts'
import type { OpenAICodexSettingsConfig } from '../../src/shared/settings.ts'
import {
  OPENAI_CODEX_AUTH_ACCOUNTS_PATH,
  OPENAI_CODEX_AUTH_LOGIN_PATH,
  OPENAI_CODEX_AUTH_LOGOUT_PATH,
  OPENAI_CODEX_AUTH_STATUS_PATH,
} from '../../src/shared/auth.ts'
import { OPENAI_CODEX_MODEL_CATALOG_PATH } from '../../src/shared/models.ts'
import { modelCatalogFixture } from '../support/model-catalog-fixture.ts'

function t(key: OpenAICodexSettingsKey, params: Record<string, unknown> = {}): string {
  return Object.entries(params).reduce(
    (value, [name, replacement]) => value.replace(`{${name}}`, String(replacement)),
    en[key],
  )
}

function json(value: unknown, status = 200): Response {
  const projected = typeof value === 'object' && value !== null && 'status' in value
    ? { ...value, accounts: value.status === 'signed-in' || value.status === 'reauth-required' ? [{
      accountKey: `acct_${'a'.repeat(43)}`, active: true, displayName: 'Work account',
      maskedEmail: 'wo••@example.com', profileSource: 'oauth',
    }] : [] }
    : value
  return new Response(JSON.stringify(projected), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function requestPath(input: string | URL | Request): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.pathname : new URL(input.url).pathname
}

function popupFixture(): { popup: Window; close: ReturnType<typeof vi.fn>; replace: ReturnType<typeof vi.fn> } {
  const close = vi.fn()
  const replace = vi.fn()
  return {
    popup: { close, opener: window, location: { replace } } as unknown as Window,
    close,
    replace,
  }
}

function settingsScopeFixture(
  writable = true,
  initial: OpenAICodexSettingsConfig = DEFAULT_OPENAI_CODEX_SETTINGS,
  snapshotMode: 'host' | 'memory' | 'absent' = 'host',
): {
  scope: ConfigForm<OpenAICodexSettingsConfig>
  set: ReturnType<typeof vi.fn>
  mutate: ReturnType<typeof vi.fn>
} {
  // Alpha.3 omits mode; the dev SDK still requires the legacy property.
  let snapshot: Omit<ConfigFormSnapshot<OpenAICodexSettingsConfig>, 'mode'> & { mode?: 'host' | 'memory' } = {
    status: 'ready',
    value: { ...initial },
    base: { ...initial },
    user: undefined,
    revision: 0,
    writable,
    ...(snapshotMode === 'absent' ? {} : { mode: snapshotMode }),
  }
  const listeners = new Set<() => void>()
  const set = vi.fn(async (field: string, value: unknown) => {
    const current = snapshot.value
    if (current === undefined || !(field in current)) throw new Error(`unknown field ${field}`)
    snapshot = {
      ...snapshot,
      value: { ...current, [field]: value },
      user: { ...typeof snapshot.user === 'object' && snapshot.user !== null ? snapshot.user : {}, [field]: value },
      revision: (snapshot.revision ?? 0) + 1,
    }
    for (const listener of listeners) listener()
    return true
  })
  const mutate = vi.fn<ConfigForm<OpenAICodexSettingsConfig>['mutate']>(async (ops, revision) => {
    if (revision !== snapshot.revision) throw new Error('stale revision')
    const next = { ...snapshot.value! }
    for (const op of ops) {
      if (op.path.length !== 1) throw new Error('fixture requires top-level fields')
      Object.assign(next, { [op.path[0]!]: op.op === 'set' ? ['reasoningEffort', 'newSessionSpeedMode', 'newSubagentSpeedMode'].includes(String(op.path[0])) && op.value === null ? undefined : op.value : undefined })
    }
    snapshot = { ...snapshot, value: next, revision: (snapshot.revision ?? 0) + 1 }
    for (const listener of listeners) listener()
    return true
  })
  return {
    set,
    mutate,
    scope: {
      getSnapshot: () => snapshot as ConfigFormSnapshot<OpenAICodexSettingsConfig>,
      subscribe(listener) {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
      set,
      mutate,
      unset: vi.fn(async () => true),
    },
  }
}

beforeEach(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value(this: HTMLDialogElement) { this.setAttribute('open', '') },
    },
    close: {
      configurable: true,
      value(this: HTMLDialogElement) { this.removeAttribute('open') },
    },
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('OpenAI Codex Plugin configuration card', () => {
  it('does not count an unsaved capability draft until saved', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => requestPath(input) === OPENAI_CODEX_MODEL_CATALOG_PATH
      ? json(modelCatalogFixture([{ id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna' }])) : json({ status: 'signed-out' })))
    const { scope } = settingsScopeFixture(true, { ...DEFAULT_OPENAI_CODEX_SETTINGS })
    render(<OpenAICodexSettings t={t} configScope={scope} embedded />)
    const capabilities = screen.getByRole('tab', { name: en.capabilitiesModule })
    expect(within(capabilities).queryByText('1')).toBeNull()
    fireEvent.click(capabilities)
    fireEvent.click(screen.getByRole('checkbox', { name: en.enableNativeCompaction }))
    expect(within(capabilities).queryByText('1')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await within(capabilities).findByText('1')
  })

  it('shows a dedicated remote-origin trust state without auth mutations and copies only the suggested command', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request): Promise<Response> => {
      expect(requestPath(input)).toBe(OPENAI_CODEX_AUTH_STATUS_PATH)
      return json({ error: 'remote-web-origin-not-trusted' }, 403)
    })
    const writeText = vi.fn(async (_value: string): Promise<void> => undefined)
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const popup = vi.spyOn(window, 'open')

    render(<OpenAICodexSettings t={t} embedded />)
    expect(await screen.findByText(en.remoteOriginDescription)).toBeTruthy()
    const command = `dsh plugin --profile web exec @shuind/dsh-codex-connect trust-origin ${window.location.origin}`
    expect(screen.getByText(command)).toBeTruthy()
    expect(screen.queryByRole('button', { name: en.login })).toBeNull()
    expect(screen.queryByRole('button', { name: en.logout })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.remoteOriginCopy }))
    await waitFor(() => { expect(writeText).toHaveBeenCalledWith(command) })
    expect(popup).not.toHaveBeenCalled()
    expect(fetchMock.mock.calls.map(([input]) => requestPath(input))).toEqual([OPENAI_CODEX_AUTH_STATUS_PATH])
  })

  it('offers a user-clicked browser link when the popup is blocked', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request): Promise<Response> => {
      const path = requestPath(input)
      if (path === OPENAI_CODEX_AUTH_STATUS_PATH) return json({ status: 'signed-out' })
      expect(path).toBe(OPENAI_CODEX_AUTH_LOGIN_PATH)
      return json({ url: 'https://auth.openai.com/authorize' })
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(window, 'open').mockReturnValue(null)

    render(<OpenAICodexSettings t={t} embedded />)
    const login = await screen.findByRole('button', { name: en.login }) as HTMLButtonElement
    expect(login.style.background).toBe('var(--dsw-alias-button-primary-fill)')
    expect(login.style.color).toBe('var(--dsw-alias-label-primary-foreground)')
    fireEvent.click(login)

    expect(await screen.findByText(en.authorizationHelp)).toBeTruthy()
    const link = screen.getByRole('link', { name: en.openLoginInBrowser }) as HTMLAnchorElement
    expect(link.href).toBe('https://auth.openai.com/authorize')
    expect(link.target).toBe('_blank')
    expect(link.rel).toContain('noopener')
    expect(link.rel).toContain('noreferrer')
    expect(fetchMock.mock.calls.map(([input]) => requestPath(input))).toEqual([OPENAI_CODEX_AUTH_STATUS_PATH, OPENAI_CODEX_AUTH_LOGIN_PATH])
  })

  it('closes the popup and surfaces a failed login request', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request): Promise<Response> => {
      const path = requestPath(input)
      if (path === OPENAI_CODEX_AUTH_STATUS_PATH) return json({ status: 'signed-out' })
      expect(path).toBe(OPENAI_CODEX_AUTH_LOGIN_PATH)
      return json({ error: 'OAuth is unavailable' }, 503)
    })
    const { popup, close } = popupFixture()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(window, 'open').mockReturnValue(popup)

    render(<OpenAICodexSettings t={t} embedded />)
    fireEvent.click(await screen.findByRole('button', { name: en.login }))

    expect(await screen.findByText('OAuth is unavailable')).toBeTruthy()
    expect(close).toHaveBeenCalledOnce()
  })

  it('renders reauth-required and reuses the sign-in flow without logout', async () => {
    const reauthMessage = 'OpenAI Codex authorization must be renewed'
    const fetchMock = vi.fn(async (input: string | URL | Request): Promise<Response> => {
      const path = requestPath(input)
      if (path === OPENAI_CODEX_AUTH_STATUS_PATH) {
        return json({ status: 'reauth-required', message: reauthMessage })
      }
      expect(path).toBe(OPENAI_CODEX_AUTH_LOGIN_PATH)
      return json({ url: 'https://auth.openai.com/authorize' })
    })
    const { popup, replace } = popupFixture()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(window, 'open').mockReturnValue(popup)

    render(<OpenAICodexSettings t={t} embedded />)
    expect(await screen.findByText(reauthMessage)).toBeTruthy()
    expect(within(screen.getByRole('tabpanel', { name: en.accountModule })).getByRole('status').textContent).toContain(en.reauthRequired)
    expect(screen.getByRole('button', { name: en.reauthorize })).toBeTruthy()
    expect(screen.queryByRole('button', { name: en.logout })).toBeNull()
    expect(zh.reauthRequired).toBe('需要重新登录')

    fireEvent.click(screen.getByRole('button', { name: en.reauthorize }))
    await waitFor(() => { expect(replace).toHaveBeenCalledWith('https://auth.openai.com/authorize') })

    const paths = fetchMock.mock.calls.map(([input]) => requestPath(input))
    expect(paths).toContain(OPENAI_CODEX_AUTH_LOGIN_PATH)
    expect(paths).not.toContain(OPENAI_CODEX_AUTH_LOGOUT_PATH)
    expect(popup.opener).toBeNull()
  })

  it('renders signed-in quota semantics and signs out', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request): Promise<Response> => {
      const path = requestPath(input)
      if (path === OPENAI_CODEX_AUTH_STATUS_PATH) {
        return json({
          status: 'signed-in',
          usage: {
            rateLimits: [{
              id: 'codex',
              name: 'Codex',
              windows: [{ remainingPercent: 72.5, windowSeconds: 18_000 }],
            }, {
              id: 'codex_bengalfox',
              name: 'GPT-5.3-Codex-Spark',
              windows: [
                { remainingPercent: 100, windowSeconds: 18_000 },
                { remainingPercent: 50, windowSeconds: 604_800 },
              ],
            }],
          },
        })
      }
      expect(path).toBe(OPENAI_CODEX_AUTH_LOGOUT_PATH)
      return json({ ok: true })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<OpenAICodexSettings t={t} embedded />)
    const progress = await screen.findByRole('progressbar', { name: `Codex · ${en.fiveHourLimit}` })
    expect(progress.getAttribute('aria-valuenow')).toBe('72.5')
    expect(progress.getAttribute('aria-valuetext')).toBe('72.5% remaining')
    expect(screen.getByRole('progressbar', { name: `GPT-5.3-Codex-Spark · ${en.fiveHourLimit}` })).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: `GPT-5.3-Codex-Spark · ${en.weeklyLimit}` })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: en.manageAccounts }))
    fireEvent.click(screen.getByRole('button', { name: en.signOutAll }))
    expect((await screen.findAllByText(en.signedOut)).length).toBeGreaterThan(0)
  })

  it('renders each quota window reset in the browser locale and names missing resets unavailable', async () => {
    const resetAt = 1_735_689_600
    const fetchMock = vi.fn(async (input: string | URL | Request): Promise<Response> => {
      expect(requestPath(input)).toBe(OPENAI_CODEX_AUTH_STATUS_PATH)
      return json({
        status: 'signed-in',
        usage: {
          rateLimits: [{
            id: 'codex',
            name: 'Codex',
            windows: [
              { remainingPercent: 72.5, windowSeconds: 18_000, resetAt },
              { remainingPercent: 80, windowSeconds: 604_800 },
            ],
          }],
        },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<OpenAICodexSettings t={t} embedded />)
    expect(await screen.findByText(en.resetAt.replace('{time}', formatOpenAICodexResetAt(resetAt) ?? ''))).toBeTruthy()
    expect(screen.getAllByText(en.resetAt.replace('{time}', en.resetUnavailable))).toHaveLength(1)
  })

  it('disables account actions while a login request is pending', async () => {
    let resolveLogin: ((value: Response) => void) | undefined
    const fetchMock = vi.fn((input: string | URL | Request): Promise<Response> => {
      const path = requestPath(input)
      if (path === OPENAI_CODEX_AUTH_STATUS_PATH) return Promise.resolve(json({ status: 'signed-out' }))
      return new Promise(resolve => { resolveLogin = resolve })
    })
    const { popup, replace } = popupFixture()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(window, 'open').mockReturnValue(popup)

    render(<OpenAICodexSettings t={t} embedded />)
    fireEvent.click(await screen.findByRole('button', { name: en.login }))
    const working = await screen.findByRole('button', { name: en.working })
    expect((working as HTMLButtonElement).disabled).toBe(true)

    await act(async () => {
      resolveLogin?.(json({ url: 'https://auth.openai.com/authorize' }))
    })
    await waitFor(() => { expect(replace).toHaveBeenCalledWith('https://auth.openai.com/authorize') })
  })

  it('does not update state after unmount and aborts its status request', () => {
    let statusSignal: AbortSignal | undefined
    const fetchMock = vi.fn((_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      statusSignal = init?.signal instanceof AbortSignal ? init.signal : undefined
      return new Promise(() => {})
    })
    vi.stubGlobal('fetch', fetchMock)

    const rendered = render(<OpenAICodexSettings t={t} embedded />)
    rendered.unmount()

    expect(statusSignal?.aborted).toBe(true)
  })

  it('surfaces logout failure and keeps account actions accessible', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request): Promise<Response> => {
      const path = requestPath(input)
      if (path === OPENAI_CODEX_AUTH_STATUS_PATH) {
        return json({ status: 'signed-in', usage: { rateLimits: [] } })
      }
      expect(path).toBe(OPENAI_CODEX_AUTH_LOGOUT_PATH)
      return json({ error: 'Could not sign out' }, 500)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<OpenAICodexSettings t={t} embedded />)
    fireEvent.click(await screen.findByRole('button', { name: en.manageAccounts }))
    fireEvent.click(screen.getByRole('button', { name: en.signOutAll }))

    expect(await screen.findByText('Could not sign out')).toBeTruthy()
    expect((screen.getByRole('button', { name: en.signOutAll }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('preserves another editor\'s untouched fields when saving a draft', async () => {
    const { scope } = settingsScopeFixture()
    vi.stubGlobal('fetch', vi.fn(async () => json(modelCatalogFixture([{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' }]))))
    render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="capabilities" />)
    const image = await screen.findByRole('checkbox', { name: /Enable GPT Image generation/u })
    fireEvent.click(image)
    await act(async () => { await scope.set('searchModel', 'remote-model') })
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await screen.findByText(en.settingsSaved)
    expect(scope.getSnapshot().value).toMatchObject({ searchModel: 'remote-model', enableImageGeneration: true })
  })

  it('publishes all edited fields in one revision and one notification', async () => {
    const { scope, mutate, set } = settingsScopeFixture()
    const observed: unknown[] = []
    scope.subscribe(() => { observed.push(scope.getSnapshot().value) })
    vi.stubGlobal('fetch', vi.fn(async () => json(modelCatalogFixture([{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' }]))))
    render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="capabilities" />)
    fireEvent.click(await screen.findByRole('checkbox', { name: /Enable GPT Image generation/u }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Enable Codex web search/u }))
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await screen.findByText(en.settingsSaved)
    expect(set).not.toHaveBeenCalled()
    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate).toHaveBeenCalledWith([
      { op: 'set', path: ['enableImageGeneration'], value: true },
      { op: 'set', path: ['enableSearch'], value: true },
    ], 0)
    expect(observed).toHaveLength(1)
    expect(observed[0]).toMatchObject({ enableSearch: true, enableImageGeneration: true })
  })

  it('retains the draft without writing when another editor changes the same field', async () => {
    const { scope, mutate } = settingsScopeFixture(true, { ...DEFAULT_OPENAI_CODEX_SETTINGS, enableSearch: true })
    vi.stubGlobal('fetch', vi.fn(async () => json(modelCatalogFixture([{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' }]))))
    render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="capabilities" />)
    const model = await screen.findByRole<HTMLInputElement>('textbox', { name: en.searchModel })
    fireEvent.change(model, { target: { value: 'local-model' } })
    await act(async () => { await scope.set('searchModel', 'remote-model') })
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await screen.findByText(en.settingsSaveFailed)
    expect(mutate).not.toHaveBeenCalled()
    expect(scope.getSnapshot().value?.searchModel).toBe('remote-model')
    expect(model.value).toBe('local-model')
  })

  it('rejects an intervening revision without partially saving the draft', async () => {
    const { scope, mutate } = settingsScopeFixture()
    const commit = vi.mocked(scope.mutate).getMockImplementation()!
    mutate.mockImplementationOnce(async (ops, revision) => {
      await scope.set('searchModel', 'remote-model')
      await commit(ops, revision)
    })
    vi.stubGlobal('fetch', vi.fn(async () => json(modelCatalogFixture([{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' }]))))
    render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="capabilities" />)
    fireEvent.click(await screen.findByRole('checkbox', { name: /Enable GPT Image generation/u }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Enable Codex web search/u }))
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await screen.findByText(en.settingsSaveFailed)
    expect(scope.getSnapshot().value).toMatchObject({ searchModel: 'remote-model', enableImageGeneration: false, enableSearch: false })
  })

  it('stages native compaction without extra retired fields', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(modelCatalogFixture([{ id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna' }]))))
    const { scope, mutate } = settingsScopeFixture(true, { ...DEFAULT_OPENAI_CODEX_SETTINGS })
    render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="capabilities" />)
    expect(screen.queryByRole('checkbox', { name: /Automatic Luna Reserve/u })).toBeNull()
    fireEvent.click(await screen.findByRole('checkbox', { name: en.enableNativeCompaction }))
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await screen.findByText(en.settingsSaved)
    expect(mutate).toHaveBeenCalledExactlyOnceWith([{ op: 'set', path: ['enableNativeCompaction'], value: true }], 0)
  })

  it('omits speed, reasoning, and proxy cards from the settings panel and shows a collapsible search accuracy reference', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(modelCatalogFixture([{ id: 'gpt-6.2-sol', name: 'GPT-6.2 Sol' }]))))
    const { scope, mutate } = settingsScopeFixture()
    render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="capabilities" />)
    expect(screen.queryByRole('combobox', { name: /Default reasoning effort/u })).toBeNull()
    expect(screen.queryByRole('checkbox', { name: /Fast Mode for new conversations/u })).toBeNull()
    expect(screen.queryByRole('checkbox', { name: /Fast Mode for new subagent conversations/u })).toBeNull()
    expect(screen.queryByRole('group', { name: en.networkHeading })).toBeNull()

    const summary = screen.getByText(en.searchLeaderboardSummary)
    const details = summary.closest('details') as HTMLDetailsElement
    expect(details.open).toBe(false)
    fireEvent.click(summary)
    expect(screen.getByText('64.5%')).toBeTruthy()
    expect(screen.getByText('54.4%')).toBeTruthy()
    expect(screen.getByText('93.3%')).toBeTruthy()
    expect(screen.getByText('92.9%')).toBeTruthy()
    expect(screen.getByText('92.8%')).toBeTruthy()
    expect(screen.getByText('92.7%')).toBeTruthy()

    fireEvent.click(screen.getByRole('checkbox', { name: /Enable Codex web search/u }))
    const useButtons = screen.getAllByRole('button', { name: en.searchLeaderboardUseModel })
    fireEvent.click(useButtons[0]!)
    expect(screen.getByRole('textbox', { name: en.searchModel })).toHaveProperty('value', 'gpt-6.2-sol')
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    expect(await screen.findByText(en.settingsSaved)).toBeTruthy()
    expect(mutate).toHaveBeenCalledWith(expect.arrayContaining([
      { op: 'set', path: ['enableSearch'], value: true },
      { op: 'set', path: ['searchModel'], value: 'gpt-6.2-sol' },
    ]), 0)
  })

  it('stages, saves, reloads, discards, and disables Codex native context management', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(modelCatalogFixture([{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' }]))))
    const { scope, mutate } = settingsScopeFixture()
    const first = render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="capabilities" />)
    const native = await screen.findByRole('checkbox', { name: en.enableNativeCompaction }) as HTMLInputElement

    expect(native.checked).toBe(false)
    fireEvent.click(native)
    fireEvent.click(screen.getByRole('button', { name: en.discard }))
    expect(native.checked).toBe(false)
    expect(mutate).not.toHaveBeenCalled()

    fireEvent.click(native)
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    expect(await screen.findByText(en.settingsSaved)).toBeTruthy()
    expect(mutate).toHaveBeenCalledExactlyOnceWith([
      { op: 'set', path: ['enableNativeCompaction'], value: true },
    ], 0)
    expect(scope.getSnapshot().value?.enableNativeCompaction).toBe(true)
    expect(scope.getSnapshot().value).toEqual({ ...DEFAULT_OPENAI_CODEX_SETTINGS, enableNativeCompaction: true })
    expect(screen.getByText(en.nativeCompactionSavedOn)).toBeTruthy()
    expect(screen.queryByText(en.nativeCompactionPending)).toBeNull()

    first.unmount()
    render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="capabilities" />)
    const reloaded = await screen.findByRole('checkbox', { name: en.enableNativeCompaction }) as HTMLInputElement
    expect(reloaded.checked).toBe(true)
    fireEvent.click(reloaded)
    expect(screen.getByText(en.nativeCompactionSavedOn)).toBeTruthy()
    expect(screen.getByText(en.nativeCompactionPending)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await screen.findByText(en.nativeCompactionSavedOff)
    expect(scope.getSnapshot().value).toEqual(DEFAULT_OPENAI_CODEX_SETTINGS)
    expect(mutate).toHaveBeenLastCalledWith([{ op: 'set', path: ['enableNativeCompaction'], value: false }], 1)
  })

  it.each([['en', en], ['zh', zh]] as const)('explains native context consent and benefits in %s without enabling it on view', async (_language, copy) => {
    vi.stubGlobal('fetch', vi.fn(async () => json(modelCatalogFixture([{ id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna' }]))))
    const { scope, mutate } = settingsScopeFixture()
    render(<OpenAICodexConfiguration scope={scope} t={key => copy[key]} activeModule="capabilities" />)
    const group = screen.getByRole('group', { name: copy.enableNativeCompaction })
    const native = within(group).getByRole('checkbox', { name: copy.enableNativeCompaction }) as HTMLInputElement
    expect(native.checked).toBe(false)
    for (const key of ['enableNativeCompactionHelp', 'nativeCompactionConsent', 'nativeCompactionRisk', 'nativeCompactionSavedOff'] as const) {
      expect(within(group).getByText(copy[key])).toBeTruthy()
    }
    expect(within(group).queryByText(/实验性|Experimental/u)).toBeNull()
    expect(copy.enableNativeCompaction).toContain('Codex')
    fireEvent.click(within(group).getByText(copy.nativeCompactionDetails))
    expect(within(group).getByText(copy.nativeCompactionHostPolicy)).toBeTruthy()
    expect(within(group).getByText(copy.nativeCompactionDisableHelp)).toBeTruthy()
    expect(mutate).not.toHaveBeenCalled()
    fireEvent.click(native)
    expect(within(group).getByText(copy.nativeCompactionPending)).toBeTruthy()
    expect(within(group).getByText(copy.nativeCompactionSavedOff)).toBeTruthy()
    expect(scope.getSnapshot().value?.enableNativeCompaction).toBe(false)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: copy.discard }))
    expect(native.checked).toBe(false)
    expect(within(group).queryByText(copy.nativeCompactionPending)).toBeNull()
    expect(mutate).not.toHaveBeenCalled()
  })

  it.each([false, true])('keeps the last saved native-context value %s when saving fails', async initialEnabled => {
    vi.stubGlobal('fetch', vi.fn(async () => json(modelCatalogFixture([{ id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna' }]))))
    const initial = { ...DEFAULT_OPENAI_CODEX_SETTINGS, enableNativeCompaction: initialEnabled }
    const { scope, mutate } = settingsScopeFixture(true, initial)
    mutate.mockRejectedValueOnce(new Error('fixture write failed'))
    render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="capabilities" />)
    fireEvent.click(screen.getByRole('checkbox', { name: en.enableNativeCompaction }))
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await screen.findByText(en.settingsSaveFailed)
    expect(scope.getSnapshot().value).toEqual(initial)
    expect(screen.getByText(initialEnabled ? en.nativeCompactionSavedOn : en.nativeCompactionSavedOff)).toBeTruthy()
    expect(screen.getByText(en.nativeCompactionPending)).toBeTruthy()
  })

  it('disables the native-context control when the settings are read-only', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(modelCatalogFixture([{ id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna' }]))))
    const { scope, mutate } = settingsScopeFixture(false)
    render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="capabilities" />)
    const native = screen.getByRole('checkbox', { name: en.enableNativeCompaction }) as HTMLInputElement
    expect(native.matches(':disabled')).toBe(true)
    expect(mutate).not.toHaveBeenCalled()
  })

  it('stages, discards, and saves optional capability settings in the same card', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request): Promise<Response> => requestPath(input) === OPENAI_CODEX_MODEL_CATALOG_PATH
      ? json(modelCatalogFixture([{ id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna' }, { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' }]))
      : json({ status: 'signed-out' }))
    const { scope, mutate } = settingsScopeFixture()
    vi.stubGlobal('fetch', fetchMock)

    render(<OpenAICodexSettings t={t} configScope={scope} embedded />)
    fireEvent.click(screen.getByRole('tab', { name: en.capabilitiesModule }))
    const enableSearch = await screen.findByRole('checkbox', { name: /Enable Codex web search/u }) as HTMLInputElement
    const enableImageGeneration = screen.getByRole('checkbox', { name: /Enable GPT Image generation/u }) as HTMLInputElement
    expect(enableSearch.checked).toBe(false)
    expect(enableImageGeneration.checked).toBe(false)
    expect(screen.queryByRole('textbox', { name: en.searchModel })).toBeNull()
    expect(screen.queryByRole('combobox', { name: en.imageModelHint })).toBeNull()
    expect(screen.queryByRole('textbox', { name: en.imageModelHint })).toBeNull()
    expect(screen.queryByRole('button', { name: en.save })).toBeNull()
    expect(en.enableImageGenerationHelp).toContain('without switching models')
    expect(en.enableImageGenerationHelp).toContain('only the selected target and reference images')
    expect(zh.enableImageGeneration).toBe('启用 GPT Image 图片生成')
    expect(zh.enableImageGenerationHelp).toContain('包括 DeepSeek')
    expect(zh.enableImageGenerationHelp).toContain('仅发送本次选定的目标图与参考图')

    fireEvent.click(enableSearch)
    const model = screen.getByRole('textbox', { name: en.searchModel }) as HTMLInputElement
    const save = screen.getByRole('button', { name: en.save }) as HTMLButtonElement
    expect(save.style.background).toBe('var(--dsw-alias-button-primary-fill)')
    expect(save.style.color).toBe('var(--dsw-alias-label-primary-foreground)')
    fireEvent.change(model, { target: { value: 'temporary-model' } })
    fireEvent.click(screen.getByRole('button', { name: en.discard }))
    expect(enableSearch.checked).toBe(false)
    expect(screen.queryByRole('textbox', { name: en.searchModel })).toBeNull()

    fireEvent.click(enableSearch)
    fireEvent.change(screen.getByRole('textbox', { name: en.searchModel }), { target: { value: 'gpt-search-custom' } })
    fireEvent.change(screen.getByRole('combobox', { name: en.searchMode }), { target: { value: 'live' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: en.searchMaxOutputTokens }), { target: { value: '2048' } })
    fireEvent.click(enableImageGeneration)
    expect(screen.queryByRole('combobox', { name: en.imageModelHint })).toBeNull()
    const imageModelHint = screen.getByRole('textbox', { name: en.imageModelHint }) as HTMLInputElement
    expect(imageModelHint.placeholder).toContain('GPT-Image-2.6 Sunburst')
    expect(screen.getByText(en.imageModelHintHelp)).toBeTruthy()
    expect(zh.imageModelHintHelp).toContain('GPT-Image-2.6 Sunburst')
    fireEvent.change(imageModelHint, { target: { value: 'custom-image-route' } })
    fireEvent.click(screen.getByRole('button', { name: en.save }))

    expect(await screen.findByText(en.settingsSaved)).toBeTruthy()
    expect(mutate).toHaveBeenCalledWith(expect.arrayContaining([{ op: 'set', path: ['enableSearch'], value: true }]), expect.any(Number))
    expect(mutate).toHaveBeenCalledWith(expect.arrayContaining([{ op: 'set', path: ['searchModel'], value: 'gpt-search-custom' }]), expect.any(Number))
    expect(mutate).toHaveBeenCalledWith(expect.arrayContaining([{ op: 'set', path: ['searchMode'], value: 'live' }]), expect.any(Number))
    expect(mutate).toHaveBeenCalledWith(expect.arrayContaining([{ op: 'set', path: ['searchMaxOutputTokens'], value: 2048 }]), expect.any(Number))
    expect(mutate).toHaveBeenCalledWith(expect.arrayContaining([{ op: 'set', path: ['enableImageGeneration'], value: true }]), expect.any(Number))
    expect(mutate).toHaveBeenCalledWith(expect.arrayContaining([{ op: 'set', path: ['imageModelHint'], value: 'custom-image-route' }]), expect.any(Number))
  })

  it('keeps an invalid image hint staged and disables Save until it is cleared', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(modelCatalogFixture([{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' }]))))
    const { scope, mutate } = settingsScopeFixture(true, {
      ...DEFAULT_OPENAI_CODEX_SETTINGS,
      enableImageGeneration: true,
      imageModelHint: 'existing-route',
    })
    render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="capabilities" />)
    expect(screen.queryByRole('combobox', { name: en.imageModelHint })).toBeNull()
    const hint = await screen.findByRole('textbox', { name: en.imageModelHint }) as HTMLInputElement
    expect(hint.value).toBe('existing-route')
    fireEvent.change(hint, { target: { value: 'https://invalid.example' } })
    const save = screen.getByRole('button', { name: en.save }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    expect(mutate).not.toHaveBeenCalled()
    fireEvent.change(hint, { target: { value: '' } })
    expect(save.disabled).toBe(false)
    fireEvent.click(save)
    await screen.findByText(en.settingsSaved)
    expect(mutate).toHaveBeenCalledWith(expect.arrayContaining([{ op: 'set', path: ['imageModelHint'], value: '' }]), expect.any(Number))
  })

  it('orders models strongest-first, splits enabled and disabled groups, and saves visibility', async () => {
    const availableModels = [
      { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna' },
      { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' },
      { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra' },
      { id: 'gpt-6.2-sol', name: 'GPT-6.2 Sol' },
      { id: 'gpt-6.2-astra', name: 'GPT-6.2 Astra' },
    ]
    const fetchMock = vi.fn(async (input: string | URL | Request): Promise<Response> => requestPath(input) === OPENAI_CODEX_MODEL_CATALOG_PATH
      ? json(modelCatalogFixture(availableModels))
      : json({ status: 'signed-out' }))
    const { scope, mutate } = settingsScopeFixture()
    vi.stubGlobal('fetch', fetchMock)

    render(<OpenAICodexSettings t={t} configScope={scope} embedded />)
    fireEvent.click(screen.getByRole('tab', { name: en.modelsModule }))
    await screen.findByRole('checkbox', { name: /GPT-6\.2 Astra/u })

    const enabledGroup = screen.getByRole('group', { name: en.modelsEnabledGroup })
    expect(screen.queryByRole('group', { name: en.modelsDisabledGroup })).toBeNull()
    const orderedNames = within(enabledGroup).getAllByRole('checkbox').map(box => box.closest('label')?.textContent ?? '')
    expect(orderedNames.map(text => text.split('gpt-')[0]?.trim())).toEqual([
      'GPT-6.2 Astra',
      'GPT-6.2 Sol',
      'GPT-5.6 Sol',
      'GPT-5.6 Terra',
      'GPT-5.6 Luna',
    ])

    fireEvent.click(screen.getByRole('checkbox', { name: /GPT-5\.6 Sol/u }))
    expect(within(screen.getByRole('group', { name: en.modelsDisabledGroup })).getByRole('checkbox', { name: /GPT-5\.6 Sol/u })).toHaveProperty('checked', false)
    fireEvent.click(screen.getByRole('button', { name: en.discard }))
    expect(screen.queryByRole('group', { name: en.modelsDisabledGroup })).toBeNull()
    expect(screen.getByRole('checkbox', { name: /GPT-5\.6 Sol/u })).toHaveProperty('checked', true)

    fireEvent.click(screen.getByRole('checkbox', { name: /GPT-5\.6 Sol/u }))
    fireEvent.click(screen.getByRole('button', { name: en.save }))

    expect(await screen.findByText(en.settingsSaved)).toBeTruthy()
    expect(mutate).toHaveBeenCalledWith(expect.arrayContaining([{
      op: 'set',
      path: ['models'],
      value: ['gpt-6.2-astra', 'gpt-6.2-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'],
    }]), expect.any(Number))
    expect(fetchMock.mock.calls.some(([input]) => requestPath(input) === OPENAI_CODEX_MODEL_CATALOG_PATH)).toBe(true)
  })

  it('keeps an unsaved draft and its actions available across the account module', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request): Promise<Response> => requestPath(input) === OPENAI_CODEX_MODEL_CATALOG_PATH
      ? json(modelCatalogFixture([{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' }]))
      : json({ status: 'signed-out' })))
    const { scope, mutate } = settingsScopeFixture()

    render(<OpenAICodexSettings t={t} configScope={scope} embedded />)
    fireEvent.click(screen.getByRole('tab', { name: en.modelsModule }))
    fireEvent.click(await screen.findByRole('checkbox', { name: /GPT-5\.6 Sol/u }))
    expect((screen.getByRole('button', { name: en.save }) as HTMLButtonElement).disabled).toBe(false)

    fireEvent.click(screen.getByRole('tab', { name: en.accountModule }))
    expect(document.getElementById(screen.getByRole('tab', { name: en.modelsModule }).getAttribute('aria-controls') ?? '')?.style.display).toBe('none')
    expect((screen.getByRole('button', { name: en.save }) as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByRole('tab', { name: en.modelsModule }))
    expect((screen.getByRole('checkbox', { name: /GPT-5\.6 Sol/u }) as HTMLInputElement).checked).toBe(false)
    expect(mutate).not.toHaveBeenCalled()
  })

  it('disables capability edits when the Host settings document is read-only', async () => {
    const fetchMock = vi.fn(async (): Promise<Response> => json({ status: 'signed-out' }))
    const { scope } = settingsScopeFixture(false)
    vi.stubGlobal('fetch', fetchMock)

    render(<OpenAICodexSettings t={t} configScope={scope} embedded />)
    fireEvent.click(screen.getByRole('tab', { name: en.capabilitiesModule }))

    expect(await screen.findByText(en.settingsReadOnly)).toBeTruthy()
    expect(document.querySelector('fieldset')?.disabled).toBe(true)
    expect(screen.queryByRole('button', { name: en.save })).toBeNull()
  })
})


describe('bounded configuration recovery', () => {
  it.each(['headers', 'body'] as const)('times out catalog %s, ignores late completion and retries explicitly', async phase => {
    vi.useFakeTimers()
    let resolve!: (value: any) => void
    let signal: AbortSignal | null | undefined
    const stalled = new Promise<any>(done => { resolve = done })
    const catalog = modelCatalogFixture([{ id: 'sol', name: 'Sol' }])
    const fetchMock = vi.fn((_path: string, init: RequestInit) => {
      signal = init.signal
      return phase === 'headers' ? stalled : Promise.resolve({ ok: true, json: () => stalled })
    })
    vi.stubGlobal('fetch', fetchMock)
    const { scope } = settingsScopeFixture()
    render(<OpenAICodexConfiguration scope={scope} t={t} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(BROWSER_REQUEST_TIMEOUT_MS) })
    expect(signal?.aborted).toBe(true)
    expect(screen.getByText(en.modelCatalogFailed)).toBeTruthy()
    await act(async () => { resolve(phase === 'headers' ? json(catalog) : catalog) })
    expect(screen.queryByRole('checkbox', { name: /Sol/ })).toBeNull()
    fetchMock.mockImplementation(() => Promise.resolve(json(catalog)))
    fireEvent.click(screen.getByRole('button', { name: en.retry }))
    await act(async () => {})
    expect(screen.getByRole('checkbox', { name: /Sol/ })).toBeTruthy()
  })

  it('resets draft and aborts pending catalog reads on scope replacement/unmount in StrictMode', async () => {
    const signals: AbortSignal[] = []
    vi.stubGlobal('fetch', vi.fn((_path: string, init: RequestInit) => {
      signals.push(init.signal!)
      return new Promise<Response>(() => {})
    }))
    const first = settingsScopeFixture(true, { ...DEFAULT_OPENAI_CODEX_SETTINGS, enableSearch: true, searchModel: 'model-a' })
    const second = settingsScopeFixture(true, { ...DEFAULT_OPENAI_CODEX_SETTINGS, enableSearch: true, searchModel: 'model-b' })
    const view = render(<StrictMode><OpenAICodexConfiguration scope={first.scope} t={t} activeModule="capabilities" /></StrictMode>)
    expect(signals[0]?.aborted).toBe(true)
    fireEvent.change(screen.getByRole('textbox', { name: en.searchModel }), { target: { value: 'draft-a' } })
    expect(screen.getByRole('button', { name: en.discard })).toHaveProperty('disabled', false)
    view.rerender(<StrictMode><OpenAICodexConfiguration scope={second.scope} t={t} activeModule="capabilities" /></StrictMode>)
    expect(signals.slice(0, -1).every(signal => signal.aborted)).toBe(true)
    expect(screen.getByRole('textbox', { name: en.searchModel })).toHaveProperty('value', 'model-b')
    expect(screen.queryByRole('button', { name: en.discard })).toBeNull()
    view.unmount()
    expect(signals.every(signal => signal.aborted)).toBe(true)
  })
})

describe('unchanged Host-accepted context budgets', () => {
  it.each(['loading', 'failed'] as const)('allows intended disables only while catalog is %s', async state => {
    for (const field of ['enableSearch', 'enableImageGeneration'] as const) {
      vi.stubGlobal('fetch', vi.fn(() => state === 'loading' ? new Promise<Response>(() => {}) : Promise.resolve(json({}, 503))))
      const initial = { ...DEFAULT_OPENAI_CODEX_SETTINGS, contextWindowOverrides: { sol: 400_000 }, enableSearch: true, enableImageGeneration: true }
      const { scope, mutate } = settingsScopeFixture(true, initial)
      const view = render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="capabilities" />)
      if (state === 'failed') await act(async () => {})
      const pattern = field === 'enableSearch' ? new RegExp(en.enableSearch) : new RegExp(en.enableImageGeneration)
      fireEvent.click(screen.getByRole('checkbox', { name: pattern }))
      expect(screen.getByRole('button', { name: en.save })).toHaveProperty('disabled', false)
      fireEvent.click(screen.getByRole('button', { name: en.save }))
      await screen.findByText(en.settingsSaved)
      expect(mutate).toHaveBeenCalledWith([{ op: 'set', path: [field], value: false }], 0)
      expect(scope.getSnapshot().value?.contextWindowOverrides).toEqual(initial.contextWindowOverrides)
      view.unmount()
    }
  })

  it.each([undefined, { sol: 400_000 }])('blocks new/edited out-of-range budgets and retains reset masks (%j)', async overrides => {
    vi.stubGlobal('fetch', vi.fn(async () => json(modelCatalogFixture([{ id: 'sol', name: 'Sol' }]))))
    const { scope, mutate } = settingsScopeFixture(true, { ...DEFAULT_OPENAI_CODEX_SETTINGS, contextWindowOverrides: overrides })
    render(<OpenAICodexConfiguration scope={scope} t={t} />)
    await screen.findByRole('checkbox', { name: /Sol/ })
    fireEvent.click(screen.getByRole('button', { name: en.contextAdjust }))
    const budget = screen.getByRole('spinbutton', { name: en.contextTokens })
    fireEvent.change(budget, { target: { value: '900000' } })
    expect(screen.getByRole('button', { name: en.save })).toHaveProperty('disabled', true)
    expect(mutate).not.toHaveBeenCalled()
    fireEvent.change(budget, { target: { value: '450000' } })
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await screen.findByText(en.settingsSaved)
    expect(scope.getSnapshot().value?.contextWindowOverrides).toEqual({ sol: 450_000 })
    fireEvent.click(screen.getByRole('button', { name: en.contextReset }))
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await waitFor(() => { expect(mutate).toHaveBeenLastCalledWith([{ op: 'set', path: ['contextWindowOverrides'], value: { sol: null } }], 1) })
  })

  it('rejects legacy memory snapshots even if a fixture advertises writable settings', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
    const { scope, mutate } = settingsScopeFixture(true, DEFAULT_OPENAI_CODEX_SETTINGS, 'memory')
    render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="capabilities" />)
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(en.enableSearch) }))
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await screen.findByText(en.settingsSaveFailed)
    expect(mutate).not.toHaveBeenCalled()
    expect(scope.getSnapshot().value?.enableSearch).toBe(false)
  })

  it.each([
    { writable: false },
    { revision: undefined },
    { status: 'unavailable' as const },
    { value: undefined },
  ])('refuses an absent-mode save when the latest Host snapshot loses its fence or authority (%j)', async latest => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
    const { scope, mutate } = settingsScopeFixture(true, DEFAULT_OPENAI_CODEX_SETTINGS, 'absent')
    render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="capabilities" />)
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(en.enableSearch) }))
    const changed = { ...scope.getSnapshot(), ...latest }
    // Silent replacement simulates a Host update between rendering and save.
    vi.spyOn(scope, 'getSnapshot').mockReturnValue(changed)
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await screen.findByText(en.settingsSaveFailed)
    expect(mutate).not.toHaveBeenCalled()
    expect('mode' in scope.getSnapshot()).toBe(false)
  })

  it.each(['host', 'absent'] as const)('preserves unrelated concurrent changes with latest revision and rejects conflicting same-field edits (%s mode)', async snapshotMode => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
    const { scope, mutate } = settingsScopeFixture(true, { ...DEFAULT_OPENAI_CODEX_SETTINGS, contextWindowOverrides: { sol: 400_000 }, enableSearch: true }, snapshotMode)
    render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="capabilities" />)
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(en.enableSearch) }))
    await act(async () => { await scope.set('enableNativeCompaction', true) })
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await screen.findByText(en.settingsSaved)
    expect(mutate).toHaveBeenCalledWith([{ op: 'set', path: ['enableSearch'], value: false }], 1)
    expect(scope.getSnapshot().revision).toBe(2)
    expect('mode' in scope.getSnapshot()).toBe(snapshotMode !== 'absent')
    expect(scope.getSnapshot().value?.enableNativeCompaction).toBe(true)
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(en.enableSearch) }))
    fireEvent.change(screen.getByRole('textbox', { name: en.searchModel }), { target: { value: 'mine' } })
    await act(async () => { await scope.set('searchModel', 'theirs') })
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await screen.findByText(en.settingsSaveFailed)
    expect(mutate).toHaveBeenCalledTimes(1)
    expect(scope.getSnapshot().value?.searchModel).toBe('theirs')
  })

  it.each(['host', 'absent'] as const)('honors Host refusal and read-only state without using the missing catalog as authority (%s mode)', async snapshotMode => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
    const initial = { ...DEFAULT_OPENAI_CODEX_SETTINGS, contextWindowOverrides: { sol: 400_000 }, enableSearch: true }
    const { scope, mutate } = settingsScopeFixture(true, initial, snapshotMode)
    mutate.mockResolvedValueOnce(false)
    const view = render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="capabilities" />)
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(en.enableSearch) }))
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await screen.findByText(en.settingsSaveFailed)
    expect(mutate).toHaveBeenCalledWith([{ op: 'set', path: ['enableSearch'], value: false }], 0)
    expect(scope.getSnapshot().value?.enableSearch).toBe(true)
    expect(scope.getSnapshot().revision).toBe(0)
    view.unmount()
    const readonly = settingsScopeFixture(false, initial, snapshotMode)
    render(<OpenAICodexConfiguration scope={readonly.scope} t={t} activeModule="capabilities" />)
    expect(document.querySelector('fieldset')?.disabled).toBe(true)
    expect(screen.queryByRole('button', { name: en.save })).toBeNull()
    expect(readonly.mutate).not.toHaveBeenCalled()
  })
})


it('rejects new/edited budgets without trustworthy caps and malformed unchanged structure', () => {
  const accepted = { sol: 400_000 }
  expect(validContextEdits({ ...accepted }, accepted, undefined)).toBe(true)
  expect(validContextEdits({ sol: 450_000 }, accepted, undefined)).toBe(false)
  expect(validContextEdits({ ...accepted, other: 200_000 }, accepted, undefined)).toBe(false)
  expect(validContextEdits({ sol: NaN }, { sol: NaN }, undefined)).toBe(false)
  expect(validContextEdits({ sol: 0 }, { sol: 0 }, undefined)).toBe(false)
  expect(validContextEdits({ sol: 450_000 }, accepted, [])).toBe(false)
  expect(validContextEdits({}, accepted, undefined)).toBe(false)
})
