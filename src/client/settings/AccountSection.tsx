/** Account status, multi-account controls, OAuth feedback, and color-coded quota bars. */

import { useEffect, useId, useState } from 'react'
import type { CSSProperties } from 'react'
import type { OpenAICodexUsage } from '../../shared/auth.ts'
import type { OpenAICodexAccountStore, AccountSnapshot, AccountStatus } from '../shared/account-store.ts'
import { isOfficialDesktopShell } from '../shared/browser-launch.ts'
import type { OpenAICodexSettingsKey } from '../locales/index.ts'
import {
  activeBadgeStyle,
  bodyStyle,
  buttonsStyle,
  errorStyle,
  primaryButtonStyle,
  quotaTitleStyle,
  rowStyle,
} from './styles.ts'

export type OpenAICodexTranslate = (key: OpenAICodexSettingsKey, params?: Record<string, unknown>) => string

const quotaGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }
const quotaCardStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', borderRadius: 8, background: 'var(--dsw-alias-bg-layer-2, rgba(128, 128, 128, 0.06))' }
const quotaLabelStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, fontSize: 12, lineHeight: '16px', color: 'var(--dsw-alias-label-secondary)' }
const quotaPercentStyle: CSSProperties = { fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--dsw-alias-label-primary)' }
const progressTrackStyle: CSSProperties = { height: 6, overflow: 'hidden', borderRadius: 999, background: 'var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.2))' }
const commandStyle: CSSProperties = { margin: 0, padding: '8px 10px', overflowX: 'auto', borderRadius: 8, background: 'var(--dsw-alias-bg-layer-2, rgba(128, 128, 128, 0.08))', color: 'var(--dsw-alias-label-primary)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, lineHeight: '18px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }
const accountPanelStyle: CSSProperties = { marginTop: 10, paddingTop: 10, borderTop: '0.5px solid var(--dsw-alias-border-l2)', display: 'flex', flexDirection: 'column', gap: 8 }
const accountRowStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--dsw-alias-bg-layer-2, rgba(128, 128, 128, 0.05))' }
const accountIdentityStyle: CSSProperties = { minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }

function quotaFillColor(percent: number): string {
  const bounded = Math.max(0, Math.min(100, percent))
  if (bounded >= 60) return 'var(--dsw-alias-state-success-primary, #22c55e)'
  if (bounded >= 40) return 'var(--dsw-alias-state-warn-primary, #eab308)'
  if (bounded >= 20) return '#f97316'
  return 'var(--dsw-alias-state-error-primary, #ef4444)'
}

