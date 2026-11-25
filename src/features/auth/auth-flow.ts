/** Lifecycle owner for interactive Web OAuth login, manual callback, and account mutations. */

import type { AuthEvent, AuthPrompt } from '@earendil-works/pi-ai'
import { publicAuthError as safeMessage } from '../../shared/auth.ts'
import type { OpenAICodexProxyManager } from '../../platform/http/proxy-manager.ts'
import {
  isOpenAICodexReauthRequiredError,
  OPENAI_CODEX_REAUTH_REQUIRED_MESSAGE,
  readOpenAICodexRateLimits,
} from '../quota/usage.ts'
import type { OpenAICodexUsage } from '../quota/usage.ts'
import type { OpenAICodexQuotaState } from '../quota/state.ts'
import { loginOpenAICodex, logoutOpenAICodex, openAICodexAuthStatus } from '../../platform/auth/oauth-client.ts'
import type { CapturedOpenAICodexAccount, OpenAICodexCredentialStore } from '../../platform/auth/store.ts'

/** Maximum time a browser request waits for the provider's authorization URL. */
export const OPENAI_CODEX_AUTH_URL_TIMEOUT_MS = 30_000
/** Default deadline for the complete interactive authorization, including the callback. */
export const OPENAI_CODEX_AUTHORIZATION_TIMEOUT_MS = 600_000

const OAUTH_REDIRECT_URI = 'http://localhost:1455/auth/callback'

export type OpenAICodexWebAuthStatus =
  | { status: 'signed-out' }
  | { status: 'signing-in' }
  | { status: 'reauth-required'; message: typeof OPENAI_CODEX_REAUTH_REQUIRED_MESSAGE }
  | { status: 'signed-in'; usage: OpenAICodexUsage; quotaError?: string }
  | { status: 'error'; message: string }

interface LoginChallenge {
  url: string
}

interface PendingManualPrompt {
  resolve(value: string): void
  reject(error: unknown): void
}

export interface OpenAICodexWebAuthOptions {
  challengeTimeoutMs?: number
  authorizationTimeoutMs?: number | undefined
  proxyManager?: OpenAICodexProxyManager | undefined
  resolveProxyUrl?: (() => string | undefined) | undefined
  quotaState?: OpenAICodexQuotaState | undefined
}

function waitForPromptAbort(prompt: AuthPrompt, operationSignal: AbortSignal): Promise<string> {
  const signal = prompt.signal === undefined ? operationSignal : AbortSignal.any([prompt.signal, operationSignal])
  if (signal.aborted) return Promise.reject(signal.reason)
  return new Promise<string>((_resolve, reject) => {
    signal.addEventListener('abort', () => { reject(signal.reason) }, { once: true })
  })
}

