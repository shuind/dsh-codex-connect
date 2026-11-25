/** Grouped settings cards: speed & reasoning, web search, context & images, and proxy. */

import type { OpenAICodexSettingsConfig } from '../../shared/settings.ts'
import { OPENAI_CODEX_REASONING_EFFORTS, parseOpenAICodexReasoningEffort } from '../../shared/models.ts'
import type { OpenAICodexTranslate } from './AccountSection.tsx'
import { ProxyCard } from './NetworkSection.tsx'
import type { ProxyToolsState } from './NetworkSection.tsx'
import {
  badgeStyle,
  bodyStyle,
  fieldsetStyle,
  formFieldStyle,
  formGridStyle,
  labelStyle,
  subPanelStyle,
} from './styles.ts'

export interface CapabilitiesSectionProps {
  panelPrefix: string
  visible: boolean
  draft: OpenAICodexSettingsConfig
  savedNativeCompaction: boolean | undefined
  validModel: boolean
  validTokens: boolean
  validImageModelHint: boolean
  proxy: ProxyToolsState
  t: OpenAICodexTranslate
  onUpdate: <Key extends keyof OpenAICodexSettingsConfig>(
    field: Key,
    value: OpenAICodexSettingsConfig[Key],
  ) => void
  onToggleFastDefault: (target: 'session' | 'subagent', enabled: boolean) => void
}

