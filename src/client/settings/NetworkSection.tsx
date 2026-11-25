/** Compact single-card HTTP(S) proxy configuration with optional scan and probe. */

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
  bodyStyle,
  buttonsStyle,
  errorStyle,
  labelStyle,
  monoStyle,
  rowStyle,
  subPanelStyle,
  successStyle,
} from './styles.ts'

export type ProxyScanState =
  | { status: 'idle' }
  | { status: 'scanning' }
  | { status: 'found'; candidates: readonly OpenAICodexProxyProbeResult[] }
  | { status: 'empty' }

type ProxyDetectionResponse = {
  candidates: readonly OpenAICodexProxyProbeResult[]
  results: readonly OpenAICodexProxyProbeResult[]
}

export function useProxyTools(options: {
  scope: ConfigForm<OpenAICodexSettingsConfig> | undefined
  enableProxy: boolean | undefined
  proxyUrl: string | undefined
}) {
  const { scope, enableProxy, proxyUrl } = options
  const [scan, setScan] = useState<ProxyScanState>({ status: 'idle' })
  const [probe, setProbe] = useState<OpenAICodexProxyProbeResult | undefined>()
  const [probeBusy, setProbeBusy] = useState(false)
  const scanController = useRef<AbortController | undefined>(undefined)
  const probeController = useRef<AbortController | undefined>(undefined)
  const scanSeq = useRef(0)
  const probeSeq = useRef(0)

  const clearProbe = useCallback((): void => {
    probeController.current?.abort()
    probeSeq.current += 1
    setProbeBusy(false)
    setProbe(undefined)
  }, [])

  const reset = useCallback((): void => {
    scanController.current?.abort()
    scanSeq.current += 1
    setScan({ status: 'idle' })
    clearProbe()
  }, [clearProbe])

  useEffect(() => {
    if (!enableProxy) reset()
  }, [enableProxy, reset])

  useEffect(() => {
    clearProbe()
  }, [proxyUrl, clearProbe])

  useEffect(() => {
    reset()
    return () => {
      scanController.current?.abort()
      probeController.current?.abort()
      scanSeq.current += 1
      probeSeq.current += 1
    }
  }, [scope, reset])

  const scanLocal = async (): Promise<void> => {
    scanController.current?.abort()
    const controller = new AbortController()
    scanController.current = controller
    const seq = ++scanSeq.current
    setScan({ status: 'scanning' })
    try {
      const { response, value: payload } = await requestJson(OPENAI_CODEX_PROXY_DETECT_PATH, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(`proxy detection failed: ${String(response.status)}`)
      const value = payload as ProxyDetectionResponse
      if (!Array.isArray(value.candidates)) throw new Error('invalid proxy detection response')
      if (seq !== scanSeq.current) return
      setScan(value.candidates.length > 0 ? { status: 'found', candidates: value.candidates } : { status: 'empty' })
    } catch {
      if (seq === scanSeq.current) setScan({ status: 'empty' })
    }
  }

  const testProxy = async (rawUrl: string): Promise<void> => {
    const normalized = normalizeOpenAICodexProxyUrl(rawUrl)
    if (normalized === undefined) return
    probeController.current?.abort()
    const controller = new AbortController()
    probeController.current = controller
    const seq = ++probeSeq.current
    setProbeBusy(true)
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
      if (seq === probeSeq.current) setProbe(result)
    } catch {
      if (seq === probeSeq.current) setProbe({ proxyUrl: normalized, reachable: false, classification: 'connect-failure' })
    } finally {
      if (seq === probeSeq.current) setProbeBusy(false)
    }
  }

  return { scan, probe, probeBusy, scanLocal, testProxy, clearProbe, reset }
}

export type ProxyToolsState = ReturnType<typeof useProxyTools>

