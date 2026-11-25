/** Shared image tool card layout, prompt copy panel, and follow-up edit form. */

import { useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import {
  IconCheckOutlineRegular,
  IconCopyOutlineRegular,
  writeClipboard,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ImageInputRef } from '../../shared/images/contract.ts'
import type { ImagePresentationMeta } from '../../shared/images/presentation.ts'
import type { OpenAICodexSettingsKey } from '../locales/index.ts'
import { imageRequestFollowUp } from './presentation.ts'
import { imageActionStyle } from './CodexImageDownload.tsx'

export const imageShellStyle: CSSProperties = { containerType: 'inline-size', padding: 12, border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 10, background: 'var(--dsw-alias-bg-module-platform)', color: 'var(--dsw-alias-label-primary)' }
export const imageDetailStyle: CSSProperties = { color: 'var(--dsw-alias-label-tertiary)', fontSize: 13, lineHeight: '18px' }
export const imageActionRowStyle: CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }

const promptText: CSSProperties = { boxSizing: 'border-box', width: '100%', maxHeight: 96, margin: 0, overflowY: 'auto', padding: '10px 42px 10px 12px', color: 'var(--dsw-alias-label-secondary)', fontFamily: 'var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)', fontSize: 12, lineHeight: '18px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', userSelect: 'text' }
const layoutStyle: CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 14, minWidth: 0 }
const visualStyle: CSSProperties = { display: 'grid', alignContent: 'start', flex: '1 1 240px', maxWidth: 320, gap: 10, minWidth: 0 }
const sideStyle: CSSProperties = { display: 'grid', alignContent: 'start', flex: '2 1 280px', gap: 10, minWidth: 0 }
const promptPanelStyle: CSSProperties = { display: 'grid', alignContent: 'start', gap: 10, minWidth: 0 }
const promptLabelStyle: CSSProperties = { fontSize: 13, fontWeight: 600, lineHeight: '18px', color: 'var(--dsw-alias-label-primary)' }
const promptBlockStyle: CSSProperties = { position: 'relative', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, background: 'var(--dsw-alias-bg-base)' }
const copyButtonStyle: CSSProperties = { position: 'absolute', zIndex: 1, top: 7, right: 7, display: 'grid', placeItems: 'center', width: 28, height: 28, padding: 0, border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 7, color: 'var(--dsw-alias-label-secondary)', background: 'var(--dsw-alias-bg-layer-1)', cursor: 'pointer', transition: 'opacity 120ms ease' }
const tooltipStyle: CSSProperties = { position: 'absolute', zIndex: 100, top: -8, right: 0, transform: 'translateY(-100%)', width: 'max-content', maxWidth: 'min(260px, 50vw)', padding: '3px 7px', borderRadius: 8, background: 'var(--dsw-alias-tooltip-bg)', color: 'var(--dsw-static-neutral-bluish-00)', fontSize: 13, lineHeight: '20px', whiteSpace: 'pre-line', overflowWrap: 'break-word', pointerEvents: 'none' }

export interface ImageEditActions {
  pending: 'cancel' | 'follow-up' | null
  followUp: (text: string) => Promise<boolean>
}

export function ActionError({ visible, t }: { visible: boolean; t: Translate<OpenAICodexSettingsKey> }) {
  return visible ? <span role="status" style={imageDetailStyle}>{t('actionFailed')}</span> : null
}

export function ResponsiveCard({ visual, side, label }: { visual: ReactNode; side?: ReactNode; label: string }) {
  return <section style={imageShellStyle} aria-label={label}>
    <div style={layoutStyle} data-testid="image-generation-layout" data-responsive-layout="visual-prompt">
      <div style={side === undefined ? { ...visualStyle, maxWidth: 'none' } : visualStyle} data-testid="image-generation-visual">{visual}</div>
      {side === undefined ? null : <div style={sideStyle} data-testid="image-generation-prompt">{side}</div>}
    </div>
  </section>
}

