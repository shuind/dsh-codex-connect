/** Node-free OAuth route constants and closed-vocabulary auth diagnostics. */

/** Plugin-owned status endpoint consumed by its browser half. */
export const OPENAI_CODEX_AUTH_STATUS_PATH = '/plugins/dsh-openai-codex/auth/status'
/** Plugin-owned browser-login endpoint consumed by its browser half. */
export const OPENAI_CODEX_AUTH_LOGIN_PATH = '/plugins/dsh-openai-codex/auth/login'
/** Submit the complete OAuth redirect URL to the pending browser login. */
export const OPENAI_CODEX_AUTH_CALLBACK_PATH = '/plugins/dsh-openai-codex/auth/callback'
/** Plugin-owned logout endpoint consumed by its browser half. */
export const OPENAI_CODEX_AUTH_LOGOUT_PATH = '/plugins/dsh-openai-codex/auth/logout'
/** Cancel only the pending authorization; never delete a stored credential. */
export const OPENAI_CODEX_AUTH_CANCEL_PATH = '/plugins/dsh-openai-codex/auth/cancel'
/** List, activate, and remove stored OpenAI Codex accounts. */
export const OPENAI_CODEX_AUTH_ACCOUNTS_PATH = '/plugins/dsh-openai-codex/auth/accounts'

const REQUEST_AUTH_MESSAGES = {
  MISSING_CREDENTIAL: 'OpenAI Codex request account is unavailable. Please select an account or sign in again.',
  AUTH_FAILED: 'OpenAI Codex operation failed. Please try again.',
  REAUTH_REQUIRED: 'OpenAI Codex authorization must be renewed',
  ABORTED: 'OpenAI Codex request cancelled.',
} as const

/** Safe request-authentication failure with no upstream message or nested cause. */
export class OpenAICodexRequestAuthError extends Error {
  constructor(readonly code: keyof typeof REQUEST_AUTH_MESSAGES) {
    super(REQUEST_AUTH_MESSAGES[code])
    this.name = code === 'ABORTED' ? 'AbortError' : 'OpenAICodexRequestAuthError'
  }
}

const PUBLIC_MESSAGES = new Set([
  ...Object.values(REQUEST_AUTH_MESSAGES),
  'ChatGPT authorization expired. Please sign in again.',
  'OpenAI Codex sign-in cancelled',
  'OpenAI Codex plugin disposed',
  'openai-codex: account not found',
  'openai-codex: replacement account not found',
  'openai-codex: removing the active account requires replacementAccountKey',
  'openai-codex: replacementAccountKey is only valid when removing the active account',
])

/** Return a bounded diagnostic from a closed vocabulary, never upstream response text. */
export function publicAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  if (PUBLIC_MESSAGES.has(message)) return message
  if (/^OpenAI Codex usage request failed with HTTP [1-5][0-9]{2}$/u.test(message)) return message
  return 'OpenAI Codex operation failed. Please try again.'
}

/** Stable public discriminant for an expired or revoked Codex OAuth session. */
export const OPENAI_CODEX_REAUTH_REQUIRED_CODE = 'OPENAI_CODEX_REAUTH_REQUIRED' as const

/** One quota window expressed as remaining capacity for direct UI rendering. */
export interface OpenAICodexRateLimitWindow {
  /** Percent still available in this window. */
  readonly remainingPercent: number
  /** Server-declared rolling-window length in seconds. */
  readonly windowSeconds: number
  /** Server-declared reset time as Unix seconds, when supplied and valid. */
  readonly resetAt?: number
}

/** One separately metered Codex quota bucket. */
export interface OpenAICodexRateLimit {
  /** Stable server feature id. */
  readonly id: string
  /** Optional server-provided display name. */
  readonly name?: string
  /** Available rolling windows for this bucket. */
  readonly windows: readonly OpenAICodexRateLimitWindow[]
}

/** Optional exact prepaid-credit balance returned by ChatGPT. */
export interface OpenAICodexCredits {
  /** Whether the balance is unmetered. */
  readonly unlimited: boolean
  /** Exact provider-formatted balance when finite and disclosed. */
  readonly balance?: string
}

/** Optional exact workspace member spend limit returned by ChatGPT. */
export interface OpenAICodexIndividualLimit {
  /** Exact configured limit. */
  readonly limit: string
  /** Exact amount consumed. */
  readonly used: string
  /** Exact amount still available. */
  readonly remaining: string
  /** Percent still available for progress rendering. */
  readonly remainingPercent: number
}

/** Secret-free quota projection returned to the browser. */
export interface OpenAICodexUsage {
  /** Rolling Codex rate-limit buckets. */
  readonly rateLimits: readonly OpenAICodexRateLimit[]
  /** Exact prepaid-credit balance when supported for this account. */
  readonly credits?: OpenAICodexCredits
  /** Exact workspace member limit when supported for this account. */
  readonly individualLimit?: OpenAICodexIndividualLimit
}
