/** Explicit, nonpersistent Standard/Fast conversation speed control. */
import { useEffect, useRef, useState } from 'react'
import { Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import { OPENAI_CODEX_SPEED_MODE_PATH, readConversationSpeed } from '../../shared/models.ts'
import type { ConversationSpeedState, OpenAICodexSpeedMode } from '../../shared/models.ts'
import type { OpenAICodexSettingsKey } from '../locales/index.ts'
import { requestJson } from '../shared/request-json.ts'

type Translate = (key: OpenAICodexSettingsKey) => string
const SPEED_MODES = ['standard', 'fast'] as const
const SPEED_ACTIVE_COLOR = '#f97316'

/** Compact bolt button that anchors a Standard/Fast menu above the Composer row. */
export function OpenAICodexSpeedControl({ sessionId, model, t, selectionPending = false }: {
  sessionId: string; model: string; t: Translate; selectionPending?: boolean
}) {
  const [selection, setSelection] = useState<ConversationSpeedState>()
  const [status, setStatus] = useState<'loading' | 'ready' | 'unconfirmed'>('loading')
  const [readAttempt, setReadAttempt] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const controller = useRef<AbortController | undefined>(undefined)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (selectionPending) {
      controller.current?.abort()
      controller.current = undefined
      setMenuOpen(false)
      return
    }
    const abort = new AbortController()
    controller.current = abort
    setStatus('loading')
    void requestJson(`${OPENAI_CODEX_SPEED_MODE_PATH}?sessionId=${encodeURIComponent(sessionId)}&model=${encodeURIComponent(model)}`, {
      method: 'GET', credentials: 'same-origin', headers: { accept: 'application/json' }, signal: abort.signal,
    }).then(({ response, value }) => {
      if (abort.signal.aborted) return
      const next = response.ok ? readConversationSpeed(value, model) : undefined
      setSelection(next)
      setStatus(next === undefined ? 'unconfirmed' : 'ready')
    }).catch(() => { if (!abort.signal.aborted) setStatus('unconfirmed') })
      .finally(() => { if (controller.current === abort) controller.current = undefined })
    return () => { abort.abort(); if (controller.current === abort) controller.current = undefined }
  }, [sessionId, model, readAttempt, selectionPending])

  useEffect(() => () => { controller.current?.abort() }, [])

  const select = (mode: OpenAICodexSpeedMode): void => {
    if (selectionPending || status !== 'ready' || selection === undefined || controller.current !== undefined) return
    const abort = new AbortController()
    controller.current = abort
    setStatus('loading')
    void requestJson(OPENAI_CODEX_SPEED_MODE_PATH, {
      method: 'POST', credentials: 'same-origin', headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, model, generation: selection.generation, revision: selection.revision, mode }), signal: abort.signal,
    }).then(({ response, value }) => {
      if (abort.signal.aborted) return
      const next = response.ok ? readConversationSpeed(value, model) : undefined
      if (next !== undefined && next.mode === mode) { setSelection(next); setStatus('ready') }
      else setStatus('unconfirmed')
    }).catch(() => { if (!abort.signal.aborted) setStatus('unconfirmed') })
      .finally(() => { if (controller.current === abort) controller.current = undefined })
  }

  const closeMenu = (): void => { setMenuOpen(false) }
  const openMenu = (): void => {
    if (selectionPending || status !== 'ready') return
    setMenuOpen(true)
  }

  const choose = (mode: OpenAICodexSpeedMode): void => {
    closeMenu()
    buttonRef.current?.focus()
    select(mode)
  }

  const onRowKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, mode: OpenAICodexSpeedMode): void => {
    if (event.key === 'Tab') {
      event.preventDefault(); event.stopPropagation()
      closeMenu(); buttonRef.current?.focus()
      return
    }
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(mode) }
  }

  const onButtonKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    if (selectionPending || status !== 'ready') return
    event.preventDefault()
    if (!menuOpen) openMenu()
  }

  const busy = status === 'loading' || selectionPending
  const currentMode = status === 'ready' ? selection?.mode : undefined
  const active = currentMode === 'fast'
  const label = busy
    ? t('speedLoading')
    : status === 'unconfirmed'
      ? t('speedRecover')
      : active
        ? t('speedMenuFastTitle')
        : t('speedMenuStandardTitle')

  return <span style={{ display: 'inline-flex', position: 'relative' }}>
    <Menu open={!selectionPending && menuOpen && status === 'ready' && selection !== undefined} onClose={closeMenu}
      portal align="end" side="top" autoFocus
      anchor={<button type="button" ref={buttonRef}
        data-openai-codex-speed-menu={currentMode ?? status}
        aria-label={label} title={label}
        aria-pressed={active} aria-busy={busy}
        aria-haspopup="menu" aria-expanded={menuOpen && !selectionPending}
        disabled={busy}
        onClick={() => {
          if (status === 'unconfirmed') { setReadAttempt(attempt => attempt + 1); return }
          if (menuOpen) closeMenu()
          else openMenu()
        }}
        onKeyDown={onButtonKeyDown}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 30, height: 30, padding: 0, border: 0, borderRadius: 8,
          background: 'transparent',
          color: active ? SPEED_ACTIVE_COLOR : 'var(--dsw-alias-label-secondary)',
          cursor: busy ? 'default' : 'pointer',
          opacity: busy ? 0.6 : 1,
        }}>
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            data-openai-codex-speed-bolt={active ? 'filled' : 'outline'}
            d="M13.1 2.75 5.35 13.1h5.8l-.95 8.15 8.45-11.2h-5.9l.35-7.3Z"
            fill={active ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      </button>}>
    {selection !== undefined && SPEED_MODES.map(mode => {
      const checked = selection.mode === mode
      return <button key={mode} type="button" role="menuitemradio"
        data-speed-mode={mode}
        aria-checked={checked}
        onClick={() => { choose(mode) }}
        onKeyDown={event => { onRowKeyDown(event, mode) }}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          width: '100%', padding: '6px 8px', border: 0, borderRadius: 6,
          background: 'transparent',
          color: checked ? SPEED_ACTIVE_COLOR : 'inherit',
          fontSize: 12, lineHeight: '18px', textAlign: 'left',
          cursor: 'pointer',
        }}>
        <span aria-hidden="true" style={{ width: 14, display: 'inline-block', textAlign: 'center' }}>{checked ? '✓' : ''}</span>
        {mode === 'standard' ? t('speedStandard') : t('speedFast')}
      </button>
    })}
    </Menu>
    <span role="status" data-openai-codex-speed-status={status} style={{
      position: 'absolute', width: 1, height: 1, margin: -1, padding: 0, overflow: 'hidden',
      clip: 'rect(0 0 0 0)', clipPath: 'inset(50%)', whiteSpace: 'nowrap', border: 0,
    }}>{label}</span>
  </span>
}
