/** Plugin-owned OpenAI Codex settings shell with tabbed modules. */

import { useCallback, useId, useState, useSyncExternalStore } from 'react'
import type { CSSProperties } from 'react'
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
import { accountBodyStyle, accountButtonStyle, quotaTitleStyle, rowStyle } from './styles.ts'

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

const pageStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 720 }
const titleStyle: CSSProperties = { margin: 0, fontSize: 20, lineHeight: '28px', fontWeight: 600, color: 'var(--dsw-alias-label-primary)' }
const cardStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 14, padding: '18px 20px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 12, background: 'var(--dsw-alias-bg-module-platform)' }
const embeddedPageStyle: CSSProperties = { ...pageStyle, gap: 0, maxWidth: 'none' }
const embeddedCardStyle: CSSProperties = { ...cardStyle, padding: 0, border: 0, borderRadius: 0, background: 'transparent' }
const statusStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 9, fontSize: 15, fontWeight: 500, color: 'var(--dsw-alias-label-primary)' }
const moduleTabsStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, paddingTop: 2 }
const moduleTabStyle: CSSProperties = { ...accountButtonStyle, minWidth: 0, minHeight: 54, borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 2, overflowWrap: 'anywhere' }
const activeModuleTabStyle: CSSProperties = { ...moduleTabStyle, border: '1px solid var(--dsw-alias-button-primary-fill)', background: 'var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1))' }
const moduleSummaryStyle: CSSProperties = { fontSize: 11, lineHeight: '16px', fontWeight: 400, color: 'var(--dsw-alias-label-secondary)' }

const SETTINGS_MODULES = ['account', 'models', 'network', 'capabilities'] as const satisfies readonly OpenAICodexSettingsModule[]
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
  const moduleSummary = (module: OpenAICodexSettingsModule): string => {
    if (module === 'account') return t('accountModuleSummary', { status: label })
    const config = configSnapshot.value
    if (module === 'models') return config?.models === undefined
      ? t('modelsModuleDefault')
      : t('modelsModuleSelected', { count: config.models.length })
    if (module === 'network') return t(config?.enableProxy === true ? 'networkModuleProxy' : 'networkModuleDirect')
    const count = config === undefined ? 0 : [
      config.enableSearch,
      (config.newSessionSpeedMode ?? (config.enableNewSessionFastMode ? 'fast' : 'standard')) !== 'standard',
      (config.newSubagentSpeedMode ?? (config.enableNewSubagentFastMode ? 'fast' : 'standard')) !== 'standard',
      config.enableNativeCompaction,
      config.enableImageTool,
      config.enableImageGeneration,
    ].filter(Boolean).length
    return t('capabilitiesModuleEnabled', { count })
  }

  return (
    <section
      style={embedded ? embeddedPageStyle : pageStyle}
      {...embedded ? { 'aria-label': t('title') } : { 'aria-labelledby': titleId }}
    >
      {embedded ? null : (
        <div>
          <h2 id={titleId} style={titleStyle}>{t('title')}</h2>
          <p style={{ ...accountBodyStyle, marginTop: 6 }}>{t('intro')}</p>
        </div>
      )}
      <div style={embedded ? embeddedCardStyle : cardStyle}>
        {accountOnly || updater === undefined ? null : <OpenAICodexUpdateSettings t={t} updater={updater} />}
        {accountOnly ? null : (
          <div style={moduleTabsStyle} role="tablist" aria-label={t('settingsModules')}>
            {SETTINGS_MODULES.map((module, index) => (
              <button
                key={module}
                id={`${panelIdPrefix}-${module}-tab`}
                type="button"
                role="tab"
                aria-label={t(`${module}Module`)}
                aria-selected={activeModule === module}
                aria-controls={`${panelIdPrefix}-${module}`}
                tabIndex={activeModule === module ? 0 : -1}
                style={activeModule === module ? activeModuleTabStyle : moduleTabStyle}
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
                <span style={moduleSummaryStyle}>{moduleSummary(module)}</span>
              </button>
            ))}
          </div>
        )}
        <div
          id={`${panelIdPrefix}-account`}
          role={accountOnly ? undefined : 'tabpanel'}
          aria-labelledby={accountOnly ? undefined : `${panelIdPrefix}-account-tab`}
          hidden={!accountOnly && activeModule !== 'account'}
          style={{ display: accountOnly || activeModule === 'account' ? 'flex' : 'none', flexDirection: 'column', gap: 14 }}
        >
          <h3 style={quotaTitleStyle}>{t('accountHeading')}</h3>
          <div style={rowStyle}>
            <div style={statusStyle} role="status">
              <span aria-hidden="true" style={dotStyle(status.status)} />
              <span>{label}</span>
            </div>
          </div>
          <AccountManager t={t} store={store} snapshot={snapshot} />
          <AccountFeedback t={t} snapshot={snapshot} store={store} />
          {status.status === 'signed-in'
            ? <UsageLimits
                usage={status.usage}
                {...status.quotaError === undefined ? {} : { quotaError: status.quotaError }}
                t={t}
              />
            : null}
          {accountOnly ? <p style={accountBodyStyle}>{t('modelsAccountHelp')}</p> : null}
        </div>
        {accountOnly ? null : (
          <OpenAICodexConfiguration
            t={t}
            activeModule={activeModule}
            panelIdPrefix={panelIdPrefix}
            {...configScope === undefined ? {} : { scope: configScope }}
          />
        )}
      </div>
    </section>
  )
}
