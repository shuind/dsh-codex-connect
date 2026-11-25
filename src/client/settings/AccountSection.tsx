/** Account status, multi-account controls, OAuth feedback, and quota bars. */

import { useEffect, useId, useState } from 'react'
import type { CSSProperties } from 'react'
import type { OpenAICodexUsage } from '../../shared/auth.ts'
import type { OpenAICodexAccountStore, AccountSnapshot, AccountStatus } from '../shared/account-store.ts'
import { isOfficialDesktopShell } from '../shared/browser-launch.ts'
import type { OpenAICodexSettingsKey } from '../locales/index.ts'
import {
  accountBodyStyle,
  accountButtonStyle,
  accountErrorStyle,
  accountPrimaryButtonStyle,
  dangerButtonStyle,
  quotaTitleStyle,
  rowStyle,
} from './styles.ts'

export type OpenAICodexTranslate = (key: OpenAICodexSettingsKey, params?: Record<string, unknown>) => string

const quotaListStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 18, paddingTop: 2 }
const quotaGroupStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 }
const quotaLabelStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, lineHeight: '20px', color: 'var(--dsw-alias-label-secondary)' }
const progressTrackStyle: CSSProperties = { height: 8, overflow: 'hidden', borderRadius: 999, background: 'var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.08))' }
const commandStyle: CSSProperties = { margin: 0, padding: '10px 12px', overflowX: 'auto', borderRadius: 8, background: 'var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.06))', color: 'var(--dsw-alias-label-primary)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, lineHeight: '20px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }
const accountPanelStyle: CSSProperties = { overflow: 'hidden', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 10 }
const accountRowStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, padding: '12px 14px', borderTop: '1px solid var(--dsw-alias-border-l2)' }
const accountIdentityStyle: CSSProperties = { minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }
const accountBadgeStyle: CSSProperties = { display: 'inline-flex', marginLeft: 7, padding: '1px 7px', borderRadius: 999, background: 'var(--dsw-alias-state-success-secondary, rgba(34, 160, 107, 0.12))', color: 'var(--dsw-alias-state-success-primary, #087a41)', fontSize: 11, lineHeight: '18px', fontWeight: 600 }

function progressFillStyle(percent: number): CSSProperties {
  return {
    width: `${Math.max(0, Math.min(100, percent))}%`,
    height: '100%',
    borderRadius: 'inherit',
    background: 'var(--dsw-alias-brand-primary, #1677ff)',
  }
}

function windowLabel(seconds: number, t: OpenAICodexTranslate): string {
  if (seconds === 5 * 60 * 60) return t('fiveHourLimit')
  if (seconds === 7 * 24 * 60 * 60) return t('weeklyLimit')
  const hours = seconds / (60 * 60)
  return Number.isInteger(hours) ? t('hourLimit', { count: hours }) : t('usageWindow')
}

function formatPercent(percent: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(percent)
}

