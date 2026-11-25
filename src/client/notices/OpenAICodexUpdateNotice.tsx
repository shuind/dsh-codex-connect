/** One-line show-once overlay and concise settings-page update status for Codex Connect. */

import { useEffect, useSyncExternalStore } from 'react'
import type { CSSProperties } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { OpenAICodexSettingsKey } from '../locales/index.ts'
import { OpenAICodexUpdateStore } from '../shared/update-store.ts'

export interface OpenAICodexUpdateNoticeInjected {
  updater: OpenAICodexUpdateStore
}

export type OpenAICodexUpdateOverlayProps =
  PropsRuntime<'shell.overlay'>
  & { t: OpenAICodexUpdateTranslation }
  & OpenAICodexUpdateNoticeInjected

export type OpenAICodexUpdateSettingsProps =
  { t: OpenAICodexUpdateTranslation }
  & OpenAICodexUpdateNoticeInjected

const overlayBarStyle: CSSProperties = {
  position: 'absolute',
  top: 14,
  right: 18,
  zIndex: 30,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  maxWidth: 'calc(100vw - 36px)',
  padding: '6px 10px 6px 12px',
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 8,
  background: 'var(--dsw-alias-bg-module-platform)',
  color: 'var(--dsw-alias-label-primary)',
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.14)',
  fontSize: 12,
  lineHeight: '18px',
  whiteSpace: 'nowrap',
  boxSizing: 'border-box',
}
const overlayTextStyle: CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}
const overlayLinkStyle: CSSProperties = {
  color: 'var(--dsw-alias-brand-primary)',
  textDecoration: 'underline',
  textUnderlineOffset: 2,
  flexShrink: 0,
}
const overlayCloseStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 20,
  height: 20,
  padding: 0,
  border: 0,
  borderRadius: 4,
  background: 'transparent',
  color: 'var(--dsw-alias-label-secondary)',
  font: 'inherit',
  fontSize: 14,
  lineHeight: 1,
  cursor: 'pointer',
  flexShrink: 0,
}

const panelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: '13px 15px',
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 12,
  background: 'var(--dsw-alias-bg-module-platform)',
  color: 'var(--dsw-alias-label-primary)',
}
const rowStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }
const titleStyle: CSSProperties = { margin: 0, fontSize: 14, lineHeight: '20px', fontWeight: 600 }
const bodyStyle: CSSProperties = { margin: 0, color: 'var(--dsw-alias-label-secondary)', fontSize: 13, lineHeight: '20px' }
const buttonStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', minHeight: 32, padding: '4px 11px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 7, background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', font: 'inherit', fontSize: 12, lineHeight: '20px', whiteSpace: 'nowrap', cursor: 'pointer' }
const linkStyle: CSSProperties = { color: 'var(--dsw-alias-brand-primary)', fontSize: 12, lineHeight: '20px', textDecoration: 'underline', textUnderlineOffset: 2 }

function pluginVersionSummary(current: string, latest: string | undefined, t: OpenAICodexUpdateTranslation): string {
  if (latest === undefined) return t('compatibilityPluginCurrentOnly', { current })
  return current === latest
    ? t('compatibilityPluginSame', { version: current })
    : t('compatibilityPluginDifferent', { current, latest })
}

/** Compact one-line update reminder shown at most once per newer version. */
export function OpenAICodexUpdateOverlay({ updater, t }: OpenAICodexUpdateOverlayProps) {
  const snapshot = useSyncExternalStore(updater.subscribe, updater.getSnapshot, updater.getSnapshot)
  const latestVersion = snapshot.latestVersion
  const noticeKey = latestVersion === undefined ? undefined : `${snapshot.currentVersion}:${latestVersion}`
  const visible = snapshot.status === 'update-available'
    && noticeKey !== undefined
    && snapshot.dismissedNotice !== noticeKey

  useEffect(() => {
    if (visible && noticeKey !== undefined) updater.markShown(noticeKey)
  }, [visible, noticeKey, updater])

  if (!visible || noticeKey === undefined || latestVersion === undefined) return null

  return (
    <div style={overlayBarStyle} role="status" aria-label={t('updateHeading')}>
      <span style={overlayTextStyle}>{t('updateOneLineNotice', { version: latestVersion })}</span>
      {snapshot.releaseUrl === undefined ? null : (
        <a href={snapshot.releaseUrl} target="_blank" rel="noopener noreferrer" style={overlayLinkStyle}>
          {t('openReleasePage')}
        </a>
      )}
      <button
        type="button"
        style={overlayCloseStyle}
        aria-label={t('dismissUpdate')}
        title={t('dismissUpdate')}
        onClick={() => { updater.dismiss(noticeKey) }}
      >
        ×
      </button>
    </div>
  )
}

/** Settings-page update status and manual check control. */
export function OpenAICodexUpdateSettings({ updater, t }: OpenAICodexUpdateSettingsProps) {
  const snapshot = useSyncExternalStore(updater.subscribe, updater.getSnapshot, updater.getSnapshot)
  const latestVersion = snapshot.latestVersion
  const available = snapshot.status === 'update-available'

  return (
    <div style={panelStyle} role="region" aria-label={t('updateHeading')}>
      <div style={rowStyle}>
        <strong style={titleStyle}>{available ? t('newVersionAvailable', { version: latestVersion }) : t('updateHeading')}</strong>
        <button
          type="button"
          style={buttonStyle}
          disabled={snapshot.status === 'checking'}
          onClick={() => { void updater.refresh(true) }}
        >
          {snapshot.status === 'checking' ? t('checkingForUpdates') : t('checkForUpdates')}
        </button>
      </div>
      <p style={bodyStyle}>{pluginVersionSummary(snapshot.currentVersion, latestVersion, t)}</p>
      {snapshot.status === 'checking' ? <p style={bodyStyle}>{t('checkingForUpdates')}</p> : null}
      {snapshot.status === 'unavailable' ? <p style={bodyStyle}>{t('updateCheckUnavailable')}</p> : null}
      {available && snapshot.releaseUrl !== undefined ? (
        <div>
          <a href={snapshot.releaseUrl} target="_blank" rel="noopener noreferrer" style={linkStyle}>
            {t('openReleasePage')}
          </a>
        </div>
      ) : null}
      {snapshot.checkedAt === undefined ? null : (
        <p style={bodyStyle}>{t('updateLastChecked', { time: new Date(snapshot.checkedAt).toLocaleString() })}</p>
      )}
    </div>
  )
}

export type OpenAICodexUpdateTranslation = (key: OpenAICodexSettingsKey, params?: Record<string, unknown>) => string