export interface ProxyCardProps {
  draft: OpenAICodexSettingsConfig
  proxy: ProxyToolsState
  t: OpenAICodexTranslate
  onUpdate: <Key extends keyof OpenAICodexSettingsConfig>(
    field: Key,
    value: OpenAICodexSettingsConfig[Key],
  ) => void
}

/** Single-card dedicated proxy toggle with inline URL input, local scan, and probe. */
export function ProxyCard({ draft, proxy, t, onUpdate }: ProxyCardProps) {
  const normalized = normalizeOpenAICodexProxyUrl(draft.proxyUrl)
  const invalidUrl = draft.enableProxy && normalized === undefined

  return (
    <div className="cc-card" role="group" aria-label={t('networkHeading')}>
      <h3 className="cc-card-title">{t('networkHeading')}</h3>
      <label className="cc-row" style={{ cursor: 'pointer', borderBottom: 0, paddingBottom: 0 }}>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span style={labelStyle}>{t('enableProxy')}</span>
          <span style={bodyStyle}>{t('enableProxyHelp')}</span>
        </span>
        <input
          type="checkbox"
          className="cc-switch"
          checked={draft.enableProxy}
          onChange={event => {
            onUpdate('enableProxy', event.currentTarget.checked)
            if (!event.currentTarget.checked) proxy.reset()
          }}
        />
      </label>
      {draft.enableProxy ? (
        <div style={subPanelStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="text"
              className="cc-input"
              style={{ flex: '1 1 220px', minWidth: 0 }}
              aria-label={t('proxyAddress')}
              placeholder="http://127.0.0.1:7890"
              value={draft.proxyUrl}
              aria-invalid={invalidUrl}
              onChange={event => { onUpdate('proxyUrl', event.currentTarget.value) }}
            />
            <div style={buttonsStyle}>
              <button
                type="button"
                className="cc-btn"
                disabled={proxy.scan.status === 'scanning'}
                onClick={() => { void proxy.scanLocal() }}
              >
                {proxy.scan.status === 'scanning' ? t('detectingProxy') : t('scanLocalProxy')}
              </button>
              <button
                type="button"
                className="cc-btn"
                disabled={normalized === undefined || proxy.probeBusy}
                onClick={() => { void proxy.testProxy(draft.proxyUrl) }}
              >
                {proxy.probeBusy ? t('testingProxy') : t('testProxy')}
              </button>
            </div>
          </div>
          {invalidUrl ? <p style={errorStyle} role="alert">{t('invalidProxyUrl')}</p> : null}
          {proxy.probe === undefined ? null : (
            <p style={proxy.probe.reachable ? successStyle : errorStyle} role="status">
              {proxy.probe.reachable
                ? t('proxyTestSucceeded', { status: proxy.probe.status ?? proxy.probe.classification })
                : t('proxyTestFailed', { reason: proxy.probe.classification })}
            </p>
          )}
          {proxy.scan.status === 'found' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} role="status">
              <span style={bodyStyle}>{t('proxyCandidatesFound')}</span>
              {proxy.scan.candidates.map(candidate => {
                const selected = normalized !== undefined && normalized === normalizeOpenAICodexProxyUrl(candidate.proxyUrl)
                return (
                  <div key={candidate.proxyUrl} style={{ ...rowStyle, padding: '6px 8px', borderRadius: 6, background: 'var(--dsw-alias-bg-layer-1)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <code style={{ ...monoStyle, overflowWrap: 'anywhere' }}>{candidate.proxyUrl}</code>
                      <span style={successStyle}>{t('proxyCandidateHealthy')}</span>
                    </span>
                    <button
                      type="button"
                      className="cc-btn"
                      disabled={selected}
                      onClick={() => { onUpdate('proxyUrl', candidate.proxyUrl) }}
                    >
                      {selected ? t('selectedProxy') : t('useThisProxy')}
                    </button>
                  </div>
                )
              })}
            </div>
          ) : null}
          {proxy.scan.status === 'empty' ? <p style={errorStyle} role="alert">{t('proxyDetectionFailed')}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