export function PromptPanel({ prompt, t }: { prompt: string; t: Translate<OpenAICodexSettingsKey> }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [hoverless, setHoverless] = useState(false)
  const [tooltipVisible, setTooltipVisible] = useState(false)
  const tooltipId = useId()
  useEffect(() => {
    if (copyState === 'idle') return
    const timer = window.setTimeout(() => { setCopyState('idle') }, 2_000)
    return () => { window.clearTimeout(timer) }
  }, [copyState])
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(hover: none)')
    const update = () => { setHoverless(query.matches) }
    update()
    query.addEventListener('change', update)
    return () => { query.removeEventListener('change', update) }
  }, [])

  async function copy(): Promise<void> {
    setCopyState(await writeClipboard(prompt) ? 'copied' : 'failed')
  }

  const copyLabel = copyState === 'copied' ? t('promptCopied') : copyState === 'failed' ? t('promptCopyFailed') : t('copyPrompt')
  const showCopy = hovered || focused || hoverless || copyState !== 'idle'
  return <section style={promptPanelStyle} aria-label={t('promptLabel')}>
    <strong style={promptLabelStyle}>{t('promptLabel')}</strong>
    <div
      style={promptBlockStyle}
      onMouseEnter={() => { setHovered(true) }}
      onMouseLeave={() => { setHovered(false) }}
      onFocusCapture={() => { setFocused(true) }}
      onBlurCapture={() => { setFocused(false) }}
    >
      <button
        type="button"
        style={{ ...copyButtonStyle, opacity: showCopy ? 1 : 0 }}
        aria-label={copyLabel}
        aria-describedby={tooltipVisible ? tooltipId : undefined}
        data-copy-state={copyState}
        onMouseEnter={() => { setTooltipVisible(true) }}
        onMouseLeave={() => { setTooltipVisible(false) }}
        onFocus={() => { setTooltipVisible(true) }}
        onBlur={() => { setTooltipVisible(false) }}
        onClick={() => { void copy() }}
      >
        {copyState === 'copied' ? <IconCheckOutlineRegular size={16} /> : <IconCopyOutlineRegular size={16} />}
      </button>
      {tooltipVisible ? <span id={tooltipId} role="tooltip" style={tooltipStyle}>{copyLabel}</span> : null}
      <pre style={promptText} tabIndex={0}>{prompt}</pre>
    </div>
    <span role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }}>{copyState === 'idle' ? '' : copyLabel}</span>
  </section>
}

export function ImageEditForm({ decoded, actions, onClose, t }: {
  decoded: ImagePresentationMeta
  actions: ImageEditActions
  onClose: () => void
  t: Translate<OpenAICodexSettingsKey>
}) {
  const [selected, setSelected] = useState(decoded.images.length === 1 ? '0' : '')
  const [instructions, setInstructions] = useState('')
  const [allowPreview, setAllowPreview] = useState(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const image = selected === '' ? undefined : decoded.images[Number(selected)]
  const previewOnly = image !== undefined && image.original === undefined
  const ready = image !== undefined && instructions.trim().length > 0 && (!previewOnly || allowPreview)

  async function send(): Promise<void> {
    if (!ready || image === undefined || actions.pending !== null || (image.original === undefined && image.preview === undefined)) return
    const target: ImageInputRef = image.original === undefined
      ? { attachmentId: String(image.preview!.attachmentId), usePreview: true }
      : { assetId: image.original.assetId }
    const accepted = await actions.followUp(imageRequestFollowUp({ operation: 'edit', prompt: instructions.trim(), edit: { target, references: [] } }))
    if (accepted && mounted.current) onClose()
  }

  return <form aria-label={t('editImage')} style={{ display: 'grid', gap: 8 }} onSubmit={event => { event.preventDefault(); void send() }}>
    <label style={imageDetailStyle}>{t('editTarget')}
      <select
        aria-label={t('editTarget')}
        value={selected}
        disabled={actions.pending !== null}
        style={{ display: 'block', width: '100%', maxWidth: '100%', minHeight: 32 }}
        onChange={event => { setSelected(event.currentTarget.value); setAllowPreview(false) }}
      >
        {decoded.images.length > 1 ? <option value="">{t('selectEditTarget')}</option> : null}
        {decoded.images.map((item, index) => (
          <option key={`${item.original?.assetId ?? item.preview?.attachmentId}:${index}`} value={String(index)}>
            {String(index + 1)}. {item.original?.name ?? item.preview?.name ?? t('image')}
          </option>
        ))}
      </select>
    </label>
    <label style={imageDetailStyle}>{t('editInstructions')}
      <textarea
        aria-label={t('editInstructions')}
        value={instructions}
        maxLength={30_000}
        rows={3}
        style={{ boxSizing: 'border-box', display: 'block', width: '100%', resize: 'vertical', font: 'inherit' }}
        disabled={actions.pending !== null}
        onChange={event => { setInstructions(event.currentTarget.value) }}
      />
    </label>
    {previewOnly ? <>
      <span role="status" style={imageDetailStyle}>{t('previewEditNotice')}</span>
      <label style={imageDetailStyle}>
        <input type="checkbox" checked={allowPreview} disabled={actions.pending !== null} onChange={event => { setAllowPreview(event.currentTarget.checked) }} />
        {t('choosePreviewEdit')}
      </label>
    </> : null}
    <div style={imageActionRowStyle}>
      <button type="submit" style={imageActionStyle} disabled={!ready || actions.pending !== null}>
        {actions.pending === null ? t('submitImageEdit') : t('actionSending')}
      </button>
      <button type="button" style={imageActionStyle} disabled={actions.pending !== null} onClick={onClose}>
        {t('cancelImageEdit')}
      </button>
    </div>
  </form>
}