/** Format a server-declared Unix-second reset in the user's local timezone. */
export function formatOpenAICodexResetAt(resetAt: number | undefined): string | undefined {
  if (resetAt === undefined || !Number.isSafeInteger(resetAt) || resetAt <= 0) return undefined
  const date = new Date(resetAt * 1_000)
  if (!Number.isFinite(date.getTime())) return undefined
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function QuotaBar({ label, percent, detail, t }: {
  label: string
  percent: number
  detail?: string
  t: OpenAICodexTranslate
}) {
  const display = formatPercent(percent)
  return (
    <div style={quotaGroupStyle}>
      <div style={quotaLabelStyle}>
        <span>{label}</span>
        <span>{t('percentRemaining', { percent: display })}</span>
      </div>
      <div
        style={progressTrackStyle}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={t('percentRemaining', { percent: display })}
      >
        <div style={progressFillStyle(percent)} />
      </div>
      {detail === undefined ? null : <p style={accountBodyStyle}>{detail}</p>}
    </div>
  )
}

/** Quota rows shared by Models and Plugin settings. */
export function UsageLimits({ usage, quotaError, t, heading = true }: {
  heading?: boolean
  usage: OpenAICodexUsage
  quotaError?: string
  t: OpenAICodexTranslate
}) {
  const hasData = usage.rateLimits.length > 0 || usage.credits !== undefined || usage.individualLimit !== undefined
  return (
    <div style={quotaListStyle}>
      {heading ? <h3 style={quotaTitleStyle}>{t('usageLimits')}</h3> : null}
      {usage.rateLimits.map(limit => (
        <div key={limit.id} style={quotaGroupStyle}>
          {limit.windows.map(window => (
            <QuotaBar
              key={window.windowSeconds}
              label={`${limit.name ?? limit.id} · ${windowLabel(window.windowSeconds, t)}`}
              percent={window.remainingPercent}
              detail={t('resetAt', {
                time: formatOpenAICodexResetAt(window.resetAt) ?? t('resetUnavailable'),
              })}
              t={t}
            />
          ))}
        </div>
      ))}
      {usage.individualLimit === undefined ? null : (
        <QuotaBar
          label={t('monthlyLimit')}
          percent={usage.individualLimit.remainingPercent}
          detail={t('exactRemaining', {
            remaining: usage.individualLimit.remaining,
            limit: usage.individualLimit.limit,
          })}
          t={t}
        />
      )}
      {usage.credits === undefined ? null : (
        <div style={quotaLabelStyle}>
          <span>{t('credits')}</span>
          <span>{usage.credits.unlimited
            ? t('unlimited')
            : usage.credits.balance === undefined ? t('available') : usage.credits.balance}</span>
        </div>
      )}
      {!hasData && quotaError === undefined ? <p style={accountBodyStyle}>{t('quotaUnavailable')}</p> : null}
      {quotaError === undefined ? null : <p style={accountErrorStyle}>{t('quotaUnavailable')}</p>}
    </div>
  )
}

/** Account indicator colors shared by the compact row and expanded controls. */
export function dotStyle(status: AccountStatus['status']): CSSProperties {
  const color = status === 'signed-in'
    ? 'var(--dsw-alias-state-success-primary, #22a06b)'
    : status === 'error' || status === 'reauth-required' || status === 'remote-web-origin-not-trusted'
      ? 'var(--dsw-alias-state-error-primary, #d92d20)'
      : status === 'signing-in' || status === 'loading'
        ? 'var(--dsw-alias-brand-primary, #1677ff)'
        : 'var(--dsw-alias-label-dimmed, #9aa0a6)'
  return { width: 9, height: 9, borderRadius: '50%', flex: '0 0 auto', background: color }
}

/** Non-sensitive account state label for either settings presentation. */
export function accountStatusLabel(status: AccountStatus['status'], t: OpenAICodexTranslate): string {
  if (status === 'remote-web-origin-not-trusted' && isOfficialDesktopShell()) return t('desktopOriginTitle')
  const keys = {
    'signed-in': 'signedIn', loading: 'loadingAccount', 'signing-in': 'signingIn',
    'reauth-required': 'reauthRequired', 'remote-web-origin-not-trusted': 'remoteOriginTitle',
    error: 'requestFailed', 'signed-out': 'signedOut',
  } as const
  return t(keys[status])
}

/** Shared OAuth actions; Models uses shorter, task-oriented labels. */
export function AccountActions({ t, store, snapshot, compact = false }: {
  t: OpenAICodexTranslate
  store: OpenAICodexAccountStore
  snapshot: AccountSnapshot
  compact?: boolean
}) {
  const { status, busy, operation } = snapshot
  if (status.status === 'loading' || status.status === 'remote-web-origin-not-trusted') return null
  const authorizing = operation.kind === 'starting-authorization'
    || operation.kind === 'waiting-authorization'
    || operation.kind === 'cancelling-authorization'
    || status.status === 'signing-in'
  if (authorizing) return <div style={rowStyle}>
    <button type="button" style={accountButtonStyle} disabled={busy} onClick={() => { void store.signIn() }}>
      {busy ? t('working') : t(compact ? 'continueAuthorization' : 'reopenAuthorization')}
    </button>
    <button type="button" style={accountButtonStyle} disabled={busy} onClick={() => { void store.cancel() }}>{t('cancelSignIn')}</button>
  </div>
  if (status.status === 'signed-in') return null
  const retry = status.status === 'error' || status.status === 'reauth-required'
  const action = retry ? t(compact ? 'reauthorize' : 'loginAgain') : t(compact ? 'authorize' : 'login')
  return <button type="button" style={accountPrimaryButtonStyle} disabled={busy}
    onClick={() => { void store.signIn() }}>{busy ? t('working') : action}</button>
}

/** Saved-account summary and explicit account-management actions. */
export function AccountManager({ t, store, snapshot, quotaExpanded, quotaControlsId, onToggleQuota, compact = false }: {
  t: OpenAICodexTranslate
  store: OpenAICodexAccountStore
  snapshot: AccountSnapshot
  quotaExpanded?: boolean
  quotaControlsId?: string
  onToggleQuota?: () => void
  compact?: boolean
}) {
  const accountsPanelId = useId()
  const [expanded, setExpanded] = useState(false)
  const [removeKey, setRemoveKey] = useState<string>()
  const { accounts, busy, operation, status } = snapshot
  const active = accounts.find(account => account.active)
  const removeAccount = accounts.find(account => account.accountKey === removeKey)
  const replacement = removeAccount?.active === true
    ? accounts.find(account => account.accountKey !== removeAccount.accountKey)
    : undefined
  const authorizing = operation.kind === 'starting-authorization'
    || operation.kind === 'waiting-authorization'
    || operation.kind === 'cancelling-authorization'
    || status.status === 'signing-in'

  useEffect(() => {
    if (removeKey !== undefined && !accounts.some(account => account.accountKey === removeKey)) setRemoveKey(undefined)
  }, [accounts, removeKey])

  if (accounts.length === 0) return <AccountActions t={t} store={store} snapshot={snapshot} compact={compact} />
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    <div style={rowStyle}>
      <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, gap: 10 }}>
        <span aria-hidden="true" style={{ width: 38, height: 38, borderRadius: '50%', display: 'grid', placeItems: 'center', flex: '0 0 auto', background: 'var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.06))', fontWeight: 600 }}>
          {(active?.displayName.trim()[0] ?? 'C').toUpperCase()}
        </span>
        <span style={accountIdentityStyle}>
          <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{active?.displayName ?? t('accountHeading')}</strong>
          <span style={accountBodyStyle}>{active?.maskedEmail === undefined
            ? t('currentAccountDetail')
            : `${active.maskedEmail} · ${t('currentAccountDetail')}`}</span>
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {status.status === 'reauth-required' && !authorizing
          ? <button type="button" style={accountPrimaryButtonStyle} disabled={busy} onClick={() => { void store.signIn() }}>{t('reauthorize')}</button>
          : null}
        {authorizing ? <AccountActions t={t} store={store} snapshot={snapshot} compact /> : null}
        {onToggleQuota === undefined || status.status !== 'signed-in' ? null : (
          <button type="button" style={accountButtonStyle} aria-expanded={quotaExpanded} aria-controls={quotaControlsId} onClick={onToggleQuota}>
            {t(quotaExpanded === true ? 'hideQuota' : 'viewQuota')}
          </button>
        )}
        <button type="button" style={accountButtonStyle} aria-expanded={expanded} aria-controls={accountsPanelId} onClick={() => { setExpanded(!expanded) }}>
          {t(expanded ? 'hideAccounts' : 'manageAccounts')}
        </button>
      </div>
    </div>
    {authorizing ? <p style={accountBodyStyle}>{t('addingAccountKeepsCurrent')}</p> : null}
    {expanded ? <div id={accountsPanelId} style={accountPanelStyle}>
      <div style={{ ...rowStyle, padding: '10px 14px', background: 'var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.04))' }}>
        <strong>{t('savedAccounts')} · {accounts.length}</strong>
        <button type="button" style={accountPrimaryButtonStyle} disabled={busy || authorizing} onClick={() => { void store.signIn() }}>
          {operation.kind === 'starting-authorization' ? t('working') : t('addAccount')}
        </button>
      </div>
      {accounts.map(account => <div key={account.accountKey} style={accountRowStyle}>
        <span style={accountIdentityStyle}>
          <strong>{account.displayName}{account.active ? <span style={accountBadgeStyle}>{t('currentAccount')}</span> : null}</strong>
          <span style={accountBodyStyle}>{account.maskedEmail === undefined
            ? t(account.active ? 'currentAccountDetail' : 'savedAccountDetail')
            : `${account.maskedEmail} · ${t(account.active ? 'currentAccountDetail' : 'savedAccountDetail')}`}</span>
        </span>
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" style={accountButtonStyle} disabled={busy || account.active}
            onClick={() => { void store.activate(account.accountKey) }}>
            {operation.kind === 'activating' && operation.accountKey === account.accountKey
              ? t('working') : t(account.active ? 'usingAccount' : 'useAccount')}
          </button>
          <button type="button" style={dangerButtonStyle} disabled={busy} onClick={() => { setRemoveKey(account.accountKey) }}>
            {t('removeAccount')}
          </button>
        </span>
      </div>)}
      <div style={{ ...rowStyle, padding: '10px 14px', borderTop: '1px solid var(--dsw-alias-border-l2)' }}>
        <span style={accountBodyStyle}>{t('activeAccountHelp')}</span>
        <button type="button" style={dangerButtonStyle} disabled={busy} onClick={() => { void store.signOut() }}>
          {operation.kind === 'signing-out' ? t('working') : t('signOutAll')}
        </button>
      </div>
    </div> : null}
    {removeAccount === undefined ? null : <section role="region" aria-live="polite" aria-label={t('removeAccountTitle', { name: removeAccount.displayName })}
      style={{ padding: 14, border: '1px solid var(--dsw-alias-state-error-primary, #d92d20)', borderRadius: 10 }}>
      <strong>{t('removeAccountTitle', { name: removeAccount.displayName })}</strong>
      <p style={{ ...accountBodyStyle, marginTop: 5 }}>{accounts.length === 1
        ? t('removeLastAccountCopy')
        : replacement === undefined ? t('removeAccountCopy') : t('removeActiveAccountCopy', { name: replacement.displayName })}</p>
      <div style={{ ...rowStyle, justifyContent: 'flex-end' }}>
        <button type="button" style={accountButtonStyle} onClick={() => { setRemoveKey(undefined) }}>{t('cancel')}</button>
        <button type="button" style={dangerButtonStyle} disabled={busy} onClick={() => {
          void store.remove(removeAccount.accountKey, replacement?.accountKey)
        }}>{operation.kind === 'removing' ? t('working') : t('confirmRemove')}</button>
      </div>
    </section>}
  </div>
}

