/** Plugin-owned OpenAI Codex settings shell aligned with DSH & dsh-codex-harness. */

import { useCallback, useId, useState, useSyncExternalStore } from 'react'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { OpenAICodexSettingsConfig } from '../../shared/settings.ts'
import { OpenAICodexAccountStore } from '../shared/account-store.ts'
import type { OpenAICodexUpdateStore } from '../shared/update-store.ts'
import { OpenAICodexUpdateSettings } from '../notices/OpenAICodexUpdateNotice.tsx'
import { OpenAICodexConfiguration } from './OpenAICodexConfiguration.tsx'
import type { OpenAICodexSettingsModule } from './OpenAICodexConfiguration.tsx'
import {
  AccountActions,
  AccountFeedback,
  AccountManager,
  accountStatusLabel,
  dotStyle,
  formatOpenAICodexResetAt,
  UsageLimits,
} from './AccountSection.tsx'
import type { OpenAICodexTranslate } from './AccountSection.tsx'
import { bodyStyle, CODEX_CONNECT_SETTINGS_CSS, rowStyle, stackStyle } from './styles.ts'

export {
  AccountActions,
  AccountFeedback,
  AccountManager,
  accountStatusLabel,
  dotStyle,
  formatOpenAICodexResetAt,
  UsageLimits,
}

/** Dependencies injected by the browser plugin entry. */
export interface OpenAICodexSettingsInjected {
  /** Localized page copy. */
  t: OpenAICodexTranslate
  /** Host-owned optional capability settings. */
  configScope: ConfigForm<OpenAICodexSettingsConfig>
  /** Shared browser update state used by the global overlay and this card. */
  updater?: OpenAICodexUpdateStore
  /** Shared across Models and Plugin settings by the browser-plugin owner. */
  account?: OpenAICodexAccountStore
}

/** Props delivered by the settings slot renderer. */
export type OpenAICodexSettingsProps = Partial<OpenAICodexSettingsInjected> & {
  /** Omit the page heading and outer card chrome inside Plugin configuration. */
  embedded?: boolean
  /** Models exposes account controls only; advanced options remain under Plugins. */
  accountOnly?: boolean
}

const SETTINGS_MODULES = ['account', 'models', 'capabilities'] as const satisfies readonly OpenAICodexSettingsModule[]
const UNAVAILABLE_CONFIG_SNAPSHOT = {
  status: 'unavailable' as const,
  value: undefined,
  base: undefined,
  user: undefined,
  revision: undefined,
  writable: false,
  mode: 'memory' as const,
}

