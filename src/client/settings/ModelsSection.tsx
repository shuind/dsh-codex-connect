/** Model catalog visibility and per-model context budget editor. */

import type { OpenAICodexSettingsConfig } from '../../shared/settings.ts'
import { isValidOpenAICodexContextBudget, openAICodexContextLimitSource } from '../../shared/models.ts'
import type { OpenAICodexModelCatalogEntry } from '../../shared/models.ts'
import type { OpenAICodexTranslate } from './AccountSection.tsx'
import {
  bodyStyle,
  buttonStyle,
  buttonsStyle,
  controlStyle,
  errorStyle,
  fieldsetStyle,
  headingStyle,
  labelStyle,
  modelIdStyle,
  modelListStyle,
  modelRowStyle,
} from './styles.ts'

export interface ModelsSectionProps {
  panelPrefix: string
  visible: boolean
  draft: OpenAICodexSettingsConfig
  modelCatalog: readonly OpenAICodexModelCatalogEntry[] | undefined
  modelCatalogError: boolean
  expandedModels: Readonly<Record<string, boolean>>
  validContexts: boolean
  t: OpenAICodexTranslate
  onRetryCatalog: () => void
  onToggleExpand: (modelId: string) => void
  onUpdate: <Key extends keyof OpenAICodexSettingsConfig>(
    field: Key,
    value: OpenAICodexSettingsConfig[Key],
  ) => void
}

export function ModelsSection({
  panelPrefix,
  visible,
  draft,
  modelCatalog,
  modelCatalogError,
  expandedModels,
  validContexts,
  t,
  onRetryCatalog,
  onToggleExpand,
  onUpdate,
}: ModelsSectionProps) {
  return (
    <div
      id={`${panelPrefix}-models`}
      role="tabpanel"
      aria-labelledby={`${panelPrefix}-models-tab`}
      hidden={!visible}
      style={{ ...fieldsetStyle, display: visible ? fieldsetStyle.display : 'none' }}
    >
      <div>
        <h3 style={headingStyle}>{t('modelCatalog')}</h3>
        <p style={{ ...bodyStyle, marginTop: 4 }}>{t('modelCatalogIntro')}</p>
      </div>
      {modelCatalog === undefined && !modelCatalogError ? <p style={bodyStyle} role="status">{t('modelCatalogLoading')}</p> : null}
      {modelCatalogError ? (
        <div>
          <p style={errorStyle} role="alert">{t('modelCatalogFailed')}</p>
          <button type="button" style={buttonStyle} onClick={onRetryCatalog}>{t('retry')}</button>
        </div>
      ) : null}
      {modelCatalog === undefined ? null : (
        <div style={modelListStyle} role="group" aria-label={t('modelCatalog')}>
          {modelCatalog.map(model => {
            const selected = draft.models === undefined || draft.models.includes(model.id)
            const budget = draft.contextWindowOverrides?.[model.id]
            const invalidBudget = budget !== undefined && !isValidOpenAICodexContextBudget(budget, model.maxContextWindow)
            const effectiveBudget = budget ?? model.contextWindow
            const changeBudget = (value: number): void => {
              onUpdate('contextWindowOverrides', { ...draft.contextWindowOverrides, [model.id]: value })
            }
            return (
              <div key={model.id} role="group" aria-label={model.name} style={{ minWidth: 0, padding: '10px 0', borderBottom: '1px solid var(--dsw-alias-border-l2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <label style={{ ...modelRowStyle, minWidth: 0, overflowWrap: 'anywhere' }}>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={event => {
                        const visibleModels = new Set(draft.models ?? modelCatalog.map(entry => entry.id))
                        if (event.currentTarget.checked) visibleModels.add(model.id)
                        else visibleModels.delete(model.id)
                        onUpdate('models', modelCatalog.filter(entry => visibleModels.has(entry.id)).map(entry => entry.id))
                      }}
                    />
                    <span>
                      <span>{model.name}</span>
                      {model.name === model.id ? null : <span style={modelIdStyle}> ({model.id})</span>}
                    </span>
                  </label>
                  <div style={{ ...buttonsStyle, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={bodyStyle}>{t('modelContext')}: {invalidBudget ? t('contextCustom') : `${effectiveBudget.toLocaleString()} tokens${budget === undefined ? ` · ${t('contextDefault')}` : ''}`}</span>
                    <button type="button" style={buttonStyle} aria-expanded={expandedModels[model.id] === true} onClick={() => { onToggleExpand(model.id) }}>
                      {expandedModels[model.id] === true ? t('contextHide') : t('contextAdjust')}
                    </button>
                  </div>
                </div>
                {expandedModels[model.id] === true ? (
                  <div role="group" aria-label={t('contextTokens')} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <span style={labelStyle}>{t('contextTokens')}</span>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        max={model.maxContextWindow}
                        style={{ ...controlStyle, width: 112, flexShrink: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                        value={Number.isNaN(effectiveBudget) ? '' : effectiveBudget}
                        aria-invalid={invalidBudget}
                        onChange={event => { changeBudget(event.currentTarget.valueAsNumber) }}
                      />
                    </label>
                    <div style={{ ...bodyStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {model.contextLimitSource === 'codex-catalog'
                          ? <a href={openAICodexContextLimitSource(model.id)} target="_blank" rel="noopener noreferrer" title={t('contextLimitSource')} style={{ color: 'inherit', textDecorationStyle: 'dotted', textUnderlineOffset: 3 }}>{t('contextMaximum')}</a>
                          : <span title={t('contextLimitFallback')}>{t('contextMaximum')}</span>}
                        <span style={{ padding: '1px 6px', borderRadius: 4, background: 'var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1))', fontVariantNumeric: 'tabular-nums' }}>{model.maxContextWindow}</span>
                        <span>tokens</span>
                      </span>
                      <button
                        type="button"
                        title={`${t('contextDefault')}: ${model.contextWindow.toLocaleString()} tokens`}
                        style={{ ...bodyStyle, padding: '2px 0', border: 0, background: 'transparent', font: 'inherit', fontSize: 12, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}
                        onClick={() => {
                          const overrides = { ...draft.contextWindowOverrides }
                          delete overrides[model.id]
                          onUpdate('contextWindowOverrides', overrides)
                        }}
                      >{t('contextReset')}</button>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={model.maxContextWindow}
                      step={1}
                      aria-label={t('contextSlider')}
                      aria-valuetext={invalidBudget ? t('contextInvalid') : `${effectiveBudget.toLocaleString()} tokens`}
                      style={{ width: '100%', height: 20, margin: 0, accentColor: 'var(--dsw-alias-label-secondary)' }}
                      value={invalidBudget ? model.contextWindow : effectiveBudget}
                      onChange={event => { changeBudget(event.currentTarget.valueAsNumber) }}
                    />
                    {budget !== undefined && budget > model.contextWindow && !invalidBudget
                      ? <p style={bodyStyle} role="status">{t('contextAboveDefault')}</p> : null}
                    {invalidBudget ? <p style={errorStyle} role="alert">{t('contextInvalid')} (1–{model.maxContextWindow.toLocaleString()})</p> : null}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
      <p style={bodyStyle}>{t('contextWarning')}</p>
      {!validContexts ? <p style={errorStyle} role="alert">{t('contextInvalid')}</p> : null}
    </div>
  )
}
