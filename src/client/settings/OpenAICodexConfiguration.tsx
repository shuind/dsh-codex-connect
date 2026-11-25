/** Staged optional-capability editor inside the OpenAI Codex plugin card. */

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { OpenAICodexSettingsConfig } from '../../shared/settings.ts'
import {
  isValidOpenAICodexContextWindowOverrides,
  isValidOpenAICodexImageModelHint,
} from '../../shared/settings.ts'
import {
  decodeOpenAICodexModelCatalog,
  isValidOpenAICodexContextBudget,
  OPENAI_CODEX_MODEL_CATALOG_PATH,
} from '../../shared/models.ts'
import type { OpenAICodexModelCatalogEntry } from '../../shared/models.ts'
import { requestJson } from '../shared/request-json.ts'
import type { OpenAICodexTranslate } from './AccountSection.tsx'
import { ModelsSection } from './ModelsSection.tsx'
import { CapabilitiesSection } from './CapabilitiesSection.tsx'
import {
  bodyStyle,
  buttonsStyle,
  errorStyle,
  fieldsetStyle,
  primaryButtonStyle,
  stackStyle,
  successStyle,
} from './styles.ts'

export interface OpenAICodexConfigurationProps {
  scope?: ConfigForm<OpenAICodexSettingsConfig>
  t: OpenAICodexTranslate
  /** Select one settings module from the Plugin page. Omit to show local navigation. */
  activeModule?: OpenAICodexSettingsModule
  /** Stable prefix that associates external module tabs with these panels. */
  panelIdPrefix?: string
}

/** Modules shared by the Plugin settings page and the Models settings dialog. */
export type OpenAICodexSettingsModule = 'account' | 'models' | 'capabilities'

const CONFIGURATION_MODULES = ['models', 'capabilities'] as const

const UNAVAILABLE_SNAPSHOT = {
  status: 'unavailable' as const,
  value: undefined,
  base: undefined,
  user: undefined,
  revision: undefined,
  writable: false,
  mode: 'memory' as const,
}

const CONFIG_FIELDS = [
  'models',
  'contextWindowOverrides',
  'enableNativeCompaction',
  'enableImageGeneration',
  'imageModelHint',
  'searchModel',
  'searchMode',
  'searchContextSize',
  'searchMaxOutputTokens',
  'enableSearch',
] as const satisfies readonly (keyof OpenAICodexSettingsConfig)[]

function sameField(
  field: keyof OpenAICodexSettingsConfig,
  left: OpenAICodexSettingsConfig[keyof OpenAICodexSettingsConfig],
  right: OpenAICodexSettingsConfig[keyof OpenAICodexSettingsConfig],
): boolean {
  if (field === 'contextWindowOverrides') {
    const leftMap = left as OpenAICodexSettingsConfig['contextWindowOverrides']
    const rightMap = right as OpenAICodexSettingsConfig['contextWindowOverrides']
    return Object.keys(leftMap ?? {}).length === Object.keys(rightMap ?? {}).length
      && Object.entries(leftMap ?? {}).every(([id, value]) => rightMap?.[id] === value)
  }
  if (field !== 'models') return left === right
  if (left === undefined || right === undefined) return left === right
  return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length
    && left.every((model, index) => model === right[index])
}

/** Untouched Host-accepted budgets need no new catalog authority; edits do. */
export function validContextEdits(
  overrides: OpenAICodexSettingsConfig['contextWindowOverrides'],
  accepted: OpenAICodexSettingsConfig['contextWindowOverrides'],
  catalog: readonly OpenAICodexModelCatalogEntry[] | undefined,
): boolean {
  return isValidOpenAICodexContextWindowOverrides(overrides ?? {})
    && (sameField('contextWindowOverrides', overrides, accepted) || catalog !== undefined)
    && Object.entries(overrides ?? {}).every(([id, budget]) => {
      if (accepted?.[id] === budget) return true
      const model = catalog?.find(entry => entry.id === id)
      return model !== undefined && isValidOpenAICodexContextBudget(budget, model.maxContextWindow)
    })
}

