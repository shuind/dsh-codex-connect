/** Browser-owned cache and observable state for the one-time update reminder. */

import { parseOpenAICodexUpdateResult } from '../../shared/update.ts'
import type { OpenAICodexUpdateResult } from '../../shared/update.ts'
import { OPENAI_CODEX_UPDATE_PATH } from '../../shared/update.ts'
import { requestJson } from './request-json.ts'

export const OPENAI_CODEX_REPOSITORY_URL = 'https://github.com/shuind/dsh-codex-connect'
export const OPENAI_CODEX_UPDATE_CACHE_KEY = '@shuind/dsh-codex-connect:update-check'
export const OPENAI_CODEX_UPDATE_DISMISSED_KEY = '@shuind/dsh-codex-connect:update-seen'
export const OPENAI_CODEX_UPDATE_CACHE_TTL_MS = 24 * 60 * 60 * 1_000
/** Retry transient update-check failures while the page remains open. */
export const OPENAI_CODEX_UPDATE_RECHECK_MS = 5 * 60 * 1_000

export type OpenAICodexUpdateSnapshot = {
  status: 'idle' | 'checking' | OpenAICodexUpdateResult['status']
  currentVersion: string
  checkedAt?: number
  latestVersion?: string
  releaseUrl?: string
  dismissedNotice?: string
}

interface CachedUpdate {
  checkedAt: number
  result: unknown
}

function storage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

function resultSnapshot(result: OpenAICodexUpdateResult, dismissedNotice?: string): OpenAICodexUpdateSnapshot {
  return {
    status: result.status,
    currentVersion: result.currentVersion,
    ...result.status === 'up-to-date' || result.status === 'update-available'
      ? { latestVersion: result.latestVersion }
      : {},
    ...result.status === 'update-available'
      ? { releaseUrl: result.releaseUrl }
      : {},
    ...dismissedNotice === undefined ? {} : { dismissedNotice },
  }
}

/** Observable browser state shared by the one-line overlay and settings card. */
export class OpenAICodexUpdateStore {
  private snapshot: OpenAICodexUpdateSnapshot
  private readonly listeners = new Set<() => void>()
  private readonly shownInSession = new Set<string>()
  private dismissedInSession: string | undefined
  private request: AbortController | undefined
  private disposed = false
  private recheckTimer: ReturnType<typeof setTimeout> | undefined

  constructor(readonly currentVersion: string) {
    this.snapshot = { status: 'idle', currentVersion }
  }

  getSnapshot = (): OpenAICodexUpdateSnapshot => this.snapshot

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private setSnapshot(next: OpenAICodexUpdateSnapshot): void {
    if (this.disposed) return
    this.snapshot = next
    for (const listener of this.listeners) listener()
  }

  private effectiveDismissedNotice(): string | undefined {
    if (this.dismissedInSession !== undefined) return this.dismissedInSession
    try {
      const stored = storage()?.getItem(OPENAI_CODEX_UPDATE_DISMISSED_KEY)
      if (stored === null || stored === undefined || stored === '') return undefined
      return this.shownInSession.has(stored) ? undefined : stored
    } catch {
      return undefined
    }
  }

  private readCached(): { result: OpenAICodexUpdateResult; checkedAt: number } | undefined {
    try {
      const raw = storage()?.getItem(OPENAI_CODEX_UPDATE_CACHE_KEY)
      if (raw === null || raw === undefined) return undefined
      const cached = JSON.parse(raw) as CachedUpdate
      if (!Number.isSafeInteger(cached.checkedAt) || cached.checkedAt > Date.now() || Date.now() - cached.checkedAt > OPENAI_CODEX_UPDATE_CACHE_TTL_MS) return undefined
      const result = parseOpenAICodexUpdateResult(cached.result)
      if (result === undefined || result.status === 'unavailable') return undefined
      return { result, checkedAt: cached.checkedAt }
    } catch {
      return undefined
    }
  }

  private writeCached(result: OpenAICodexUpdateResult, checkedAt: number): void {
    try {
      if (result.status === 'unavailable') storage()?.removeItem(OPENAI_CODEX_UPDATE_CACHE_KEY)
      else storage()?.setItem(OPENAI_CODEX_UPDATE_CACHE_KEY, JSON.stringify({ checkedAt, result }))
    } catch {
      // A blocked or full browser storage should not disable the reminder.
    }
  }

  private acceptResult(result: OpenAICodexUpdateResult): void {
    if (this.disposed) return
    const checkedAt = Date.now()
    this.writeCached(result, checkedAt)
    this.setSnapshot({ ...resultSnapshot(result, this.effectiveDismissedNotice()), checkedAt })
    if (result.status === 'unavailable') {
      this.recheckTimer = setTimeout(() => { void this.refresh(true) }, OPENAI_CODEX_UPDATE_RECHECK_MS)
    }
  }

  /** Reuse plugin-version results for one day; force bypasses the cache. */
  async refresh(force = false): Promise<void> {
    if (this.disposed || this.request !== undefined) return
    clearTimeout(this.recheckTimer)
    this.recheckTimer = undefined
    const controller = new AbortController()
    this.request = controller
    const dismissedNotice = this.effectiveDismissedNotice()
    this.setSnapshot({ status: 'checking', currentVersion: this.currentVersion, ...dismissedNotice === undefined ? {} : { dismissedNotice } })
    try {
      if (!force) {
        const cached = this.readCached()
        if (cached !== undefined
          && cached.result.currentVersion === this.currentVersion) {
          this.setSnapshot({ ...resultSnapshot(cached.result, this.effectiveDismissedNotice()), checkedAt: cached.checkedAt })
          return
        }
      }
      const { response, value } = await requestJson(OPENAI_CODEX_UPDATE_PATH, {
        method: 'GET',
        headers: { accept: 'application/json' },
        credentials: 'same-origin',
        signal: controller.signal,
      })
      const result = response.ok ? parseOpenAICodexUpdateResult(value) : undefined
      const safeResult = result ?? {
        status: 'unavailable' as const,
        currentVersion: this.currentVersion,
        reason: 'registry-unavailable' as const,
      }
      this.acceptResult(safeResult)
    } catch {
      if (!controller.signal.aborted && !this.disposed) {
        const unavailable: OpenAICodexUpdateResult = {
          status: 'unavailable',
          currentVersion: this.currentVersion,
          reason: 'registry-unavailable',
        }
        this.acceptResult(unavailable)
      }
    } finally {
      if (this.request === controller) this.request = undefined
    }
  }

  /** Persist that this update version has already been displayed once without closing the live banner. */
  markShown(notice: string): void {
    this.shownInSession.add(notice)
    try {
      storage()?.setItem(OPENAI_CODEX_UPDATE_DISMISSED_KEY, notice)
    } catch {
      // Blocked storage falls back to in-session tracking.
    }
  }

  /** Persist dismissal and immediately hide the current banner. */
  dismiss(notice: string): void {
    this.dismissedInSession = notice
    try {
      storage()?.setItem(OPENAI_CODEX_UPDATE_DISMISSED_KEY, notice)
    } catch {
      // Dismissal remains effective for this mounted store even if storage is blocked.
    }
    this.setSnapshot({ ...this.snapshot, dismissedNotice: notice })
  }

  dispose(): void {
    this.disposed = true
    clearTimeout(this.recheckTimer)
    this.request?.abort()
    this.request = undefined
    this.listeners.clear()
  }
}
