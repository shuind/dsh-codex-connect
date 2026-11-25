/** Proxy connection state hook, auto-detection, and manual proxy probing UI. */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { OpenAICodexProxyProbeResult, OpenAICodexSettingsConfig } from '../../shared/settings.ts'
import {
  normalizeOpenAICodexProxyUrl,
  OPENAI_CODEX_PROXY_DETECT_PATH,
  OPENAI_CODEX_PROXY_TEST_PATH,
} from '../../shared/settings.ts'
import { requestJson } from '../shared/request-json.ts'
import type { OpenAICodexTranslate } from './AccountSection.tsx'
import {
  actionsStyle,
  activeProxyTabStyle,
  bodyStyle,
  buttonsStyle,
  candidateStyle,
  connectionCardStyle,
  controlStyle,
  errorStyle,
  fieldsetStyle,
  formFieldStyle,
  headingStyle,
  labelStyle,
  modelIdStyle,
  pendingStyle,
  primaryProxyButtonStyle,
  proxyButtonStyle,
  proxyTabStyle,
  proxyTabsStyle,
  statePillStyle,
  successStyle,
} from './styles.ts'

export type ProxyDetectionState =
  | { status: 'idle' }
  | { status: 'detecting' }
  | { status: 'candidate'; candidates: readonly OpenAICodexProxyProbeResult[] }
  | { status: 'failed'; results: readonly OpenAICodexProxyProbeResult[] }

export type CurrentProxyCheckState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'success'; result: OpenAICodexProxyProbeResult }
  | { status: 'failed'; result?: OpenAICodexProxyProbeResult }

type ProxyDetectionResponse = {
  candidates: readonly OpenAICodexProxyProbeResult[]
  results: readonly OpenAICodexProxyProbeResult[]
}

