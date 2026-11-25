/** Grouped settings cards: web search (with accuracy reference) and context & images. */

import type { OpenAICodexSettingsConfig } from '../../shared/settings.ts'
import type { OpenAICodexTranslate } from './AccountSection.tsx'
import {
  bodyStyle,
  fieldsetStyle,
  formFieldStyle,
  formGridStyle,
  labelStyle,
  monoStyle,
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
  t: OpenAICodexTranslate
  onUpdate: <Key extends keyof OpenAICodexSettingsConfig>(
    field: Key,
    value: OpenAICodexSettingsConfig[Key],
  ) => void
}

const BROWSECOMP_ENTRIES = [
  { modelId: 'gpt-6.2-sol', label: 'GPT-6.2', score: '64.5%' },
  { modelId: 'gpt-6-sol', label: 'GPT-6', score: '54.4%' },
] as const

const FACTS_SEARCH_V2_ENTRIES = [
  { modelId: 'gpt-6-astra', label: 'GPT-6 Astra', score: '93.3%', date: '2026-11-05' },
  { modelId: 'gpt-5.6-sol', label: 'GPT-5.6 Sol', score: '92.9%', date: '2026-11-11' },
  { modelId: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', score: '92.8%', date: '2026-11-05' },
  { modelId: 'gpt-6.1-terra', label: 'GPT-6.1 Terra', score: '92.7%', date: '2026-11-06' },
] as const

const KAGGLE_FACTS_URL = 'https://www.kaggle.com/benchmarks/google/facts'

export function CapabilitiesSection({
  panelPrefix,
  visible,
  draft,
  savedNativeCompaction,
  validModel,
  validTokens,
  validImageModelHint,
  t,
  onUpdate,
}: CapabilitiesSectionProps) {
  const activeSearchModel = draft.searchModel.trim()

  return (
    <div
      id={`${panelPrefix}-capabilities`}
      role="tabpanel"
      aria-labelledby={`${panelPrefix}-capabilities-tab`}
      hidden={!visible}
      style={{ ...fieldsetStyle, display: visible ? fieldsetStyle.display : 'none' }}
    >
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

        <details style={{ marginTop: 10, paddingTop: 10, borderTop: '0.5px solid var(--dsw-alias-border-l1, var(--dsw-alias-border-l2))' }}>
          <summary style={{ ...bodyStyle, cursor: 'pointer', fontWeight: 500, color: 'var(--dsw-alias-label-primary)' }}>
            {t('searchLeaderboardSummary')}
          </summary>
          <div style={{ ...subPanelStyle, marginTop: 8, gap: 12 }}>
            <div>
              <div style={{ ...labelStyle, fontSize: 12, marginBottom: 2 }}>{t('searchLeaderboardBrowseCompTitle')}</div>
              <p style={{ ...bodyStyle, marginBottom: 6 }}>{t('searchLeaderboardBrowseCompNote')}</p>
              <table className="cc-table">
                <thead>
                  <tr>
                    <th>{t('searchLeaderboardModelCol')}</th>
                    <th style={{ textAlign: 'right' }}>{t('searchLeaderboardScoreCol')}</th>
                    {draft.enableSearch ? <th /> : null}
                  </tr>
                </thead>
                <tbody>
                  {BROWSECOMP_ENTRIES.map(entry => {
                    const selected = activeSearchModel === entry.modelId
                    return (
                      <tr key={entry.modelId}>
                        <td>
                          <span style={{ fontWeight: 500 }}>{entry.label}</span>
                          <span style={{ ...monoStyle, marginLeft: 6 }}>{entry.modelId}</span>
                        </td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{entry.score}</td>
                        {draft.enableSearch ? (
                          <td style={{ textAlign: 'right', width: 1 }}>
                            <button
                              type="button"
                              className="cc-btn cc-btn-ghost"
                              disabled={selected}
                              onClick={() => { onUpdate('searchModel', entry.modelId) }}
                            >
                              {selected ? t('searchLeaderboardSelectedModel') : t('searchLeaderboardUseModel')}
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                <span style={{ ...labelStyle, fontSize: 12 }}>{t('searchLeaderboardFactsTitle')}</span>
                <a
                  href={KAGGLE_FACTS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ ...bodyStyle, textDecoration: 'underline', textUnderlineOffset: 3 }}
                >
                  {t('searchLeaderboardOpenKaggle')}
                </a>
              </div>
              <p style={{ ...bodyStyle, marginBottom: 6 }}>{t('searchLeaderboardFactsNote')}</p>
              <table className="cc-table">
                <thead>
                  <tr>
                    <th>{t('searchLeaderboardModelCol')}</th>
                    <th style={{ textAlign: 'right' }}>{t('searchLeaderboardDateCol')}</th>
                    <th style={{ textAlign: 'right' }}>{t('searchLeaderboardScoreCol')}</th>
                    {draft.enableSearch ? <th /> : null}
                  </tr>
                </thead>
                <tbody>
                  {FACTS_SEARCH_V2_ENTRIES.map(entry => {
                    const selected = activeSearchModel === entry.modelId
                    return (
                      <tr key={entry.modelId}>
                        <td>
                          <span style={{ fontWeight: 500 }}>{entry.label}</span>
                          <span style={{ ...monoStyle, marginLeft: 6 }}>{entry.modelId}</span>
                        </td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--dsw-alias-label-secondary)' }}>{entry.date}</td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{entry.score}</td>
                        {draft.enableSearch ? (
                          <td style={{ textAlign: 'right', width: 1 }}>
                            <button
                              type="button"
                              className="cc-btn cc-btn-ghost"
                              disabled={selected}
                              onClick={() => { onUpdate('searchModel', entry.modelId) }}
                            >
                              {selected ? t('searchLeaderboardSelectedModel') : t('searchLeaderboardUseModel')}
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </details>
      </div>

      <div className="cc-card" role="group" aria-label={t('contextAndImagesHeading')}>
        <h3 className="cc-card-title">{t('contextAndImagesHeading')}</h3>
        <div role="group" aria-labelledby={`${panelPrefix}-native-context-label`} style={{ padding: '2px 0 10px', borderBottom: '0.5px solid var(--dsw-alias-border-l1, var(--dsw-alias-border-l2))' }}>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, cursor: 'pointer' }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span id={`${panelPrefix}-native-context-label`} style={labelStyle}>{t('enableNativeCompaction')}</span>
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
    </div>
  )
}