/** Edit the Host-owned llm-openai-codex settings section with Save/Discard staging. */
export function OpenAICodexConfiguration({ scope, t, activeModule, panelIdPrefix }: OpenAICodexConfigurationProps) {
  const subscribe = useCallback((listener: () => void) => scope?.subscribe(listener) ?? (() => undefined), [scope])
  const getSnapshot = useCallback(() => scope?.getSnapshot() ?? UNAVAILABLE_SNAPSHOT, [scope])
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const [draft, setDraft] = useState<OpenAICodexSettingsConfig | undefined>(snapshot.value)
  const [baseline, setBaseline] = useState<OpenAICodexSettingsConfig | undefined>(snapshot.value)
  const scopeRef = useRef(scope)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<'idle' | 'saved' | 'error'>('idle')
  const [modelCatalog, setModelCatalog] = useState<OpenAICodexModelCatalogEntry[] | undefined>()
  const [modelCatalogError, setModelCatalogError] = useState(false)
  const [expandedModels, setExpandedModels] = useState<Readonly<Record<string, boolean>>>({})
  const [localModule, setLocalModule] = useState<(typeof CONFIGURATION_MODULES)[number]>('models')
  const localPanelIdPrefix = useId()
  const [catalogAttempt, setCatalogAttempt] = useState(0)

  const dirty = draft !== undefined && baseline !== undefined
    && CONFIG_FIELDS.some(field => !sameField(field, baseline[field], draft[field]))

  useEffect(() => {
    if (scopeRef.current === scope) return
    scopeRef.current = scope
    const nextValue = scope?.getSnapshot().value
    setBaseline(nextValue)
    setDraft(nextValue)
    setFeedback('idle')
  }, [scope])

  useEffect(() => {
    if (scope === undefined) return
    const controller = new AbortController()
    setModelCatalog(undefined)
    setModelCatalogError(false)
    void requestJson(OPENAI_CODEX_MODEL_CATALOG_PATH, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    }).then(({ response, value }) => {
      if (controller.signal.aborted) return
      if (!response.ok) throw new Error(`model catalog request failed: ${String(response.status)}`)
      const catalog = decodeOpenAICodexModelCatalog(value)
      if (catalog === undefined) throw new Error('model catalog response was invalid')
      setModelCatalog(catalog)
      setModelCatalogError(false)
    }).catch(() => {
      if (!controller.signal.aborted) setModelCatalogError(true)
    })
    return () => { controller.abort() }
  }, [scope, catalogAttempt])

  useEffect(() => {
    if (!dirty && !busy) {
      setBaseline(snapshot.value)
      setDraft(snapshot.value)
    }
  }, [busy, dirty, snapshot.revision, snapshot.value])

  useEffect(() => {
    if (feedback !== 'saved') return
    const timer = window.setTimeout(() => { setFeedback('idle') }, 2500)
    return () => { window.clearTimeout(timer) }
  }, [feedback])

  const update = <Key extends keyof OpenAICodexSettingsConfig>(
    field: Key,
    value: OpenAICodexSettingsConfig[Key],
  ): void => {
    setDraft(current => current === undefined ? current : { ...current, [field]: value })
    setFeedback('idle')
  }

  const discard = (): void => {
    const latest = scope?.getSnapshot().value
    setBaseline(latest)
    setDraft(latest)
    setFeedback('idle')
  }

  const validModel = draft !== undefined && draft.searchModel.trim().length > 0
  const validTokens = draft !== undefined && Number.isInteger(draft.searchMaxOutputTokens) && draft.searchMaxOutputTokens > 0
  const validImageModelHint = draft !== undefined && isValidOpenAICodexImageModelHint(draft.imageModelHint)
  const validContexts = draft !== undefined && validContextEdits(draft.contextWindowOverrides, baseline?.contextWindowOverrides, modelCatalog)
  const valid = validModel && validTokens && validImageModelHint && validContexts

  const save = async (): Promise<void> => {
    if (scope === undefined || draft === undefined || !snapshot.writable || !valid) return
    const desired: OpenAICodexSettingsConfig = {
      ...draft,
      searchModel: draft.searchModel.trim(),
    }
    setBusy(true)
    setFeedback('idle')
    try {
      const current = scope.getSnapshot()
      const original = baseline
      if (!current.writable || current.status !== 'ready' || ('mode' in current && current.mode === 'memory') || current.value === undefined || original === undefined || current.revision === undefined) {
        throw new Error('Host settings are unavailable')
      }
      const changed = CONFIG_FIELDS.filter(field => !sameField(field, original[field], desired[field]))
      const ops: Parameters<ConfigForm<OpenAICodexSettingsConfig>['mutate']>[0] = changed.map(field => {
        if (!sameField(field, original[field], current.value![field])
          && !sameField(field, desired[field], current.value![field])) {
          throw new Error(`Concurrent change to ${field}`)
        }
        const value = field === 'contextWindowOverrides'
          ? { ...Object.fromEntries((modelCatalog ?? []).map(model => [model.id, null])), ...desired.contextWindowOverrides }
          : desired[field]
        return value === undefined ? { op: 'unset', path: [field] } : { op: 'set', path: [field], value }
      })
      if (ops.length > 0 && !await scope.mutate(ops, current.revision)) throw new Error('Host refused the configuration change')
      const accepted = scope.getSnapshot().value
      if (accepted === undefined || changed.some(field => !sameField(field, accepted[field], desired[field]))) {
        throw new Error('Host refused the configuration change')
      }
      setBaseline(accepted)
      setDraft(accepted)
      setFeedback('saved')
    } catch {
      setFeedback('error')
    } finally {
      setBusy(false)
    }
  }

  const loading = snapshot.status === 'loading'
  const editable = snapshot.status === 'ready' && snapshot.writable && !busy
  const visibleModule = activeModule ?? localModule
  const panelPrefix = panelIdPrefix ?? localPanelIdPrefix
  const showSaveBar = dirty || feedback !== 'idle'
  const hideSection = visibleModule === 'account' && !showSaveBar

  const selectLocalModule = (module: (typeof CONFIGURATION_MODULES)[number]): void => {
    setLocalModule(module)
    document.getElementById(`${panelPrefix}-${module}-tab`)?.focus()
  }

  return (
    <section
      style={{ ...stackStyle, display: hideSection ? 'none' : 'flex' }}
      aria-label={t('configurationHeading')}
    >
      {loading ? <p style={bodyStyle} role="status">{t('settingsLoading')}</p> : null}
      {snapshot.status === 'unavailable' ? <p style={errorStyle} role="alert">{t('settingsUnavailable')}</p> : null}
      {snapshot.status === 'ready' && !snapshot.writable ? <p style={errorStyle} role="alert">{t('settingsReadOnly')}</p> : null}
      {draft === undefined ? null : (
        <>
          {activeModule === undefined ? (
            <div className="cc-header" style={{ marginBottom: 4 }}>
              <div className="cc-tabs" role="tablist" aria-label={t('settingsModules')}>
                {CONFIGURATION_MODULES.map((module, index) => (
                  <button
                    key={module}
                    id={`${panelPrefix}-${module}-tab`}
                    type="button"
                    role="tab"
                    className="cc-tab"
                    aria-label={t(`${module}Module`)}
                    aria-selected={localModule === module}
                    aria-controls={`${panelPrefix}-${module}`}
                    tabIndex={localModule === module ? 0 : -1}
                    onClick={() => { setLocalModule(module) }}
                    onKeyDown={event => {
                      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
                      event.preventDefault()
                      const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? CONFIGURATION_MODULES.length - 1
                        : (index + (event.key === 'ArrowRight' ? 1 : -1) + CONFIGURATION_MODULES.length) % CONFIGURATION_MODULES.length
                      selectLocalModule(CONFIGURATION_MODULES[nextIndex]!)
                    }}
                  >{t(`${module}Module`)}</button>
                ))}
              </div>
            </div>
          ) : null}
          <fieldset style={fieldsetStyle} disabled={!editable}>
            <ModelsSection
              panelPrefix={panelPrefix}
              visible={visibleModule === 'models'}
              draft={draft}
              modelCatalog={modelCatalog}
              modelCatalogError={modelCatalogError}
              expandedModels={expandedModels}
              validContexts={validContexts}
              t={t}
              onRetryCatalog={() => { setCatalogAttempt(attempt => attempt + 1) }}
              onToggleExpand={modelId => { setExpandedModels(current => ({ ...current, [modelId]: !current[modelId] })) }}
              onUpdate={update}
            />
            <CapabilitiesSection
              panelPrefix={panelPrefix}
              visible={visibleModule === 'capabilities'}
              draft={draft}
              savedNativeCompaction={snapshot.status === 'ready' ? snapshot.value?.enableNativeCompaction : undefined}
              validModel={validModel}
              validTokens={validTokens}
              validImageModelHint={validImageModelHint}
              t={t}
              onUpdate={update}
            />
          </fieldset>
        </>
      )}
      {visibleModule === 'capabilities' && !validModel && draft !== undefined ? <p style={errorStyle} role="alert">{t('invalidSearchModel')}</p> : null}
      {visibleModule === 'capabilities' && !validTokens && draft !== undefined ? <p style={errorStyle} role="alert">{t('invalidSearchTokens')}</p> : null}
      {visibleModule === 'capabilities' && !validImageModelHint && draft !== undefined ? <p style={errorStyle} role="alert">{t('invalidImageModelHint')}</p> : null}
      {showSaveBar ? (
        <div className="cc-savebar">
          <span aria-live="polite">
            {feedback === 'saved' ? <span style={successStyle}>{t('settingsSaved')}</span> : null}
            {feedback === 'error' ? <span style={errorStyle}>{t('settingsSaveFailed')}</span> : null}
          </span>
          <span style={buttonsStyle}>
            <button type="button" className="cc-btn" disabled={!dirty || busy} onClick={discard}>{t('discard')}</button>
            <button
              type="button"
              className="cc-btn"
              style={primaryButtonStyle}
              disabled={!dirty || !valid || !snapshot.writable || busy}
              onClick={() => { void save() }}
            >
              {busy ? t('saving') : t('save')}
            </button>
          </span>
        </div>
      ) : null}
    </section>
  )
}