export function CapabilitiesSection({
  panelPrefix,
  visible,
  draft,
  savedNativeCompaction,
  validModel,
  validTokens,
  validImageModelHint,
  proxy,
  t,
  onUpdate,
  onToggleFastDefault,
}: CapabilitiesSectionProps) {
  const sessionFast = (draft.newSessionSpeedMode ?? (draft.enableNewSessionFastMode ? 'fast' : 'standard')) === 'fast'
  const subagentFast = (draft.newSubagentSpeedMode ?? (draft.enableNewSubagentFastMode ? 'fast' : 'standard')) === 'fast'

  return (
    <div
      id={`${panelPrefix}-capabilities`}
      role="tabpanel"
      aria-labelledby={`${panelPrefix}-capabilities-tab`}
      hidden={!visible}
      style={{ ...fieldsetStyle, display: visible ? fieldsetStyle.display : 'none' }}
    >
      <div className="cc-card" role="group" aria-label={t('speedAndReasoningHeading')}>
        <h3 className="cc-card-title">{t('speedAndReasoningHeading')}</h3>
        <div className="cc-row">
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <label htmlFor={`${panelPrefix}-reasoning`} style={labelStyle}>{t('reasoningEffort')}</label>
            <span style={bodyStyle}>{t('reasoningEffortHelp')}</span>
          </span>
          <select
            id={`${panelPrefix}-reasoning`}
            className="cc-input"
            style={{ width: 150, flexShrink: 0 }}
            value={draft.reasoningEffort ?? ''}
            onChange={event => { onUpdate('reasoningEffort', parseOpenAICodexReasoningEffort(event.currentTarget.value || undefined) ?? undefined) }}
          >
            <option value="">{t('reasoningProviderDefault')}</option>
            {OPENAI_CODEX_REASONING_EFFORTS.map(effort => <option key={effort} value={effort}>{effort}</option>)}
          </select>
        </div>
        <label className="cc-row" style={{ cursor: 'pointer' }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={labelStyle}>{t('enableNewSessionFastMode')}</span>
            <span style={bodyStyle}>{t('enableNewSessionFastModeHelp')}</span>
          </span>
          <input
            type="checkbox"
            className="cc-switch"
            checked={sessionFast}
            onChange={event => { onToggleFastDefault('session', event.currentTarget.checked) }}
          />
        </label>
        <label className="cc-row" style={{ cursor: 'pointer' }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={labelStyle}>{t('enableNewSubagentFastMode')}</span>
            <span style={bodyStyle}>{t('enableNewSubagentFastModeHelp')}</span>
          </span>
          <input
            type="checkbox"
            className="cc-switch"
            checked={subagentFast}
            onChange={event => { onToggleFastDefault('subagent', event.currentTarget.checked) }}
          />
        </label>
      </div>

      <div className="cc-card" role="group" aria-label={t('searchHeading')}>
        <h3 className="cc-card-title">{t('searchHeading')}</h3>
        <label className="cc-row" style={{ cursor: 'pointer', borderBottom: 0, paddingBottom: 0 }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={labelStyle}>{t('enableSearch')}</span>
            <span style={bodyStyle}>{t('enableSearchHelp')}</span>
          </span>
          <input
            type="checkbox"
            className="cc-switch"
            checked={draft.enableSearch}
            onChange={event => { onUpdate('enableSearch', event.currentTarget.checked) }}
          />
        </label>
        {draft.enableSearch ? (
          <div style={subPanelStyle}>
            <div style={formGridStyle}>
              <label style={formFieldStyle}>
                <span style={labelStyle}>{t('searchModel')}</span>
                <input
                  className="cc-input"
                  value={draft.searchModel}
                  aria-invalid={!validModel}
                  onChange={event => { onUpdate('searchModel', event.currentTarget.value) }}
                />
              </label>
              <label style={formFieldStyle}>
                <span style={labelStyle}>{t('searchMode')}</span>
                <select
                  className="cc-input"
                  value={draft.searchMode}
                  onChange={event => { onUpdate('searchMode', event.currentTarget.value as OpenAICodexSettingsConfig['searchMode']) }}
                >
                  <option value="cached">{t('modeCached')}</option>
                  <option value="indexed">{t('modeIndexed')}</option>
                  <option value="live">{t('modeLive')}</option>
                </select>
              </label>
              <label style={formFieldStyle}>
                <span style={labelStyle}>{t('searchContextSize')}</span>
                <select
                  className="cc-input"
                  value={draft.searchContextSize}
                  onChange={event => { onUpdate('searchContextSize', event.currentTarget.value as OpenAICodexSettingsConfig['searchContextSize']) }}
                >
                  <option value="low">{t('contextLow')}</option>
                  <option value="medium">{t('contextMedium')}</option>
                  <option value="high">{t('contextHigh')}</option>
                </select>
              </label>
              <label style={formFieldStyle}>
                <span style={labelStyle}>{t('searchMaxOutputTokens')}</span>
                <input
                  className="cc-input"
                  type="number"
                  min={1}
                  step={1}
                  value={draft.searchMaxOutputTokens}
                  aria-invalid={!validTokens}
                  onChange={event => { onUpdate('searchMaxOutputTokens', event.currentTarget.valueAsNumber) }}
                />
              </label>
            </div>
          </div>
        ) : null}
      </div>

      <div className="cc-card" role="group" aria-label={t('contextAndImagesHeading')}>
        <h3 className="cc-card-title">{t('contextAndImagesHeading')}</h3>
        <div role="group" aria-labelledby={`${panelPrefix}-native-context-label`} style={{ padding: '2px 0 10px', borderBottom: '0.5px solid var(--dsw-alias-border-l1, var(--dsw-alias-border-l2))' }}>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, cursor: 'pointer' }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <span id={`${panelPrefix}-native-context-label`} style={labelStyle}>{t('enableNativeCompaction')}</span>
                <span style={badgeStyle}>{t('nativeCompactionBadge')}</span>
              </span>
              <span id={`${panelPrefix}-native-context-help`} style={bodyStyle}>{t('enableNativeCompactionHelp')}</span>
            </span>
            <input
              type="checkbox"
              className="cc-switch"
              aria-labelledby={`${panelPrefix}-native-context-label`}
              aria-describedby={`${panelPrefix}-native-context-help`}
              checked={draft.enableNativeCompaction}
              onChange={event => { onUpdate('enableNativeCompaction', event.currentTarget.checked) }}
            />
          </label>
          <details style={{ marginTop: 6 }}>
            <summary style={{ ...bodyStyle, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>{t('nativeCompactionDetails')}</summary>
            <div style={{ ...subPanelStyle, marginTop: 6, gap: 5 }}>
              {savedNativeCompaction !== undefined ? (
                <p style={bodyStyle} role="status">
                  {t(savedNativeCompaction ? 'nativeCompactionSavedOn' : 'nativeCompactionSavedOff')}
                  {draft.enableNativeCompaction !== savedNativeCompaction
                    ? <span style={{ marginLeft: 8 }}>{t('nativeCompactionPending')}</span> : null}
                </p>
              ) : null}
              <p style={bodyStyle}>{t('nativeCompactionConsent')}</p>
              <p style={bodyStyle}>{t('nativeCompactionRisk')}</p>
              <p style={bodyStyle}>{t('nativeCompactionHostPolicy')}</p>
              <p style={bodyStyle}>{t('nativeCompactionDisableHelp')}</p>
            </div>
          </details>
        </div>

        <div style={{ paddingTop: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, cursor: 'pointer' }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span style={labelStyle}>{t('enableImageGeneration')}</span>
              <span style={bodyStyle}>{t('enableImageGenerationHelp')}</span>
            </span>
            <input
              type="checkbox"
              className="cc-switch"
              checked={draft.enableImageGeneration}
              onChange={event => { onUpdate('enableImageGeneration', event.currentTarget.checked) }}
            />
          </label>
          {draft.enableImageGeneration ? (
            <div style={subPanelStyle}>
              <label style={formFieldStyle}>
                <span style={labelStyle}>{t('imageModelHint')}</span>
                <input
                  className="cc-input"
                  value={draft.imageModelHint}
                  placeholder={t('imageModelHintDefault')}
                  aria-invalid={!validImageModelHint}
                  onChange={event => { onUpdate('imageModelHint', event.currentTarget.value) }}
                />
                <span style={bodyStyle}>{t('imageModelHintHelp')}</span>
              </label>
            </div>
          ) : null}
        </div>
      </div>

      <ProxyCard draft={draft} proxy={proxy} t={t} onUpdate={onUpdate} />
    </div>
  )
}