function validCallbackUrl(value: string, challenge: LoginChallenge): boolean {
  if (value.split('?')[0] !== OAUTH_REDIRECT_URI || /[\s\\#]/u.test(value)) return false
  try {
    const callback = new URL(value)
    const authorization = new URL(challenge.url)
    const redirects = authorization.searchParams.getAll('redirect_uri')
    const expectedStates = authorization.searchParams.getAll('state')
    const codes = callback.searchParams.getAll('code')
    const states = callback.searchParams.getAll('state')
    const keys = [...callback.searchParams.keys()]
    return new Set(keys).size === keys.length
      && redirects.length === 1 && redirects[0] === OAUTH_REDIRECT_URI
      && expectedStates.length === 1 && expectedStates[0]!.trim() !== ''
      && codes.length === 1 && codes[0]!.trim() !== ''
      && states.length === 1 && states[0]!.trim() !== '' && states[0] === expectedStates[0]
      && !keys.some(key => key === 'error' || key.startsWith('error_'))
  } catch {
    return false
  }
}

/** One lifecycle owner for the callback server, challenge, and public status. */
export class OpenAICodexWebAuth {
  private state: OpenAICodexWebAuthStatus = { status: 'signed-out' }
  private operation: Promise<void> | undefined
  private cancellation: AbortController | undefined
  private challenge: LoginChallenge | undefined
  private challengeWaiters: Array<{ resolve(value: LoginChallenge): void; reject(error: unknown): void }> = []
  private challengeTimer: ReturnType<typeof setTimeout> | undefined
  private authorizationTimer: ReturnType<typeof setTimeout> | undefined
  private transition: Promise<void> | undefined
  private disposed = false
  private pendingManualPrompt: PendingManualPrompt | undefined
  private manualPromptClosed = false
  private readonly challengeTimeoutMs: number
  private readonly authorizationTimeoutMs: number
  private readonly proxyManager: OpenAICodexProxyManager | undefined
  private readonly resolveProxyUrl: () => string | undefined
  private readonly quotaState: OpenAICodexQuotaState | undefined

  constructor(
    private readonly store: OpenAICodexCredentialStore,
    options: OpenAICodexWebAuthOptions = {},
  ) {
    this.challengeTimeoutMs = options.challengeTimeoutMs ?? OPENAI_CODEX_AUTH_URL_TIMEOUT_MS
    this.authorizationTimeoutMs = options.authorizationTimeoutMs ?? OPENAI_CODEX_AUTHORIZATION_TIMEOUT_MS
    this.proxyManager = options.proxyManager
    this.resolveProxyUrl = options.resolveProxyUrl ?? (() => undefined)
    this.quotaState = options.quotaState
    if (!Number.isFinite(this.challengeTimeoutMs) || this.challengeTimeoutMs <= 0) {
      throw new TypeError('OpenAI Codex auth URL timeout must be a positive finite number')
    }
    if (!Number.isSafeInteger(this.authorizationTimeoutMs) || this.authorizationTimeoutMs <= 0 || this.authorizationTimeoutMs > 2_147_483_647) {
      throw new TypeError('OpenAI Codex authorization timeout must be a positive timer-safe integer')
    }
  }

  /** Read current public state, consulting durable storage while idle. */
  async status(snapshot?: CapturedOpenAICodexAccount): Promise<OpenAICodexWebAuthStatus> {
    if (this.operation !== undefined && this.state.status === 'signing-in') return this.state
    if (this.state.status === 'error') return this.state
    return this.readStoredStatus(snapshot)
  }

  /** Start or join the current browser-login operation. */
  async signIn(): Promise<LoginChallenge> {
    while (this.transition !== undefined) await this.transition
    if (this.disposed) throw new Error('OpenAI Codex plugin disposed')
    if (this.operation === undefined) this.start()
    if (this.challenge !== undefined) return this.challenge
    return new Promise<LoginChallenge>((resolve, reject) => {
      this.challengeWaiters.push({ resolve, reject })
    })
  }

  /** Accept exactly once, without waiting for token exchange or quota retrieval. */
  submitCallback(callbackUrl: string): 200 | 400 | 409 {
    const pending = this.pendingManualPrompt
    if (this.disposed || this.transition !== undefined || this.cancellation?.signal.aborted !== false
      || pending === undefined || this.challenge === undefined) return 409
    if (!validCallbackUrl(callbackUrl, this.challenge)) return 400
    this.manualPromptClosed = true
    pending.resolve(callbackUrl)
    return 200
  }

  private waitForManualPrompt(prompt: AuthPrompt, operationSignal: AbortSignal): Promise<string> {
    const signal = prompt.signal === undefined ? operationSignal : AbortSignal.any([prompt.signal, operationSignal])
    if (signal.aborted) return Promise.reject(signal.reason)
    if (this.cancellation?.signal !== operationSignal || this.pendingManualPrompt !== undefined || this.manualPromptClosed) {
      return Promise.reject(new Error('OpenAI Codex manual callback is unavailable'))
    }
    return new Promise<string>((resolve, reject) => {
      const clear = () => {
        signal.removeEventListener('abort', abort)
        if (this.pendingManualPrompt === pending) this.pendingManualPrompt = undefined
      }
      const pending: PendingManualPrompt = {
        resolve: value => { clear(); resolve(value) },
        reject: error => { clear(); reject(error) },
      }
      const abort = () => { this.manualPromptClosed = true; pending.reject(signal.reason) }
      this.pendingManualPrompt = pending
      signal.addEventListener('abort', abort, { once: true })
    })
  }

  async signOut(): Promise<void> { await this.finishLogin('logout') }
  async cancel(): Promise<void> { await this.finishLogin('cancel') }

  async activateAccount(accountKey: string): Promise<OpenAICodexWebAuthStatus> {
    return this.mutateStoredAccount(() => this.store.activate(accountKey))
  }

  async removeAccount(accountKey: string, replacementAccountKey?: string): Promise<OpenAICodexWebAuthStatus> {
    return this.mutateStoredAccount(() => this.store.removeAccount(accountKey, replacementAccountKey))
  }

  async dispose(): Promise<void> {
    this.disposed = true
    await this.finishLogin('dispose')
  }

  private async finishLogin(action: 'cancel' | 'logout' | 'dispose'): Promise<void> {
    while (this.transition !== undefined) await this.transition
    const operation = this.operation
    this.cancelSignIn(new Error(action === 'dispose' ? 'OpenAI Codex plugin disposed' : 'OpenAI Codex sign-in cancelled'))
    const transition = (async () => {
      await operation?.catch(() => undefined)
      this.challenge = undefined
      if (action === 'logout') {
        await logoutOpenAICodex(this.store)
        this.quotaState?.invalidate()
        this.state = { status: 'signed-out' }
      } else if (action === 'cancel') {
        this.state = await this.readStoredStatus()
      }
    })()
    this.transition = transition
    try { await transition } finally {
      if (this.transition === transition) this.transition = undefined
    }
  }

  private async mutateStoredAccount(operation: () => Promise<unknown>): Promise<OpenAICodexWebAuthStatus> {
    while (this.transition !== undefined) await this.transition
    if (this.disposed) throw new Error('OpenAI Codex plugin disposed')
    const login = this.operation
    this.cancelSignIn(new Error('OpenAI Codex sign-in cancelled'))
    let result: OpenAICodexWebAuthStatus | undefined
    const transition = (async () => {
      await login?.catch(() => undefined)
      this.challenge = undefined
      await operation()
      this.quotaState?.invalidate()
      result = await this.readStoredStatus()
      this.state = result
    })()
    this.transition = transition
    try {
      await transition
      if (result === undefined) throw new Error('openai-codex: account mutation did not produce status')
      return result
    } finally {
      if (this.transition === transition) this.transition = undefined
    }
  }

  private start(): void {
    const cancellation = new AbortController()
    this.cancellation = cancellation
    this.manualPromptClosed = false
    this.challenge = undefined
    this.state = { status: 'signing-in' }
    this.challengeTimer = setTimeout(() => {
      this.cancelSignIn(new Error(`OpenAI Codex did not provide an authorization URL within ${String(this.challengeTimeoutMs)}ms`))
    }, this.challengeTimeoutMs)
    this.challengeTimer.unref()
    this.authorizationTimer = setTimeout(() => {
      this.cancelSignIn(new Error('ChatGPT authorization expired. Please sign in again.'))
    }, this.authorizationTimeoutMs)
    this.authorizationTimer.unref()
    const login = () => loginOpenAICodex({
      signal: cancellation.signal,
      prompt: prompt => prompt.type === 'select'
        ? Promise.resolve('browser')
        : prompt.type === 'manual_code'
          ? this.waitForManualPrompt(prompt, cancellation.signal)
          : waitForPromptAbort(prompt, cancellation.signal),
      notify: event => {
        if (this.cancellation === cancellation && !cancellation.signal.aborted) this.onEvent(event)
      },
    }, this.store)
    this.operation = (this.proxyManager?.run(this.resolveProxyUrl(), login) ?? login()).then(
      async () => {
        this.quotaState?.invalidate()
        this.manualPromptClosed = true
        this.pendingManualPrompt?.reject(new Error('OpenAI Codex manual callback is unavailable'))
        if (this.challenge === undefined) {
          const error = new Error('OpenAI Codex sign-in finished without an authorization URL')
          this.rejectChallenge(error)
          this.state = { status: 'error', message: safeMessage(error) }
          return
        }
        this.state = await this.readStoredStatus()
      },
      async (error: unknown) => {
        this.manualPromptClosed = true
        this.pendingManualPrompt?.reject(new Error('OpenAI Codex manual callback is unavailable'))
        this.rejectChallenge(error)
        this.state = await this.statusAfterLoginFailure(error)
      },
    ).finally(() => {
      this.pendingManualPrompt?.reject(new Error('OpenAI Codex manual callback is unavailable'))
      this.clearChallengeTimer()
      clearTimeout(this.authorizationTimer)
      this.authorizationTimer = undefined
      this.challenge = undefined
      this.operation = undefined
      this.cancellation = undefined
    })
  }

  private onEvent(event: AuthEvent): void {
    if (event.type !== 'auth_url') return
    let url: URL
    try { url = new URL(event.url) } catch {
      this.cancelSignIn(new Error('OpenAI returned an invalid authorization URL'))
      return
    }
    if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') {
      this.cancelSignIn(new Error('OpenAI returned an unsafe authorization URL'))
      return
    }
    const challenge = { url: event.url }
    this.challenge = challenge
    this.clearChallengeTimer()
    for (const waiter of this.challengeWaiters.splice(0)) waiter.resolve(challenge)
  }

  private async readStoredStatus(snapshot?: CapturedOpenAICodexAccount): Promise<OpenAICodexWebAuthStatus> {
    const credentials = snapshot ?? await this.store.captureActiveAccount()
    const stored = await openAICodexAuthStatus(credentials)
    if (!stored.authenticated) return { status: 'signed-out' }
    try {
      const readUsage = () => readOpenAICodexRateLimits(credentials)
      return {
        status: 'signed-in',
        usage: this.quotaState === undefined
          ? await (this.proxyManager?.run(this.resolveProxyUrl(), readUsage) ?? readUsage())
          : (await this.quotaState.read(credentials)).usage,
      }
    } catch (error: unknown) {
      if (isOpenAICodexReauthRequiredError(error)) {
        return { status: 'reauth-required', message: OPENAI_CODEX_REAUTH_REQUIRED_MESSAGE }
      }
      return { status: 'signed-in', usage: { rateLimits: [] }, quotaError: safeMessage(error) }
    }
  }

  private async statusAfterLoginFailure(error: unknown): Promise<OpenAICodexWebAuthStatus> {
    const failure = { status: 'error', message: safeMessage(error) } as const
    try {
      const stored = await this.readStoredStatus()
      return stored.status === 'signed-out' ? failure : stored
    } catch {
      return failure
    }
  }

  private rejectChallenge(error: unknown): void {
    this.clearChallengeTimer()
    for (const waiter of this.challengeWaiters.splice(0)) waiter.reject(error)
  }

  private clearChallengeTimer(): void {
    if (this.challengeTimer === undefined) return
    clearTimeout(this.challengeTimer)
    this.challengeTimer = undefined
  }

  private cancelSignIn(error: Error): void {
    this.rejectChallenge(error)
    this.cancellation?.abort(error)
  }
}
