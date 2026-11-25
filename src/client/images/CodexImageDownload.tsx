/** Image attachment loader, original asset downloader, and formatting helpers. */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import { openAICodexOriginalImageUrl } from '../../shared/images/contract.ts'
import type { ImageInputRef, OpenAICodexOriginalImageRef } from '../../shared/images/contract.ts'
import type { OpenAICodexSettingsKey } from '../locales/index.ts'
import { requestBody } from '../shared/request-json.ts'

export const imageActionStyle: CSSProperties = { justifySelf: 'start', minHeight: 28, border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 7, padding: '3px 10px', background: 'transparent', color: 'var(--dsw-alias-label-primary)', font: 'inherit', cursor: 'pointer' }
const visuallyHidden: CSSProperties = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 }

type DownloadState = 'idle' | 'pending' | 'failed'

export function triggerDownload(url: string, name: string): void {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.rel = 'noopener'
  document.body.append(anchor)
  try {
    anchor.click()
  } finally {
    anchor.remove()
  }
}

export function DownloadButton({ label, onDownload, t }: {
  label: string
  onDownload: (signal: AbortSignal) => Promise<void>
  t: Translate<OpenAICodexSettingsKey>
}) {
  const [state, setState] = useState<DownloadState>('idle')
  const alive = useRef(true)
  const request = useRef<AbortController | undefined>(undefined)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false; request.current?.abort() }
  }, [])

  async function download(): Promise<void> {
    if (request.current !== undefined) return
    const controller = new AbortController()
    request.current = controller
    setState('pending')
    try {
      await onDownload(controller.signal)
      if (alive.current && !controller.signal.aborted) setState('idle')
    } catch {
      if (alive.current && !controller.signal.aborted) setState('failed')
    } finally {
      if (request.current === controller) request.current = undefined
    }
  }

  const status = state === 'pending' ? t('downloading') : state === 'failed' ? t('downloadFailed') : undefined
  const buttonLabel = status ?? label
  return <>
    <button
      type="button"
      style={imageActionStyle}
      disabled={state === 'pending'}
      aria-busy={state === 'pending'}
      data-download-state={state}
      onClick={() => { void download() }}
    >
      {buttonLabel}
    </button>
    {status === undefined ? null : <span role="status" aria-live="polite" style={visuallyHidden}>{status}</span>}
  </>
}

export async function downloadOriginal(
  sessionId: string,
  original: OpenAICodexOriginalImageRef,
  signal: AbortSignal,
): Promise<void> {
  const { value: blob } = await requestBody(openAICodexOriginalImageUrl(sessionId, original.assetId), {
    method: 'GET',
    headers: { accept: original.mediaType },
    credentials: 'same-origin',
    signal,
  }, async response => {
    if (!response.ok) throw new Error('Original image download failed')
    return response.blob()
  })
  if (signal.aborted) throw signal.reason
  if (blob.size !== original.bytes) throw new Error('Original image download was incomplete')
  const url = URL.createObjectURL(blob)
  try {
    triggerDownload(url, original.name)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1_000) return `${String(bytes)} B`
  if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(bytes < 10_000 ? 1 : 0)} KB`
  return `${(bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 1 : 0)} MB`
}

export function formatMediaType(mediaType: ImageAttachmentRef['mediaType']): string {
  return mediaType === 'image/jpeg' ? 'JPEG' : mediaType.slice('image/'.length).toUpperCase()
}

export function imageInputLabel(input: ImageInputRef): string {
  if ('assetId' in input) return input.assetId
  if ('attachment' in input) return input.attachment.name ?? String(input.attachment.attachmentId)
  return input.attachmentId
}

export function useImageLoader(sessionId: string, sessions: ISessions) {
  const urls = useRef(new Map<string, { sessionId: string; url: string }>())
  const pending = useRef(new Map<string, Promise<string>>())
  const activeSession = useRef(sessionId)
  const disposed = useRef(false)
  activeSession.current = sessionId
  useEffect(() => {
    disposed.current = false
    return () => {
      disposed.current = true
      for (const entry of urls.current.values()) URL.revokeObjectURL(entry.url)
      urls.current.clear()
    }
  }, [])
  useEffect(() => () => {
    for (const [key, entry] of urls.current) {
      if (entry.sessionId !== sessionId) continue
      URL.revokeObjectURL(entry.url)
      urls.current.delete(key)
    }
  }, [sessionId])
  return useCallback(async (attachment: ImageAttachmentRef): Promise<string> => {
    const id = attachment.attachmentId as string
    const key = `${sessionId}\u0000${id}`
    const cached = urls.current.get(key)
    if (cached !== undefined) return cached.url
    const inflight = pending.current.get(key)
    if (inflight !== undefined) return inflight
    const request = (async () => {
      const binding = sessions.binding(sessionId as Parameters<ISessions['binding']>[0])
      if (binding === undefined) throw new Error('Image session is unavailable')
      const result = await binding.session.readAttachment(attachment)
      if (!result.ok || result.value.attachment.attachmentId !== attachment.attachmentId) throw new Error('Image attachment could not be read')
      if (disposed.current || activeSession.current !== sessionId) throw new Error('Image view is no longer active')
      const bytes = result.value.data.slice().buffer as ArrayBuffer
      const url = URL.createObjectURL(new Blob([bytes], { type: result.value.attachment.mediaType }))
      urls.current.set(key, { sessionId, url })
      return url
    })().finally(() => { pending.current.delete(key) })
    pending.current.set(key, request)
    return request
  }, [sessionId, sessions])
}