/** Mounted only for an idle pending authorization; disclosure and secrets stay local. */
function ManualCallbackForm({ t, store }: { t: OpenAICodexTranslate; store: OpenAICodexAccountStore }) {
  const [expanded, setExpanded] = useState(false)
  const [callbackUrl, setCallbackUrl] = useState('')
  const id = useId()
  return <>
    <button type="button" style={accountButtonStyle} aria-expanded={expanded} aria-controls={id}
      onClick={() => { setCallbackUrl(''); setExpanded(!expanded) }}>{t('manualCallbackToggle')}</button>
    {expanded ? <form id={id} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', flexBasis: '100%', minWidth: 0, gap: 10 }}
      onSubmit={event => {
        event.preventDefault()
        if (!callbackUrl.trim() || store.getSnapshot().busy) return
        void store.submitCallback(callbackUrl)
        setCallbackUrl('')
        setExpanded(false)
      }}>
      <p id={`${id}-help`} style={accountBodyStyle}>{t('manualCallbackHelp')}</p>
      <p style={accountBodyStyle}>{t('manualCallbackPrivacy')}</p>
      <label htmlFor={`${id}-input`} style={accountBodyStyle}>{t('manualCallbackLabel')}</label>
      <input id={`${id}-input`} type="text" value={callbackUrl} autoComplete="off" spellCheck={false}
        autoCapitalize="none" aria-describedby={`${id}-help`}
        style={{ ...accountButtonStyle, width: '100%', borderRadius: 8, cursor: 'text' }}
        onChange={event => { setCallbackUrl(event.target.value) }} />
      <div style={rowStyle}>
        <button type="submit" style={accountPrimaryButtonStyle} disabled={!callbackUrl.trim()}>{t('manualCallbackSubmit')}</button>
        <button type="button" style={accountButtonStyle} onClick={() => { setCallbackUrl(''); setExpanded(false) }}>{t('cancel')}</button>
      </div>
    </form> : null}
  </>
}

