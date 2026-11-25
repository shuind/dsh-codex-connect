// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { en, zh } from '../../src/client/locales/index.ts'
import { OpenAICodexUpdateOverlay, OpenAICodexUpdateSettings } from '../../src/client/notices/OpenAICodexUpdateNotice.tsx'
import {
  OPENAI_CODEX_UPDATE_CACHE_KEY,
  OPENAI_CODEX_UPDATE_DISMISSED_KEY,
  OpenAICodexUpdateStore,
} from '../../src/client/shared/update-store.ts'
import { OPENAI_CODEX_UPDATE_PATH } from '../../src/shared/update.ts'

function t(key: keyof typeof en, params: Record<string, unknown> = {}): string {
  return Object.entries(params).reduce(
    (value, [name, replacement]) => value.replace(`{${name}}`, String(replacement)),
    en[key],
  )
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
}

function storageFixture(): Storage {
  const values = new Map<string, string>()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
    removeItem: key => { values.delete(key) },
    clear: () => { values.clear() },
    key: index => [...values.keys()][index] ?? null,
    get length() { return values.size },
  } as Storage
}

function overlayShellProps() {
  return {
    useSessions: vi.fn() as never,
    useSessionStatus: vi.fn() as never,
    useSessionRetainInfo: vi.fn() as never,
    useSessionAccess: vi.fn() as never,
    useWorkspaces: vi.fn() as never,
    usePanelInfo: vi.fn() as never,
  }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Codex Connect one-line show-once update reminder', () => {
  it('shows a single-line notice once per new version, persists seen immediately, and hides on close', async () => {
    const fetchMock = vi.fn(async (input: string): Promise<Response> => {
      expect(input).toBe(OPENAI_CODEX_UPDATE_PATH)
      return json({
        status: 'update-available',
        currentVersion: '0.2.0',
        latestVersion: '0.2.1',
        releaseUrl: 'https://github.com/shuind/dsh-codex-connect/releases/tag/v0.2.1',
      })
    })
    const browserStorage = storageFixture()
    vi.stubGlobal('localStorage', browserStorage)
    vi.stubGlobal('fetch', fetchMock)

    const firstStore = new OpenAICodexUpdateStore('0.2.0')
    await act(async () => { await firstStore.refresh(true) })

    const view = render(<OpenAICodexUpdateOverlay updater={firstStore} t={t} {...overlayShellProps()} />)
    const banner = screen.getByRole('status')
    expect(banner.style.whiteSpace).toBe('nowrap')
    expect(banner.textContent).toContain(en.updateOneLineNotice.replace('{version}', '0.2.1'))
    expect(screen.getByRole('link', { name: en.openReleasePage }).getAttribute('href'))
      .toBe('https://github.com/shuind/dsh-codex-connect/releases/tag/v0.2.1')
    // Already persisted as shown on first display without requiring a close click.
    expect(browserStorage.getItem(OPENAI_CODEX_UPDATE_DISMISSED_KEY)).toBe('0.2.0:0.2.1')

    // Closing immediately hides the banner in the active session.
    fireEvent.click(screen.getByRole('button', { name: en.dismissUpdate }))
    expect(screen.queryByRole('status')).toBeNull()
    view.unmount()
    firstStore.dispose()

    // Reloading with a fresh store does not show the same version again.
    const secondStore = new OpenAICodexUpdateStore('0.2.0')
    await act(async () => { await secondStore.refresh() })
    const secondView = render(<OpenAICodexUpdateOverlay updater={secondStore} t={t} {...overlayShellProps()} />)
    expect(screen.queryByRole('status')).toBeNull()
    secondView.unmount()
    secondStore.dispose()

    // When a newer version arrives, the overlay appears once again.
    fetchMock.mockResolvedValueOnce(json({
      status: 'update-available',
      currentVersion: '0.2.0',
      latestVersion: '0.2.2',
      releaseUrl: 'https://github.com/shuind/dsh-codex-connect/releases/tag/v0.2.2',
    }))
    const thirdStore = new OpenAICodexUpdateStore('0.2.0')
    await act(async () => { await thirdStore.refresh(true) })
    render(<OpenAICodexUpdateOverlay updater={thirdStore} t={t} {...overlayShellProps()} />)
    expect(screen.getByRole('status').textContent).toContain('0.2.2')
    expect(browserStorage.getItem(OPENAI_CODEX_UPDATE_DISMISSED_KEY)).toBe('0.2.0:0.2.2')
    thirdStore.dispose()
  })

  it('does not re-show on reload even if the user never clicked Close', async () => {
    const browserStorage = storageFixture()
    vi.stubGlobal('localStorage', browserStorage)
    vi.stubGlobal('fetch', vi.fn(async (): Promise<Response> => json({
      status: 'update-available',
      currentVersion: '0.2.0',
      latestVersion: '0.2.1',
      releaseUrl: 'https://github.com/shuind/dsh-codex-connect/releases/tag/v0.2.1',
    })))

    const firstStore = new OpenAICodexUpdateStore('0.2.0')
    await act(async () => { await firstStore.refresh(true) })
    const firstRender = render(<OpenAICodexUpdateOverlay updater={firstStore} t={t} {...overlayShellProps()} />)
    expect(screen.getByRole('status')).toBeTruthy()
    firstRender.unmount()
    firstStore.dispose()

    const reloadedStore = new OpenAICodexUpdateStore('0.2.0')
    await act(async () => { await reloadedStore.refresh() })
    render(<OpenAICodexUpdateOverlay updater={reloadedStore} t={t} {...overlayShellProps()} />)
    expect(screen.queryByRole('status')).toBeNull()
    reloadedStore.dispose()
  })

  it('shows update notice in settings only when an update is available and omits manual check button', async () => {
    const fetchMock = vi.fn(async (input: string): Promise<Response> => {
      expect(input).toBe(OPENAI_CODEX_UPDATE_PATH)
      return json({
        status: 'up-to-date',
        currentVersion: '0.2.0',
        latestVersion: '0.2.0',
      })
    })
    const browserStorage = storageFixture()
    vi.stubGlobal('localStorage', browserStorage)
    vi.stubGlobal('fetch', fetchMock)
    const updater = new OpenAICodexUpdateStore('0.2.0')
    render(<OpenAICodexUpdateSettings updater={updater} t={t} />)
    expect(screen.queryByRole('button', { name: en.checkForUpdates })).toBeNull()
    expect(screen.queryByRole('region')).toBeNull()

    await act(async () => { await updater.refresh(true) })
    expect(screen.queryByRole('region')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(zh.dismissUpdate).toBe('关闭')
    expect(browserStorage.getItem(OPENAI_CODEX_UPDATE_CACHE_KEY)).toContain('up-to-date')

    fetchMock.mockResolvedValueOnce(json({
      status: 'update-available',
      currentVersion: '0.2.0',
      latestVersion: '0.2.1',
      releaseUrl: 'https://github.com/shuind/dsh-codex-connect/releases/tag/v0.2.1',
    }))
    await act(async () => { await updater.refresh(true) })
    expect(screen.getByRole('region').textContent).toContain(en.newVersionAvailable.replace('{version}', '0.2.1'))
    expect(screen.getByRole('link', { name: en.openReleasePage }).getAttribute('href'))
      .toBe('https://github.com/shuind/dsh-codex-connect/releases/tag/v0.2.1')
    expect(screen.queryByRole('button', { name: en.checkForUpdates })).toBeNull()
    updater.dispose()
  })

  it('rechecks release metadata after the installed plugin version changes', async () => {
    const browserStorage = storageFixture()
    browserStorage.setItem(OPENAI_CODEX_UPDATE_CACHE_KEY, JSON.stringify({
      checkedAt: Date.now(),
      result: { status: 'up-to-date', currentVersion: '0.2.0', latestVersion: '0.2.0' },
    }))
    const fetchMock = vi.fn(async (input: string): Promise<Response> => {
      expect(input).toBe(OPENAI_CODEX_UPDATE_PATH)
      return json({ status: 'up-to-date', currentVersion: '0.2.1', latestVersion: '0.2.1' })
    })
    vi.stubGlobal('localStorage', browserStorage)
    vi.stubGlobal('fetch', fetchMock)
    const updater = new OpenAICodexUpdateStore('0.2.1')

    await act(async () => { await updater.refresh() })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(updater.getSnapshot().currentVersion).toBe('0.2.1')
    updater.dispose()
  })

  it('aborts an in-flight global check when the client plugin unloads', async () => {
    const browserStorage = storageFixture()
    vi.stubGlobal('localStorage', browserStorage)
    let signal: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn((_input: string, init?: RequestInit): Promise<Response> => {
      signal = init?.signal ?? undefined
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => { reject(signal?.reason) }, { once: true })
      })
    }))
    const updater = new OpenAICodexUpdateStore('0.2.0')
    const pending = updater.refresh(true)
    updater.dispose()
    await expect(pending).resolves.toBeUndefined()
    expect(signal?.aborted).toBe(true)
  })

  it('does not cache a transient unavailable result for a full day', async () => {
    const browserStorage = storageFixture()
    vi.stubGlobal('localStorage', browserStorage)
    vi.stubGlobal('fetch', vi.fn(async (): Promise<Response> => json({ error: 'temporary' }, 503)))
    const updater = new OpenAICodexUpdateStore('0.2.0')
    await act(async () => { await updater.refresh(true) })
    expect(updater.getSnapshot().status).toBe('unavailable')
    expect(browserStorage.getItem(OPENAI_CODEX_UPDATE_CACHE_KEY)).toBeNull()
    render(<OpenAICodexUpdateSettings updater={updater} t={t} />)
    expect(screen.queryByRole('region')).toBeNull()
    updater.dispose()
  })

  it('warns at most once when a newer version is incompatible with the installed DSH version', async () => {
    const browserStorage = storageFixture()
    vi.stubGlobal('localStorage', browserStorage)
    vi.stubGlobal('fetch', vi.fn(async (): Promise<Response> => json({
      status: 'update-available',
      currentVersion: '0.2.0',
      latestVersion: '0.3.0',
      releaseUrl: 'https://github.com/shuind/dsh-codex-connect/releases/tag/v0.3.0',
      dshVersion: '0.2.2-rc.5',
      requiredDsh: '>=0.2.3',
      dshCompatible: false,
    })))

    const firstStore = new OpenAICodexUpdateStore('0.2.0')
    await act(async () => { await firstStore.refresh(true) })
    const view = render(
      <>
        <OpenAICodexUpdateOverlay updater={firstStore} t={t} {...overlayShellProps()} />
        <OpenAICodexUpdateSettings updater={firstStore} t={t} />
      </>,
    )
    expect(screen.getByRole('status').textContent).toContain(t('updateIncompatibleNotice', {
      version: '0.3.0',
      dshVersion: '0.2.2-rc.5',
      requiredDsh: '>=0.2.3',
    }))
    expect(screen.getByRole('region').textContent).toContain(t('newVersionIncompatible', {
      version: '0.3.0',
      dshVersion: '0.2.2-rc.5',
      requiredDsh: '>=0.2.3',
    }))
    expect(browserStorage.getItem(OPENAI_CODEX_UPDATE_DISMISSED_KEY)).toBe('0.2.0:0.3.0:incompatible')
    expect(zh.updateIncompatibleNotice).toContain('不适配当前 DSH')
    view.unmount()
    firstStore.dispose()

    const reloadedStore = new OpenAICodexUpdateStore('0.2.0')
    await act(async () => { await reloadedStore.refresh() })
    render(<OpenAICodexUpdateOverlay updater={reloadedStore} t={t} {...overlayShellProps()} />)
    expect(screen.queryByRole('status')).toBeNull()
    reloadedStore.dispose()
  })
})