/** OpenAI Codex account status, OAuth actions, and tabbed settings modules. */
export function OpenAICodexSettings({ t, configScope, updater, account, embedded = false, accountOnly = false }: OpenAICodexSettingsProps) {
  if (t === undefined) throw new Error('OpenAI Codex settings requires its translation function')
  const [localAccount] = useState(() => new OpenAICodexAccountStore())
  const store = account ?? localAccount
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const subscribeConfig = useCallback((listener: () => void) => configScope?.subscribe(listener) ?? (() => undefined), [configScope])
  const getConfigSnapshot = useCallback(() => configScope?.getSnapshot() ?? UNAVAILABLE_CONFIG_SNAPSHOT, [configScope])
  const configSnapshot = useSyncExternalStore(subscribeConfig, getConfigSnapshot, getConfigSnapshot)
  const { status } = snapshot
  const titleId = useId()
  const [activeModule, setActiveModule] = useState<OpenAICodexSettingsModule>('account')
  const panelIdPrefix = `${titleId}-module`

  const label = accountStatusLabel(status.status, t)
  const config = configSnapshot.value
  const enabledCapabilities = config === undefined ? 0 : [
    config.enableSearch,
    config.enableNativeCompaction,
    config.enableImageGeneration,
  ].filter(Boolean).length

  const tabBadge = (module: OpenAICodexSettingsModule): string | undefined => {
    if (module === 'account') return snapshot.accounts.length > 1 ? String(snapshot.accounts.length) : undefined
    if (module === 'models') return config?.models === undefined ? undefined : String(config.models.length)
    return enabledCapabilities > 0 ? String(enabledCapabilities) : undefined
  }

  return (
    <section
      className="cc-root"
      {...embedded ? { 'aria-label': t('title') } : { 'aria-labelledby': titleId }}
    >
      <style>{CODEX_CONNECT_SETTINGS_CSS}</style>
      {embedded ? null : (
        <div style={{ marginBottom: 14 }}>
          <h2 id={titleId} style={{ margin: 0, fontSize: 18, lineHeight: '24px', fontWeight: 600 }}>{t('title')}</h2>
          <p style={{ ...bodyStyle, marginTop: 4 }}>{t('intro')}</p>
        </div>
      )}
      {accountOnly ? null : (
        <div className="cc-header">
          <div className="cc-tabs" role="tablist" aria-label={t('settingsModules')}>
            {SETTINGS_MODULES.map((module, index) => {
              const badge = tabBadge(module)
              return (
                <button
                  key={module}
                  id={`${panelIdPrefix}-${module}-tab`}
                  type="button"
                  role="tab"
                  className="cc-tab"
                  aria-label={t(`${module}Module`)}
                  aria-selected={activeModule === module}
                  aria-controls={`${panelIdPrefix}-${module}`}
                  tabIndex={activeModule === module ? 0 : -1}
                  onClick={() => { setActiveModule(module) }}
                  onKeyDown={event => {
                    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
                    event.preventDefault()
                    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? SETTINGS_MODULES.length - 1
                      : (index + (event.key === 'ArrowRight' ? 1 : -1) + SETTINGS_MODULES.length) % SETTINGS_MODULES.length
                    const next = SETTINGS_MODULES[nextIndex]!
                    setActiveModule(next)
                    document.getElementById(`${panelIdPrefix}-${next}-tab`)?.focus()
                  }}
                >
                  <span>{t(`${module}Module`)}</span>
                  {badge === undefined ? null : <span className="cc-tab-badge">{badge}</span>}
                </button>
              )
            })}
          </div>
          {updater === undefined ? null : <OpenAICodexUpdateSettings t={t} updater={updater} />}
        </div>
      )}
      <div
        id={`${panelIdPrefix}-account`}
        role={accountOnly ? undefined : 'tabpanel'}
        aria-labelledby={accountOnly ? undefined : `${panelIdPrefix}-account-tab`}
        hidden={!accountOnly && activeModule !== 'account'}
        style={{ ...stackStyle, display: accountOnly || activeModule === 'account' ? 'flex' : 'none' }}
      >
        <div className="cc-card">
          <h3 className="cc-card-title">{t('accountHeading')}</h3>
          {snapshot.accounts.length === 0 ? (
            <div style={rowStyle}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500 }} role="status">
                <span aria-hidden="true" style={dotStyle(status.status)} />
                <span>{label}</span>
              </div>
              <AccountManager t={t} store={store} snapshot={snapshot} />
            </div>
          ) : (
            <AccountManager t={t} store={store} snapshot={snapshot} />
          )}
          <AccountFeedback t={t} snapshot={snapshot} store={store} />
          {accountOnly ? <p style={{ ...bodyStyle, marginTop: 10 }}>{t('modelsAccountHelp')}</p> : null}
        </div>
        {status.status === 'signed-in' ? (
          <div className="cc-card">
            <UsageLimits
              usage={status.usage}
              {...status.quotaError === undefined ? {} : { quotaError: status.quotaError }}
              t={t}
            />
          </div>
        ) : null}
      </div>
      {accountOnly ? null : (
        <OpenAICodexConfiguration
          t={t}
          activeModule={activeModule}
          panelIdPrefix={panelIdPrefix}
          {...configScope === undefined ? {} : { scope: configScope }}
        />
      )}
    </section>
  )
}