function progressFillStyle(percent: number): CSSProperties {
  return {
    width: `${Math.max(0, Math.min(100, percent))}%`,
    height: '100%',
    borderRadius: 'inherit',
    background: quotaFillColor(percent),
    transition: 'width 0.2s ease',
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
    <div style={quotaCardStyle}>
      <div style={quotaLabelStyle}>
        <span>{label}</span>
        <span style={quotaPercentStyle}>{t('percentRemaining', { percent: display })}</span>
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
      {detail === undefined ? null : <p style={{ ...bodyStyle, fontSize: 11.5 }}>{detail}</p>}
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {heading ? <h3 style={quotaTitleStyle}>{t('usageLimits')}</h3> : null}
      {usage.rateLimits.length > 0 || usage.individualLimit !== undefined ? (
        <div style={quotaGridStyle}>
          {usage.rateLimits.flatMap(limit => limit.windows.map(window => (
            <QuotaBar
              key={`${limit.id}:${window.windowSeconds}`}
              label={`${limit.name ?? limit.id} · ${windowLabel(window.windowSeconds, t)}`}
              percent={window.remainingPercent}
              detail={t('resetAt', {
                time: formatOpenAICodexResetAt(window.resetAt) ?? t('resetUnavailable'),
              })}
              t={t}
            />
          )))}
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
        </div>
      ) : null}
      {usage.credits === undefined ? null : (
        <div style={{ ...quotaLabelStyle, padding: '2px 2px 0' }}>
          <span>{t('credits')}</span>
          <span style={quotaPercentStyle}>{usage.credits.unlimited
            ? t('unlimited')
            : usage.credits.balance === undefined ? t('available') : usage.credits.balance}</span>
        </div>
      )}
      {!hasData && quotaError === undefined ? <p style={bodyStyle}>{t('quotaUnavailable')}</p> : null}
      {quotaError === undefined ? null : <p style={errorStyle}>{t('quotaUnavailable')}</p>}
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
  return { width: 8, height: 8, borderRadius: '50%', flex: '0 0 auto', background: color }
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
  if (authorizing) return <div style={buttonsStyle}>
    <button type="button" className="cc-btn" disabled={busy} onClick={() => { void store.signIn() }}>
      {busy ? t('working') : t(compact ? 'continueAuthorization' : 'reopenAuthorization')}
    </button>
    <button type="button" className="cc-btn" disabled={busy} onClick={() => { void store.cancel() }}>{t('cancelSignIn')}</button>
  </div>
  if (status.status === 'signed-in') return null
  const retry = status.status === 'error' || status.status === 'reauth-required'
  const action = retry ? t(compact ? 'reauthorize' : 'loginAgain') : t(compact ? 'authorize' : 'login')
  return <button type="button" className="cc-btn" style={primaryButtonStyle} disabled={busy}
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
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
    <div style={rowStyle}>
      <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, gap: 10 }}>
        <span aria-hidden="true" style={{ width: 32, height: 32, borderRadius: '50%', display: 'grid', placeItems: 'center', flex: '0 0 auto', background: 'var(--dsw-alias-bg-layer-2, rgba(128, 128, 128, 0.14))', fontSize: 13, fontWeight: 600 }}>
          {(active?.displayName.trim()[0] ?? 'C').toUpperCase()}
        </span>
        <span style={accountIdentityStyle}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <strong style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{active?.displayName ?? t('accountHeading')}</strong>
            {compact ? null : (
              <span role="status" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--dsw-alias-label-secondary)' }}>
                <span aria-hidden="true" style={dotStyle(status.status)} />
                <span>{accountStatusLabel(status.status, t)}</span>
              </span>
            )}
          </span>
          <span style={bodyStyle}>{active?.maskedEmail === undefined
            ? t('currentAccountDetail')
            : `${active.maskedEmail} · ${t('currentAccountDetail')}`}</span>
        </span>
      </div>
      <div style={buttonsStyle}>
        {status.status === 'reauth-required' && !authorizing
          ? <button type="button" className="cc-btn" style={primaryButtonStyle} disabled={busy} onClick={() => { void store.signIn() }}>{t('reauthorize')}</button>
          : null}
        {authorizing ? <AccountActions t={t} store={store} snapshot={snapshot} compact /> : null}
        {onToggleQuota === undefined || status.status !== 'signed-in' ? null : (
          <button type="button" className="cc-btn" aria-expanded={quotaExpanded} aria-controls={quotaControlsId} onClick={onToggleQuota}>
            {t(quotaExpanded === true ? 'hideQuota' : 'viewQuota')}
          </button>
        )}
        <button type="button" className="cc-btn" aria-expanded={expanded} aria-controls={accountsPanelId} onClick={() => { setExpanded(!expanded) }}>
          {t(expanded ? 'hideAccounts' : 'manageAccounts')}
        </button>
      </div>
    </div>
    {authorizing ? <p style={bodyStyle}>{t('addingAccountKeepsCurrent')}</p> : null}
    {expanded ? <div id={accountsPanelId} style={accountPanelStyle}>
      <div style={rowStyle}>
        <span style={quotaTitleStyle}>{t('savedAccounts')} · {accounts.length}</span>
        <button type="button" className="cc-btn" style={primaryButtonStyle} disabled={busy || authorizing} onClick={() => { void store.signIn() }}>
          {operation.kind === 'starting-authorization' ? t('working') : t('addAccount')}
        </button>
      </div>
      {accounts.map(account => <div key={account.accountKey} style={accountRowStyle}>
        <span style={accountIdentityStyle}>
          <strong style={{ fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span>{account.displayName}</span>
            {account.active ? <span style={activeBadgeStyle}>{t('currentAccount')}</span> : null}
          </strong>
          <span style={bodyStyle}>{account.maskedEmail === undefined
            ? t(account.active ? 'currentAccountDetail' : 'savedAccountDetail')
            : `${account.maskedEmail} · ${t(account.active ? 'currentAccountDetail' : 'savedAccountDetail')}`}</span>
        </span>
        <span style={buttonsStyle}>
          <button type="button" className="cc-btn" disabled={busy || account.active}
            onClick={() => { void store.activate(account.accountKey) }}>
            {operation.kind === 'activating' && operation.accountKey === account.accountKey
              ? t('working') : t(account.active ? 'usingAccount' : 'useAccount')}
          </button>
          <button type="button" className="cc-btn cc-btn-danger" disabled={busy} onClick={() => { setRemoveKey(account.accountKey) }}>
            {t('removeAccount')}
          </button>
        </span>
      </div>)}
      <div style={{ ...rowStyle, paddingTop: 4 }}>
        <span style={bodyStyle}>{t('activeAccountHelp')}</span>
        <button type="button" className="cc-btn cc-btn-danger" disabled={busy} onClick={() => { void store.signOut() }}>
          {operation.kind === 'signing-out' ? t('working') : t('signOutAll')}
        </button>
      </div>
    </div> : null}
    {removeAccount === undefined ? null : <section role="region" aria-live="polite" aria-label={t('removeAccountTitle', { name: removeAccount.displayName })}
      style={{ padding: 12, border: '0.5px solid var(--dsw-alias-state-error-primary, #d92d20)', borderRadius: 8 }}>
      <strong style={{ fontSize: 13 }}>{t('removeAccountTitle', { name: removeAccount.displayName })}</strong>
      <p style={{ ...bodyStyle, marginTop: 4 }}>{accounts.length === 1
        ? t('removeLastAccountCopy')
        : replacement === undefined ? t('removeAccountCopy') : t('removeActiveAccountCopy', { name: replacement.displayName })}</p>
      <div style={{ ...buttonsStyle, justifyContent: 'flex-end', marginTop: 10 }}>
        <button type="button" className="cc-btn" onClick={() => { setRemoveKey(undefined) }}>{t('cancel')}</button>
        <button type="button" className="cc-btn cc-btn-danger" disabled={busy} onClick={() => {
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
    <button type="button" className="cc-btn" aria-expanded={expanded} aria-controls={id}
      onClick={() => { setCallbackUrl(''); setExpanded(!expanded) }}>{t('manualCallbackToggle')}</button>
    {expanded ? <form id={id} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', flexBasis: '100%', minWidth: 0, gap: 8, marginTop: 6 }}
      onSubmit={event => {
        event.preventDefault()
        if (!callbackUrl.trim() || store.getSnapshot().busy) return
        void store.submitCallback(callbackUrl)
        setCallbackUrl('')
        setExpanded(false)
      }}>
      <p id={`${id}-help`} style={bodyStyle}>{t('manualCallbackHelp')}</p>
      <p style={bodyStyle}>{t('manualCallbackPrivacy')}</p>
      <label htmlFor={`${id}-input`} style={bodyStyle}>{t('manualCallbackLabel')}</label>
      <input id={`${id}-input`} type="text" className="cc-input" value={callbackUrl} autoComplete="off" spellCheck={false}
        autoCapitalize="none" aria-describedby={`${id}-help`}
        onChange={event => { setCallbackUrl(event.target.value) }} />
      <div style={buttonsStyle}>
        <button type="submit" className="cc-btn" style={primaryButtonStyle} disabled={!callbackUrl.trim()}>{t('manualCallbackSubmit')}</button>
        <button type="button" className="cc-btn" onClick={() => { setCallbackUrl(''); setExpanded(false) }}>{t('cancel')}</button>
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
    {loginUrl === undefined ? null : <p style={{ ...bodyStyle, marginTop: 8 }}>{t('authorizationHelp')}</p>}
    {loginUrl !== undefined || snapshot.operation.kind === 'waiting-authorization' && !snapshot.busy ? (
      <div style={{ ...buttonsStyle, marginTop: 8 }}>
        {loginUrl === undefined ? null : <a
          href={loginUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="cc-btn"
          style={{ ...primaryButtonStyle, textDecoration: 'none' }}
        >
          {t('openLoginInBrowser')}
        </a>}
        {snapshot.operation.kind === 'waiting-authorization' && !snapshot.busy
          ? <ManualCallbackForm key={snapshot.authorizationRevision ?? 0} t={t} store={store} /> : null}
      </div>
    ) : null}
    {snapshot.callbackFeedback === undefined ? null : <p role="status"
      style={{ ...(snapshot.callbackFeedback === 'callbackAccepted' || snapshot.callbackFeedback === 'callbackUnconfirmed' ? bodyStyle : errorStyle), marginTop: 8 }}>
      {t(snapshot.callbackFeedback)}
    </p>}
    {status.status === 'error' || status.status === 'reauth-required'
      ? <p style={{ ...errorStyle, marginTop: 8 }}>{status.message}</p>
      : null}
    {operationError === undefined ? null : <p style={{ ...errorStyle, marginTop: 8 }}>{operationError}</p>}
    {status.status === 'remote-web-origin-not-trusted' ? (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
        <p style={errorStyle}>{t(desktop ? 'desktopOriginDescription' : 'remoteOriginDescription')}</p>
        <p style={bodyStyle}>{t(desktop ? 'desktopOriginDiagnosticsHelp' : 'remoteOriginCommandHelp')}</p>
        {trustedOriginCommand === undefined ? null : <>
          <code style={commandStyle}>{trustedOriginCommand}</code>
          <div style={buttonsStyle}>
            <button type="button" className="cc-btn" onClick={() => { void copyTrustedOriginCommand() }}>
              {copied ? t('remoteOriginCopied') : t('remoteOriginCopy')}
            </button>
            {copyFailed ? <span style={errorStyle}>{t('remoteOriginCopyFailed')}</span> : null}
          </div>
        </>}
      </div>
    ) : null}
  </>
}
