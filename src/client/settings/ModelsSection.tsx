/** Compact model catalog visibility and per-model context budget card. */

import type { OpenAICodexSettingsConfig } from '../../shared/settings.ts'
import {
  isValidOpenAICodexContextBudget,
  openAICodexContextLimitSource,
  sortOpenAICodexModels,
} from '../../shared/models.ts'
import type { OpenAICodexModelCatalogEntry } from '../../shared/models.ts'
import type { OpenAICodexTranslate } from './AccountSection.tsx'
import {
  badgeStyle,
  bodyStyle,
  buttonsStyle,
  errorStyle,
  fieldsetStyle,
  labelStyle,
  monoStyle,
  subPanelStyle,
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

function formatCompactTokens(tokens: number): string {
  if (tokens >= 1_000_000 && tokens % 1_000 === 0) return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 2)}M`
  if (tokens >= 1_000 && tokens % 1_000 === 0) return `${tokens / 1_000}K`
  return tokens.toLocaleString()
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
  const orderedCatalog = modelCatalog === undefined ? undefined : sortOpenAICodexModels(modelCatalog)
  const isSelected = (modelId: string): boolean => draft.models === undefined || draft.models.includes(modelId)
  const enabledModels = orderedCatalog?.filter(model => isSelected(model.id)) ?? []
  const disabledModels = orderedCatalog?.filter(model => !isSelected(model.id)) ?? []

  const renderModelRow = (model: OpenAICodexModelCatalogEntry, selected: boolean, isLast: boolean) => {
    const budget = draft.contextWindowOverrides?.[model.id]
    const invalidBudget = budget !== undefined && !isValidOpenAICodexContextBudget(budget, model.maxContextWindow)
    const effectiveBudget = budget ?? model.contextWindow
    const changeBudget = (value: number): void => {
      onUpdate('contextWindowOverrides', { ...draft.contextWindowOverrides, [model.id]: value })
    }
    return (
      <div
        key={model.id}
        role="group"
        aria-label={model.name}
        style={{
          padding: '8px 0',
          borderBottom: isLast ? 0 : '0.5px solid var(--dsw-alias-border-l1, var(--dsw-alias-border-l2))',
          opacity: selected ? 1 : 0.72,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 0, cursor: 'pointer' }}>
            <input
              type="checkbox"
              className="cc-switch"
              checked={selected}
              onChange={event => {
                if (orderedCatalog === undefined) return
                const visibleModels = new Set(draft.models ?? orderedCatalog.map(entry => entry.id))
                if (event.currentTarget.checked) visibleModels.add(model.id)
                else visibleModels.delete(model.id)
                onUpdate('models', orderedCatalog.filter(entry => visibleModels.has(entry.id)).map(entry => entry.id))
              }}
            />
            <span style={{ display: 'inline-flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 6, minWidth: 0 }}>
              <span style={labelStyle}>{model.name}</span>
              {model.name === model.id ? null : <span style={monoStyle}>{model.id}</span>}
            </span>
          </label>
          <div style={buttonsStyle}>
            <span style={{ ...badgeStyle, fontVariantNumeric: 'tabular-nums' }} title={`${effectiveBudget.toLocaleString()} tokens`}>
              {invalidBudget ? t('contextCustom') : `${formatCompactTokens(effectiveBudget)}${budget === undefined ? ` · ${t('contextDefault')}` : ''}`}
            </span>
            <button type="button" className="cc-btn cc-btn-ghost" aria-expanded={expandedModels[model.id] === true} onClick={() => { onToggleExpand(model.id) }}>
              {expandedModels[model.id] === true ? t('contextHide') : t('contextAdjust')}
            </button>
          </div>
        </div>
        {expandedModels[model.id] === true ? (
          <div role="group" aria-label={t('contextTokens')} style={subPanelStyle}>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span style={labelStyle}>{t('contextTokens')}</span>
              <input
                type="number"
                className="cc-input"
                min={1}
                step={1}
                max={model.maxContextWindow}
                style={{ width: 112, flexShrink: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                value={Number.isNaN(effectiveBudget) ? '' : effectiveBudget}
                aria-invalid={invalidBudget}
                onChange={event => { changeBudget(event.currentTarget.valueAsNumber) }}
              />
            </label>
            <input
              type="range"
              min={1}
              max={model.maxContextWindow}
              step={1}
              aria-label={t('contextSlider')}
              aria-valuetext={invalidBudget ? t('contextInvalid') : `${effectiveBudget.toLocaleString()} tokens`}
              style={{ width: '100%', height: 18, margin: 0, accentColor: 'var(--dsw-alias-label-primary)' }}
              value={invalidBudget ? model.contextWindow : effectiveBudget}
              onChange={event => { changeBudget(event.currentTarget.valueAsNumber) }}
            />
            <div style={{ ...bodyStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {model.contextLimitSource === 'codex-catalog'
                  ? <a href={openAICodexContextLimitSource(model.id)} target="_blank" rel="noopener noreferrer" title={t('contextLimitSource')} style={{ color: 'inherit', textDecorationStyle: 'dotted', textUnderlineOffset: 3 }}>{t('contextMaximum')}</a>
                  : <span title={t('contextLimitFallback')}>{t('contextMaximum')}</span>}
                <span style={{ ...badgeStyle, fontVariantNumeric: 'tabular-nums' }}>{model.maxContextWindow.toLocaleString()}</span>
              </span>
              <button
                type="button"
                className="cc-btn cc-btn-ghost"
                title={`${t('contextDefault')}: ${model.contextWindow.toLocaleString()} tokens`}
                onClick={() => {
                  const overrides = { ...draft.contextWindowOverrides }
                  delete overrides[model.id]
                  onUpdate('contextWindowOverrides', overrides)
                }}
              >{t('contextReset')}</button>
            </div>
            {budget !== undefined && budget > model.contextWindow && !invalidBudget
              ? <p style={bodyStyle} role="status">{t('contextAboveDefault')}</p> : null}
            {invalidBudget ? <p style={errorStyle} role="alert">{t('contextInvalid')} (1–{model.maxContextWindow.toLocaleString()})</p> : null}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div
      id={`${panelPrefix}-models`}
      role="tabpanel"
      aria-labelledby={`${panelPrefix}-models-tab`}
      hidden={!visible}
      style={{ ...fieldsetStyle, display: visible ? fieldsetStyle.display : 'none' }}
    >
      <div className="cc-card">
        <div style={{ marginBottom: 10 }}>
          <h3 className="cc-card-title" style={{ marginBottom: 3 }}>{t('modelCatalog')}</h3>
          <p style={bodyStyle}>{t('modelCatalogIntro')}</p>
        </div>
        {orderedCatalog === undefined && !modelCatalogError ? <p style={bodyStyle} role="status">{t('modelCatalogLoading')}</p> : null}
        {modelCatalogError ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <p style={errorStyle} role="alert">{t('modelCatalogFailed')}</p>
            <button type="button" className="cc-btn" onClick={onRetryCatalog}>{t('retry')}</button>
          </div>
        ) : null}
        {orderedCatalog === undefined ? null : (
          <div role="group" aria-label={t('modelCatalog')}>
            {enabledModels.length > 0 ? (
              <div role="group" aria-label={t('modelsEnabledGroup')}>
                <div className="cc-group-heading">
                  <span>{t('modelsEnabledGroup')}</span>
                  <span className="cc-tab-badge">{enabledModels.length}</span>
                </div>
                {enabledModels.map((model, index) => renderModelRow(model, true, index === enabledModels.length - 1))}
              </div>
            ) : null}
            {disabledModels.length > 0 ? (
              <div
                role="group"
                aria-label={t('modelsDisabledGroup')}
                style={enabledModels.length > 0 ? { marginTop: 12, paddingTop: 10, borderTop: '0.5px solid var(--dsw-alias-border-l2)' } : undefined}
              >
                <div className="cc-group-heading" style={{ marginTop: 0 }}>
                  <span>{t('modelsDisabledGroup')}</span>
                  <span className="cc-tab-badge">{disabledModels.length}</span>
                </div>
                {disabledModels.map((model, index) => renderModelRow(model, false, index === disabledModels.length - 1))}
              </div>
            ) : null}
          </div>
        )}
        <p style={{ ...bodyStyle, marginTop: 10 }}>{t('contextWarning')}</p>
        {!validContexts ? <p style={{ ...errorStyle, marginTop: 6 }} role="alert">{t('contextInvalid')}</p> : null}
      </div>
    </div>
  )
}