export function useProxyConfig(options: {
  scope: ConfigForm<OpenAICodexSettingsConfig> | undefined
  draft: OpenAICodexSettingsConfig | undefined
  accepted: OpenAICodexSettingsConfig | undefined
  onStageProxy: (proxyUrl: string) => void
  onClearFeedback: () => void
}) {
  const { scope, draft, accepted, onStageProxy, onClearFeedback } = options
  const [proxyDetection, setProxyDetection] = useState<ProxyDetectionState>({ status: 'idle' })
  const [proxyMode, setProxyMode] = useState<'auto' | 'manual'>('auto')
  const [manualProxyUrl, setManualProxyUrl] = useState(accepted?.proxyUrl ?? '')
  const [manualProxyEdited, setManualProxyEdited] = useState(false)
  const [manualProbe, setManualProbe] = useState<OpenAICodexProxyProbeResult | undefined>()
  const [manualProbeBusy, setManualProbeBusy] = useState(false)
  const [currentProxyCheck, setCurrentProxyCheck] = useState<CurrentProxyCheckState>({ status: 'idle' })
  const proxyDetectionController = useRef<AbortController | undefined>(undefined)
  const manualProbeController = useRef<AbortController | undefined>(undefined)
  const currentProxyCheckController = useRef<AbortController | undefined>(undefined)
  const proxyDetectionRequest = useRef(0)
  const manualProbeRequest = useRef(0)
  const currentProxyCheckRequest = useRef(0)

  const replaceManualProxyInput = useCallback((value: string): void => {
    manualProbeController.current?.abort()
    manualProbeRequest.current += 1
    setManualProbeBusy(false)
    setManualProbe(undefined)
    setManualProxyUrl(value)
  }, [])

  const clearCurrentProxyCheck = useCallback((): void => {
    currentProxyCheckController.current?.abort()
    currentProxyCheckRequest.current += 1
    setCurrentProxyCheck({ status: 'idle' })
  }, [])

  const savedProxyUrl = accepted?.enableProxy === true ? normalizeOpenAICodexProxyUrl(accepted.proxyUrl) : undefined
  const draftProxyUrl = draft?.enableProxy === true ? normalizeOpenAICodexProxyUrl(draft.proxyUrl) : undefined

  useEffect(() => {
    const acceptedUrl = accepted?.proxyUrl ?? ''
    if (manualProxyEdited && manualProxyUrl === acceptedUrl) setManualProxyEdited(false)
    if (!manualProxyEdited && manualProxyUrl !== acceptedUrl) replaceManualProxyInput(acceptedUrl)
  }, [manualProxyEdited, manualProxyUrl, accepted?.proxyUrl, replaceManualProxyInput])

  useEffect(() => {
    setProxyMode('auto')
    setManualProxyEdited(false)
    replaceManualProxyInput(scope?.getSnapshot().value?.proxyUrl ?? '')
    setProxyDetection({ status: 'idle' })
    setCurrentProxyCheck({ status: 'idle' })
    return () => {
      proxyDetectionController.current?.abort()
      manualProbeController.current?.abort()
      currentProxyCheckController.current?.abort()
      proxyDetectionRequest.current += 1
      manualProbeRequest.current += 1
      currentProxyCheckRequest.current += 1
    }
  }, [scope, replaceManualProxyInput])

  useEffect(() => {
    clearCurrentProxyCheck()
  }, [scope, savedProxyUrl, clearCurrentProxyCheck])

  const reset = (): void => {
    proxyDetectionController.current?.abort()
    proxyDetectionRequest.current += 1
    setProxyDetection({ status: 'idle' })
    setProxyMode('auto')
    setManualProxyEdited(false)
    replaceManualProxyInput(scope?.getSnapshot().value?.proxyUrl ?? '')
    clearCurrentProxyCheck()
  }

  const detectProxy = async (): Promise<void> => {
    proxyDetectionController.current?.abort()
    const controller = new AbortController()
    proxyDetectionController.current = controller
    const request = ++proxyDetectionRequest.current
    setProxyDetection({ status: 'detecting' })
    try {
      const { response, value: payload } = await requestJson(OPENAI_CODEX_PROXY_DETECT_PATH, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(`proxy detection failed: ${String(response.status)}`)
      const value = payload as ProxyDetectionResponse
      if (!Array.isArray(value.candidates) || !Array.isArray(value.results)) throw new Error('proxy detection response was invalid')
      if (request !== proxyDetectionRequest.current) return
      setProxyDetection(value.candidates.length > 0
        ? { status: 'candidate', candidates: value.candidates }
        : { status: 'failed', results: value.results })
    } catch {
      if (request === proxyDetectionRequest.current) setProxyDetection({ status: 'failed', results: [] })
    }
  }

  const useProxy = (proxyUrl: string): void => {
    if (draft === undefined) return
    const normalized = normalizeOpenAICodexProxyUrl(proxyUrl)
    if (normalized === undefined) return
    const detected = proxyDetection.status === 'candidate'
      ? proxyDetection.candidates.find(candidate => candidate.reachable && candidate.proxyUrl === normalized)
      : undefined
    const tested = manualProbe?.reachable === true && manualProbe.proxyUrl === normalized ? manualProbe : detected
    if (tested === undefined) return
    onStageProxy(normalized)
    replaceManualProxyInput(normalized)
    setManualProxyEdited(true)
    setManualProbe(tested)
    clearCurrentProxyCheck()
  }

  const testManualProxy = async (): Promise<void> => {
    const normalized = normalizeOpenAICodexProxyUrl(manualProxyUrl)
    if (normalized === undefined) return
    manualProbeController.current?.abort()
    const controller = new AbortController()
    manualProbeController.current = controller
    const request = ++manualProbeRequest.current
    setManualProbeBusy(true)
    try {
      const path = `${OPENAI_CODEX_PROXY_TEST_PATH}?proxyUrl=${encodeURIComponent(normalized)}`
      const { response, value: payload } = await requestJson(path, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(`proxy test failed: ${String(response.status)}`)
      const result = payload as OpenAICodexProxyProbeResult
      if (request === manualProbeRequest.current && normalizeOpenAICodexProxyUrl(manualProxyUrl) === normalized) setManualProbe(result)
    } catch {
      if (request === manualProbeRequest.current && normalizeOpenAICodexProxyUrl(manualProxyUrl) === normalized) {
        setManualProbe({ proxyUrl: normalized, reachable: false, classification: 'connect-failure' })
      }
    } finally {
      if (request === manualProbeRequest.current) setManualProbeBusy(false)
    }
  }

  const checkCurrentProxy = async (): Promise<void> => {
    const saved = scope?.getSnapshot().value
    const normalized = saved?.enableProxy === true ? normalizeOpenAICodexProxyUrl(saved.proxyUrl) : undefined
    if (normalized === undefined) return
    currentProxyCheckController.current?.abort()
    const controller = new AbortController()
    currentProxyCheckController.current = controller
    const request = ++currentProxyCheckRequest.current
    setCurrentProxyCheck({ status: 'checking' })
    try {
      const path = `${OPENAI_CODEX_PROXY_TEST_PATH}?proxyUrl=${encodeURIComponent(normalized)}`
      const { response, value: payload } = await requestJson(path, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(`proxy test failed: ${String(response.status)}`)
      const result = payload as OpenAICodexProxyProbeResult
      const current = scope?.getSnapshot().value
      if (request !== currentProxyCheckRequest.current || current?.enableProxy !== true || normalizeOpenAICodexProxyUrl(current.proxyUrl) !== normalized) return
      setCurrentProxyCheck(result.reachable ? { status: 'success', result } : { status: 'failed', result })
    } catch {
      const current = scope?.getSnapshot().value
      if (request === currentProxyCheckRequest.current && current?.enableProxy === true && normalizeOpenAICodexProxyUrl(current.proxyUrl) === normalized) {
        setCurrentProxyCheck({ status: 'failed' })
      }
    }
  }

  const normalizedManualProxy = normalizeOpenAICodexProxyUrl(manualProxyUrl)
  const manualProxyEntered = manualProxyUrl.trim().length > 0
  const testedManualProxy = normalizedManualProxy !== undefined && manualProbe?.reachable === true && manualProbe.proxyUrl === normalizedManualProxy
  const testedProxy = draft !== undefined && manualProbe?.reachable === true && manualProbe.proxyUrl === normalizeOpenAICodexProxyUrl(draft.proxyUrl)
  const acceptedProxyUnchanged = draft?.enableProxy === true && accepted?.enableProxy === true
    && normalizeOpenAICodexProxyUrl(draft.proxyUrl) === normalizeOpenAICodexProxyUrl(accepted.proxyUrl)
  const validProxySelection = draft?.enableProxy !== true || acceptedProxyUnchanged || testedProxy
  const proxyDraftChanged = accepted !== undefined && draft !== undefined
    && (accepted.enableProxy !== draft.enableProxy || normalizeOpenAICodexProxyUrl(accepted.proxyUrl) !== normalizeOpenAICodexProxyUrl(draft.proxyUrl))
  const manualProxyIsCurrent = normalizedManualProxy !== undefined && savedProxyUrl === normalizedManualProxy
  const manualProxyIsSelected = !manualProxyIsCurrent && normalizedManualProxy !== undefined && draftProxyUrl === normalizedManualProxy

  return {
    proxyMode,
    setProxyMode,
    proxyDetection,
    currentProxyCheck,
    savedProxyUrl,
    draftProxyUrl,
    proxyDraftChanged,
    manualProxyUrl,
    manualProxyEdited,
    manualProxyEntered,
    normalizedManualProxy,
    manualProbe,
    manualProbeBusy,
    testedManualProxy,
    manualProxyIsCurrent,
    manualProxyIsSelected,
    validProxySelection,
    reset,
    clearCurrentProxyCheck,
    detectProxy,
    useProxy,
    testManualProxy,
    checkCurrentProxy,
    handleManualProxyInput: (value: string): void => {
      setManualProxyEdited(true)
      replaceManualProxyInput(value)
      onClearFeedback()
    },
  }
}

export type ProxyConfigState = ReturnType<typeof useProxyConfig>

export interface NetworkSectionProps {
  panelPrefix: string
  visible: boolean
  draft: OpenAICodexSettingsConfig
  proxy: ProxyConfigState
  t: OpenAICodexTranslate
  onDisableProxy: () => void
}

export function NetworkSection({ panelPrefix, visible, draft, proxy, t, onDisableProxy }: NetworkSectionProps) {
  return (
    <div
      id={`${panelPrefix}-network`}
      role="tabpanel"
      aria-labelledby={`${panelPrefix}-network-tab`}
      hidden={!visible}
      style={{ ...fieldsetStyle, display: visible ? fieldsetStyle.display : 'none' }}
    >
      <div style={{ paddingTop: 4 }}>
        <h3 style={headingStyle}>{t('networkHeading')}</h3>
        <p style={{ ...bodyStyle, marginTop: 4 }}>{t('networkIntro')}</p>
      </div>
      <div style={fieldsetStyle} role="group" aria-label={t('currentConnection')}>
        <h4 style={headingStyle}>{t('currentConnection')}</h4>
        <div style={connectionCardStyle}>
          <div style={{ minWidth: 0 }}>
            <p style={labelStyle}>{proxy.savedProxyUrl === undefined ? t('directConnection') : t('proxyEnabled')}</p>
            <p style={{ ...modelIdStyle, marginTop: 3, overflowWrap: 'anywhere' }}>
              {proxy.savedProxyUrl ?? t('directConnectionDescription')}
            </p>
            {proxy.currentProxyCheck.status === 'checking' ? <p style={{ ...bodyStyle, marginTop: 5 }} role="status">{t('checkingCurrentConnection')}</p> : null}
            {proxy.currentProxyCheck.status === 'success' ? <p style={{ ...successStyle, marginTop: 5 }} role="status">{t('currentConnectionHealthy')}</p> : null}
            {proxy.currentProxyCheck.status === 'failed' ? <p style={{ ...errorStyle, marginTop: 5 }} role="status">{t('currentConnectionFailed')}</p> : null}
          </div>
          {proxy.savedProxyUrl === undefined ? null : (
            <div style={{ ...buttonsStyle, flexWrap: 'wrap' }}>
              <button type="button" style={proxyButtonStyle} disabled={proxy.currentProxyCheck.status === 'checking'} onClick={() => { void proxy.checkCurrentProxy() }}>
                {proxy.currentProxyCheck.status === 'checking' ? t('checkingCurrentConnectionButton') : t('checkCurrentConnection')}
              </button>
              <button
                type="button"
                style={{ ...proxyButtonStyle, borderColor: 'transparent', background: 'transparent', color: 'var(--dsw-alias-state-error-primary)' }}
                onClick={onDisableProxy}
              >{t('disableProxy')}</button>
            </div>
          )}
        </div>
      </div>
      <div style={fieldsetStyle}>
        <h4 style={headingStyle}>{t('changeConnection')}</h4>
        <div style={proxyTabsStyle} role="tablist" aria-label={t('proxyConfigurationMethod')}>
          {(['auto', 'manual'] as const).map(mode => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={proxy.proxyMode === mode}
              aria-controls={`openai-codex-proxy-${mode}`}
              tabIndex={proxy.proxyMode === mode ? 0 : -1}
              style={proxy.proxyMode === mode ? activeProxyTabStyle : proxyTabStyle}
              onClick={() => { proxy.setProxyMode(mode) }}
              onKeyDown={event => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
                event.preventDefault()
                const next = event.key === 'ArrowRight' || event.key === 'End' ? 'manual' : 'auto'
                proxy.setProxyMode(next)
                document.getElementById(`openai-codex-proxy-${next}-tab`)?.focus()
              }}
              id={`openai-codex-proxy-${mode}-tab`}
            >{mode === 'auto' ? t('automaticDetection') : t('manualEntry')}</button>
          ))}
        </div>
        <div
          id="openai-codex-proxy-auto"
          role="tabpanel"
          aria-labelledby="openai-codex-proxy-auto-tab"
          hidden={proxy.proxyMode !== 'auto'}
          style={{ ...fieldsetStyle, display: proxy.proxyMode === 'auto' ? fieldsetStyle.display : 'none' }}
        >
          <div style={actionsStyle}>
            <p style={bodyStyle}>{t('automaticDetectionHelp')}</p>
            <button type="button" style={proxyButtonStyle} onClick={() => { void proxy.detectProxy() }} disabled={proxy.proxyDetection.status === 'detecting'}>
              {proxy.proxyDetection.status === 'detecting' ? t('detectingProxy') : t('scanLocalProxy')}
            </button>
          </div>
          {proxy.proxyDetection.status === 'candidate' ? (
            <div style={fieldsetStyle} role="status">
              <p style={bodyStyle}>{t('proxyCandidatesFound')}</p>
              {proxy.proxyDetection.candidates.map(candidate => {
                const normalized = normalizeOpenAICodexProxyUrl(candidate.proxyUrl)
                const current = normalized !== undefined && proxy.savedProxyUrl === normalized
                const selected = !current && normalized !== undefined && proxy.draftProxyUrl === normalized
                return (
                  <div key={candidate.proxyUrl} style={candidateStyle}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                      <code style={{ ...modelIdStyle, overflowWrap: 'anywhere' }}>{candidate.proxyUrl}</code>
                      <span style={successStyle}>{t('proxyCandidateHealthy')}</span>
                    </div>
                    {current || selected
                      ? <span style={statePillStyle}>{current ? t('currentProxy') : t('selectedProxy')}</span>
                      : <button type="button" style={primaryProxyButtonStyle} onClick={() => { proxy.useProxy(candidate.proxyUrl) }}>{t('useThisProxy')}</button>}
                  </div>
                )
              })}
            </div>
          ) : null}
          {proxy.proxyDetection.status === 'failed' ? (
            <div style={candidateStyle} role="alert">
              <div>
                <p style={errorStyle}>{t('proxyDetectionFailedTitle')}</p>
                <p style={{ ...bodyStyle, marginTop: 3 }}>{t('proxyDetectionFailed')}</p>
              </div>
            </div>
          ) : null}
        </div>
        <div
          id="openai-codex-proxy-manual"
          role="tabpanel"
          aria-labelledby="openai-codex-proxy-manual-tab"
          hidden={proxy.proxyMode !== 'manual'}
          style={{ ...fieldsetStyle, display: proxy.proxyMode === 'manual' ? fieldsetStyle.display : 'none' }}
        >
          <p style={bodyStyle}>{t('manualProxyHelp')}</p>
          <label style={formFieldStyle}>
            <span style={labelStyle}>{t('proxyAddress')}</span>
            <input
              style={{ ...controlStyle, minHeight: 44 }}
              value={proxy.manualProxyUrl}
              aria-invalid={proxy.manualProxyEntered && proxy.normalizedManualProxy === undefined}
              onChange={event => { proxy.handleManualProxyInput(event.currentTarget.value) }}
            />
          </label>
          <div style={{ ...buttonsStyle, flexWrap: 'wrap' }}>
            <button type="button" style={proxyButtonStyle} disabled={proxy.normalizedManualProxy === undefined || proxy.manualProbeBusy} onClick={() => { void proxy.testManualProxy() }}>
              {proxy.manualProbeBusy ? t('testingProxy') : t('testProxy')}
            </button>
            {proxy.manualProxyIsCurrent || proxy.manualProxyIsSelected
              ? <span style={statePillStyle}>{proxy.manualProxyIsCurrent ? t('currentProxy') : t('selectedProxy')}</span>
              : <button type="button" style={primaryProxyButtonStyle} disabled={!proxy.testedManualProxy} onClick={() => { proxy.useProxy(proxy.manualProxyUrl) }}>{t('useThisProxy')}</button>}
          </div>
          {proxy.manualProbe === undefined ? null : (
            <p style={proxy.manualProbe.reachable ? successStyle : errorStyle} role="status">
              {proxy.manualProbe.reachable ? t('proxyTestSucceeded', { status: proxy.manualProbe.status ?? proxy.manualProbe.classification }) : t('proxyTestFailed', { reason: proxy.manualProbe.classification })}
            </p>
          )}
          {proxy.manualProxyEntered && proxy.normalizedManualProxy === undefined ? <p style={errorStyle} role="alert">{t('invalidProxyUrl')}</p> : null}
          {proxy.normalizedManualProxy !== undefined && !proxy.manualProxyIsCurrent && !proxy.manualProxyIsSelected && !proxy.testedManualProxy ? <p style={bodyStyle}>{t('proxyTestRequired')}</p> : null}
        </div>
      </div>
      {proxy.proxyDraftChanged ? <p style={pendingStyle} role="status">{draft.enableProxy ? t('pendingProxy', { proxyUrl: draft.proxyUrl }) : t('pendingDirect')}</p> : null}
    </div>
  )
}
