/** Optional Codex capabilities: search, reasoning, speed, compaction, images. */

import type { OpenAICodexSettingsConfig } from '../../shared/settings.ts'
import {
  OPENAI_CODEX_REASONING_EFFORTS,
  parseOpenAICodexReasoningEffort,
  parseOpenAICodexSpeedDefault,
} from '../../shared/models.ts'
import type { OpenAICodexTranslate } from './AccountSection.tsx'
import {
  badgeStyle,
  bodyStyle,
  controlStyle,
  fieldsetStyle,
  formFieldStyle,
  formGridStyle,
  headingStyle,
  labelStyle,
  toggleCopyStyle,
  toggleRowStyle,
} from './styles.ts'

export interface CapabilitiesSectionProps {
  panelPrefix: string
  visible: boolean
  draft: OpenAICodexSettingsConfig
  savedNativeCompaction: boolean | undefined
  searchDisabled: boolean
  validModel: boolean
  validTokens: boolean
  validImageModelHint: boolean
  t: OpenAICodexTranslate
  onUpdate: <Key extends keyof OpenAICodexSettingsConfig>(
    field: Key,
    value: OpenAICodexSettingsConfig[Key],
  ) => void
}

export function CapabilitiesSection({
  panelPrefix,
  visible,
  draft,
  savedNativeCompaction,
  searchDisabled,
  validModel,
  validTokens,
  validImageModelHint,
  t,
  onUpdate,
}: CapabilitiesSectionProps) {
  return (
    <div
      id={`${panelPrefix}-capabilities`}
      role="tabpanel"
      aria-labelledby={`${panelPrefix}-capabilities-tab`}
      hidden={!visible}
      style={{ ...fieldsetStyle, display: visible ? fieldsetStyle.display : 'none' }}
    >
      <div style={{ paddingTop: 4 }}>
        <h3 style={headingStyle}>{t('capabilitiesHeading')}</h3>
        <p style={{ ...bodyStyle, marginTop: 4 }}>{t('capabilitiesIntro')}</p>
      </div>
      <label style={toggleRowStyle}>
        <input
          type="checkbox"
          checked={draft.enableSearch}
          onChange={event => { onUpdate('enableSearch', event.currentTarget.checked) }}
        />
        <span style={toggleCopyStyle}>
          <span style={labelStyle}>{t('enableSearch')}</span>
          <span style={bodyStyle}>{t('enableSearchHelp')}</span>
        </span>
      </label>
      <div style={formGridStyle} aria-disabled={searchDisabled}>
        <label style={formFieldStyle}>
          <span style={labelStyle}>{t('searchModel')}</span>
          <input
            style={controlStyle}
            value={draft.searchModel}
            disabled={searchDisabled}
            aria-invalid={!validModel}
            onChange={event => { onUpdate('searchModel', event.currentTarget.value) }}
          />
        </label>
        <label style={formFieldStyle}>
          <span style={labelStyle}>{t('searchMode')}</span>
          <select
            style={controlStyle}
            value={draft.searchMode}
            disabled={searchDisabled}
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
            style={controlStyle}
            value={draft.searchContextSize}
            disabled={searchDisabled}
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
            style={controlStyle}
            type="number"
            min={1}
            step={1}
            value={draft.searchMaxOutputTokens}
            disabled={searchDisabled}
            aria-invalid={!validTokens}
            onChange={event => { onUpdate('searchMaxOutputTokens', event.currentTarget.valueAsNumber) }}
          />
        </label>
      </div>
      <label style={formFieldStyle}>
        <span style={labelStyle}>{t('reasoningEffort')}</span>
        <select
          style={controlStyle}
          value={draft.reasoningEffort ?? ''}
          onChange={event => { onUpdate('reasoningEffort', parseOpenAICodexReasoningEffort(event.currentTarget.value || undefined) ?? undefined) }}
        >
          <option value="">{t('reasoningProviderDefault')}</option>
          {OPENAI_CODEX_REASONING_EFFORTS.map(effort => <option key={effort} value={effort}>{effort}</option>)}
        </select>
        <span style={bodyStyle}>{t('reasoningEffortHelp')}</span>
      </label>
      {(['newSessionSpeedMode', 'newSubagentSpeedMode'] as const).map(field => (
        <label key={field} style={formFieldStyle}>
          <span style={labelStyle}>{t(field)}</span>
          <select
            style={controlStyle}
            value={draft[field] ?? ''}
            onChange={event => { onUpdate(field, parseOpenAICodexSpeedDefault(event.currentTarget.value || undefined) ?? undefined) }}
          >
            <option value="">{t('legacySpeedDefault')}</option>
            <option value="standard">{t('speedStandard')}</option>
            <option value="fast">{t('speedFast')}</option>
            <option value="ultrafast">Ultrafast</option>
          </select>
        </label>
      ))}
      <p style={bodyStyle}>{t('newSessionSpeedHelp')}</p>
      <p style={bodyStyle}>{t('ultrafastDisclosure')}</p>
      <label style={toggleRowStyle}>
        <input
          type="checkbox"
          disabled={draft.newSessionSpeedMode !== undefined}
          checked={draft.enableNewSessionFastMode}
          onChange={event => { onUpdate('enableNewSessionFastMode', event.currentTarget.checked) }}
        />
        <span style={toggleCopyStyle}>
          <span style={labelStyle}>{t('enableNewSessionFastMode')}</span>
          <span style={bodyStyle}>{t('enableNewSessionFastModeHelp')}</span>
        </span>
      </label>
      <label style={toggleRowStyle}>
        <input
          type="checkbox"
          disabled={draft.newSubagentSpeedMode !== undefined}
          checked={draft.enableNewSubagentFastMode}
          onChange={event => { onUpdate('enableNewSubagentFastMode', event.currentTarget.checked) }}
        />
        <span style={toggleCopyStyle}>
          <span style={labelStyle}>{t('enableNewSubagentFastMode')}</span>
          <span style={bodyStyle}>{t('enableNewSubagentFastModeHelp')}</span>
        </span>
      </label>
      <div role="group" aria-labelledby={`${panelPrefix}-native-context-label`} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={toggleRowStyle}>
          <input
            type="checkbox"
            aria-labelledby={`${panelPrefix}-native-context-label`}
            aria-describedby={`${panelPrefix}-native-context-help ${panelPrefix}-native-context-consent`}
            checked={draft.enableNativeCompaction}
            onChange={event => { onUpdate('enableNativeCompaction', event.currentTarget.checked) }}
          />
          <span style={{ ...toggleCopyStyle, minWidth: 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
              <span id={`${panelPrefix}-native-context-label`} style={labelStyle}>{t('enableNativeCompaction')}</span>
              <span style={badgeStyle}>{t('nativeCompactionBadge')}</span>
            </span>
            <span id={`${panelPrefix}-native-context-help`} style={bodyStyle}>{t('enableNativeCompactionHelp')}</span>
          </span>
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginLeft: 26 }}>
          <p id={`${panelPrefix}-native-context-consent`} style={bodyStyle}>{t('nativeCompactionConsent')}</p>
          {savedNativeCompaction !== undefined ? (
            <p style={bodyStyle} role="status">
              {t(savedNativeCompaction ? 'nativeCompactionSavedOn' : 'nativeCompactionSavedOff')}
              {draft.enableNativeCompaction !== savedNativeCompaction
                ? <span style={{ marginLeft: 8 }}>{t('nativeCompactionPending')}</span> : null}
            </p>
          ) : null}
          <p style={bodyStyle}>{t('nativeCompactionRisk')}</p>
          <details>
            <summary style={{ ...bodyStyle, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>{t('nativeCompactionDetails')}</summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
              <p style={bodyStyle}>{t('nativeCompactionHostPolicy')}</p>
              <p style={bodyStyle}>{t('nativeCompactionDisableHelp')}</p>
            </div>
          </details>
        </div>
      </div>
      <label style={toggleRowStyle}>
        <input
          type="checkbox"
          checked={draft.enableImageTool}
          onChange={event => { onUpdate('enableImageTool', event.currentTarget.checked) }}
        />
        <span style={toggleCopyStyle}>
          <span style={labelStyle}>{t('enableImageTool')}</span>
          <span style={bodyStyle}>{t('enableImageToolHelp')}</span>
        </span>
      </label>
      <label style={toggleRowStyle}>
        <input
          type="checkbox"
          checked={draft.enableImageGeneration}
          onChange={event => { onUpdate('enableImageGeneration', event.currentTarget.checked) }}
        />
        <span style={toggleCopyStyle}>
          <span style={labelStyle}>{t('enableImageGeneration')}</span>
          <span style={bodyStyle}>{t('enableImageGenerationHelp')}</span>
        </span>
      </label>
      <label style={formFieldStyle}>
        <span style={labelStyle}>{t('imageModelHint')}</span>
        <input
          style={controlStyle}
          value={draft.imageModelHint}
          placeholder={t('imageModelHintDefault')}
          aria-invalid={!validImageModelHint}
          onChange={event => { onUpdate('imageModelHint', event.currentTarget.value) }}
        />
        <span style={bodyStyle}>{t('imageModelHintHelp')}</span>
      </label>
    </div>
  )
}