/** Recovery links, errors and trusted-origin guidance in either account entry. */
export function AccountFeedback({ t, snapshot, store }: {
  t: OpenAICodexTranslate
  snapshot: AccountSnapshot
  store: OpenAICodexAccountStore
}) {
  const { status, loginUrl, operationError } = snapshot
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const desktop = isOfficialDesktopShell()
  const trustedOriginCommand = desktop ? undefined : `dsh plugin --profile web exec @shuind/dsh-codex-connect trust-origin ${window.location.origin}`

  const copyTrustedOriginCommand = async (): Promise<void> => {
    if (trustedOriginCommand === undefined) return
    setCopyFailed(false)
    try {
      if (navigator.clipboard?.writeText === undefined) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(trustedOriginCommand)
      setCopied(true)
    } catch {
      setCopyFailed(true)
    }
  }

  return <>
    {loginUrl === undefined ? null : <p style={accountBodyStyle}>{t('authorizationHelp')}</p>}
    {loginUrl !== undefined || snapshot.operation.kind === 'waiting-authorization' && !snapshot.busy ? (
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        {loginUrl === undefined ? null : <a
          href={loginUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ ...accountPrimaryButtonStyle, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}
        >
          {t('openLoginInBrowser')}
        </a>}
        {snapshot.operation.kind === 'waiting-authorization' && !snapshot.busy
          ? <ManualCallbackForm key={snapshot.authorizationRevision ?? 0} t={t} store={store} /> : null}
      </div>
    ) : null}
    {snapshot.callbackFeedback === undefined ? null : <p role="status"
      style={snapshot.callbackFeedback === 'callbackAccepted' || snapshot.callbackFeedback === 'callbackUnconfirmed' ? accountBodyStyle : accountErrorStyle}>
      {t(snapshot.callbackFeedback)}
    </p>}
    {status.status === 'error' || status.status === 'reauth-required'
      ? <p style={accountErrorStyle}>{status.message}</p>
      : null}
    {operationError === undefined ? null : <p style={accountErrorStyle}>{operationError}</p>}
    {status.status === 'remote-web-origin-not-trusted' ? (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={accountErrorStyle}>{t(desktop ? 'desktopOriginDescription' : 'remoteOriginDescription')}</p>
        <p style={accountBodyStyle}>{t(desktop ? 'desktopOriginDiagnosticsHelp' : 'remoteOriginCommandHelp')}</p>
        {trustedOriginCommand === undefined ? null : <>
          <code style={commandStyle}>{trustedOriginCommand}</code>
          <div style={rowStyle}>
            <button type="button" style={accountButtonStyle} onClick={() => { void copyTrustedOriginCommand() }}>
              {copied ? t('remoteOriginCopied') : t('remoteOriginCopy')}
            </button>
            {copyFailed ? <span style={accountErrorStyle}>{t('remoteOriginCopyFailed')}</span> : null}
          </div>
        </>}
      </div>
    ) : null}
  </>
}
