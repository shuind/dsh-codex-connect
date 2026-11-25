/** One-line show-once overlay and compact header version/update bar for Codex Connect. */

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
  border: '0.5px solid var(--dsw-alias-border-l2)',
  borderRadius: 8,
  background: 'var(--dsw-alias-bg-module-platform)',
  color: 'var(--dsw-alias-label-primary)',
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.14)',
  fontSize: 12,
  lineHeight: '18px',
  whiteSpace: 'nowrap',
  boxSizing: 'border-box',
}
const overlayTextStyle: CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis' }
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

const inlineBarStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  paddingBottom: 7,
  fontSize: 12,
  lineHeight: '18px',
  color: 'var(--dsw-alias-label-secondary)',
  flexWrap: 'wrap',
}
const inlineButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 24,
  padding: '2px 8px',
  border: '0.5px solid var(--dsw-alias-border-l2)',
  borderRadius: 6,
  background: 'transparent',
  color: 'var(--dsw-alias-label-secondary)',
  font: 'inherit',
  fontSize: 11.5,
  lineHeight: '16px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}
const inlineLinkStyle: CSSProperties = {
  color: 'var(--dsw-alias-brand-primary)',
  fontSize: 12,
  lineHeight: '18px',
  textDecoration: 'underline',
  textUnderlineOffset: 2,
}

function pluginVersionSummary(current: string, latest: string | undefined, t: OpenAICodexUpdateTranslation): string {
  if (latest === undefined) return t('currentVersion', { version: current })
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

/** Compact single-row version summary & manual update trigger inside settings header. */
export function OpenAICodexUpdateSettings({ updater, t }: OpenAICodexUpdateSettingsProps) {
  const snapshot = useSyncExternalStore(updater.subscribe, updater.getSnapshot, updater.getSnapshot)
  const latestVersion = snapshot.latestVersion
  const available = snapshot.status === 'update-available'

  return (
    <div style={inlineBarStyle} role="region" aria-label={t('updateHeading')}>
      <span>{pluginVersionSummary(snapshot.currentVersion, latestVersion, t)}</span>
      {available && snapshot.releaseUrl !== undefined ? (
        <a href={snapshot.releaseUrl} target="_blank" rel="noopener noreferrer" style={inlineLinkStyle}>
          {t('openReleasePage')}
        </a>
      ) : null}
      <button
        type="button"
        style={inlineButtonStyle}
        disabled={snapshot.status === 'checking'}
        onClick={() => { void updater.refresh(true) }}
      >
        {snapshot.status === 'checking' ? t('checkingForUpdates') : t('checkForUpdates')}
      </button>
    </div>
  )
}

export type OpenAICodexUpdateTranslation = (key: OpenAICodexSettingsKey, params?: Record<string, unknown>) => string
