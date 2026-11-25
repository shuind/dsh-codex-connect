/** Native browser view for Codex image-generation tool results. */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { CSSProperties } from 'react'
import type { PromptContentPart } from '@deepseek-ai/dsh-api-remotes/client'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { PropsRuntime, Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import { safeImageFailure } from '../../shared/images/errors.ts'
import type { ImagePresentationMeta } from '../../shared/images/presentation.ts'
import type { OpenAICodexSettingsKey } from '../locales/index.ts'
import type { OpenAICodexConfigForm } from '../shared/config-form.ts'
import { imagePresentationForResult, promptForImageToolBlock, imageRequestForToolBlock, imageRequestFollowUp } from './presentation.ts'
import { CodexImageGallery } from './CodexImageGallery.tsx'
import type { CodexImageGalleryLabels } from './CodexImageGallery.tsx'
import {
  DownloadButton,
  downloadOriginal,
  formatBytes,
  formatMediaType,
  imageActionStyle,
  imageInputLabel,
  triggerDownload,
  useImageLoader,
} from './CodexImageDownload.tsx'
import {
  ActionError,
  ImageEditForm,
  PromptPanel,
  ResponsiveCard,
  imageActionRowStyle,
  imageDetailStyle,
  imageShellStyle,
} from './CodexImageEditForm.tsx'

export interface CodexImageToolViewInjected {
  sessions: ISessions
  configScope?: Pick<OpenAICodexConfigForm, 'getSnapshot' | 'subscribe'>
}

type ImageToolRuntime = PropsRuntime<'tool.call.toolview'>
export type CodexImageToolViewProps = Omit<ImageToolRuntime, 'phase' | 'block'> & {
  block: ImageToolRuntime['block']
} & CodexImageToolViewInjected & { t: Translate<OpenAICodexSettingsKey> }

const headerStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }
const progressStyle: CSSProperties = { width: '100%', height: 4, accentColor: 'var(--dsw-alias-brand-primary)' }

type SessionAction = 'cancel' | 'follow-up'

function contentText(content: readonly unknown[]): string | undefined {
  for (const block of content) {
    if (typeof block === 'object' && block !== null && (block as { type?: unknown }).type === 'text'
      && typeof (block as { text?: unknown }).text === 'string') return (block as { text: string }).text
  }
  return undefined
}

function imageActionsEnabled(scope: CodexImageToolViewInjected['configScope']): boolean {
  return scope === undefined || scope.getSnapshot().value?.enableImageGeneration === true
}

function useImageActionsEnabled(scope: CodexImageToolViewInjected['configScope']): boolean {
  const source = useMemo(() => ({
    subscribe: (listener: () => void) => scope?.subscribe(listener) ?? (() => {}),
    getSnapshot: () => imageActionsEnabled(scope),
  }), [scope])
  return useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot)
}

function useSessionActions(sessionId: string, sessions: ISessions, configScope?: CodexImageToolViewInjected['configScope']) {
  const [pending, setPending] = useState<SessionAction | null>(null)
  const pendingRef = useRef(false)
  const [failed, setFailed] = useState(false)
  const alive = useRef(true)
  const activeSession = useRef(sessionId)
  activeSession.current = sessionId
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const run = useCallback(async (actionName: SessionAction, content?: PromptContentPart[]): Promise<boolean> => {
    if (pendingRef.current || (actionName === 'follow-up' && !imageActionsEnabled(configScope))) return false
    const binding = sessions.binding(sessionId as Parameters<ISessions['binding']>[0])
    if (binding === undefined) {
      setFailed(true)
      return false
    }
    pendingRef.current = true
    setFailed(false)
    setPending(actionName)
    try {
      const result = actionName === 'cancel'
        ? await binding.session.cancel()
        : await binding.session.prompt(content ?? [], 'queue')
      const accepted = result.ok
      if (alive.current) {
        setPending(null)
        setFailed(activeSession.current === sessionId && !accepted)
      }
      return accepted && alive.current && activeSession.current === sessionId
    } catch {
      if (alive.current) {
        setPending(null)
        setFailed(activeSession.current === sessionId)
      }
      return false
    } finally {
      pendingRef.current = false
    }
  }, [sessionId, sessions, configScope])

  const cancel = useCallback(() => run('cancel'), [run])
  const followUp = useCallback((text: string) => run('follow-up', [{ type: 'text', text }]), [run])
  return { pending, failed, cancel, followUp }
}

function galleryLabelsFor(t: Translate<OpenAICodexSettingsKey>): CodexImageGalleryLabels {
  return {
    image: t('image'),
    open: t('open'),
    openNamed: label => t('openNamed', { name: label }),
    loading: t('loading'),
    loadFailed: t('loadFailed'),
    lightbox: {
      dialog: t('lightboxDialog'),
      close: t('lightboxClose'),
      zoomIn: t('lightboxZoomIn'),
      zoomOut: t('lightboxZoomOut'),
      reset: t('lightboxReset'),
    },
  }
}

function errorState(block: Extract<CodexImageToolViewProps['block'], { kind: 'tool-result' }>, t: Translate<OpenAICodexSettingsKey>) {
  const code = block.error?.code
  const canceled = code === 'ABORTED' || code === 'ABORTED_BEFORE_DISPATCH' || code === 'TOOL_ABORTED'
  if (canceled) return { title: t('canceled'), detail: t('canceledDetail'), retryable: true, recovery: undefined }
  const safe = safeImageFailure(block.content)
  const reauth = code === 'OPENAI_CODEX_REAUTH_REQUIRED' || safe?.recovery === 'account'
  return {
    title: t('failed'),
    detail: reauth ? t('reauthRequired') : safe?.message ?? t('imageUnknownFailure'),
    retryable: !reauth && (safe?.retryable ?? true),
    recovery: safe?.recovery,
  }
}

export function CodexImageToolView({ block, sessionId, t, sessions, configScope }: CodexImageToolViewProps) {
  const load = useImageLoader(sessionId, sessions)
  const actionsEnabled = useImageActionsEnabled(configScope)
  const sessionActions = useSessionActions(sessionId, sessions, configScope)
  const galleryLabels = useMemo(() => galleryLabelsFor(t), [t])
  const prompt = promptForImageToolBlock(block)
  const request = imageRequestForToolBlock(block)
  const decoded = useMemo(() => 'kind' in block ? imagePresentationForResult(block) : undefined, [block])

  if (!('kind' in block)) {
    const busyTitle = t(request?.operation === 'edit' ? 'imageEditing' : 'generating')
    return <ResponsiveCard
      label={busyTitle}
      visual={<div style={{ display: 'grid', gap: 10 }}>
        <div style={headerStyle}><strong>{busyTitle}</strong></div>
        <progress style={progressStyle} aria-label={busyTitle} />
        <div style={imageDetailStyle}>{t('generatingDetail')}</div>
        <div style={imageActionRowStyle}>
          <button type="button" style={imageActionStyle} disabled={sessionActions.pending !== null} aria-busy={sessionActions.pending === 'cancel'} onClick={() => { void sessionActions.cancel() }}>
            {sessionActions.pending === 'cancel' ? t('cancelingGeneration') : t('cancelGeneration')}
          </button>
          <ActionError visible={sessionActions.failed} t={t} />
        </div>
      </div>}
      side={prompt === undefined ? undefined : <PromptPanel prompt={prompt} t={t} />}
    />
  }

  if (block.isError) {
    const state = errorState(block, t)
    return <ResponsiveCard
      label={state.title}
      visual={<div role="status" style={{ display: 'grid', gap: 10 }}>
        <strong>{state.title}</strong>
        {state.detail === undefined ? null : <span style={imageDetailStyle}>{state.detail}</span>}
        {contentText(block.content)?.includes('may still be processing') === true ? <span style={imageDetailStyle}>{t('imageRequestUncertain')}</span> : null}
        {state.recovery === 'input' ? <span style={imageDetailStyle}>{t('imageInputRecovery')}</span> : null}
        {state.recovery === 'storage' ? <span style={imageDetailStyle}>{t('imageStorageRecovery')}</span> : null}
        {request === undefined || !actionsEnabled || !state.retryable ? null : <div style={imageActionRowStyle}>
          <button type="button" style={imageActionStyle} disabled={sessionActions.pending !== null} aria-busy={sessionActions.pending === 'follow-up'} onClick={() => { void sessionActions.followUp(imageRequestFollowUp(request)) }}>
            {sessionActions.pending === 'follow-up' ? t('actionSending') : t(request.operation === 'edit' ? 'retryImageEdit' : 'retryGeneration')}
          </button>
          <ActionError visible={sessionActions.failed} t={t} />
        </div>}
      </div>}
      side={prompt === undefined ? undefined : <PromptPanel prompt={prompt} t={t} />}
    />
  }

  if (decoded === undefined) {
    return <section style={imageShellStyle} role="status"><strong>{t('completed')}</strong><span style={imageDetailStyle}>{t('unknownResult')}</span></section>
  }

  return <ImageResultCard decoded={decoded} sessionId={sessionId} load={load} sessionActions={sessionActions} galleryLabels={galleryLabels} actionsEnabled={actionsEnabled} t={t} />
}

/** Render the same complete result controls in the independent answer tail. */
export function CodexImageTurnResult({ block, sessionId, sessions, t, configScope }: {
  block: Extract<CodexImageToolViewProps['block'], { kind: 'tool-result' }>
  sessionId: CodexImageToolViewProps['sessionId']
  sessions: ISessions
  configScope?: CodexImageToolViewInjected['configScope']
  t: Translate<OpenAICodexSettingsKey>
}) {
  const load = useImageLoader(sessionId, sessions)
  const actionsEnabled = useImageActionsEnabled(configScope)
  const sessionActions = useSessionActions(sessionId, sessions, configScope)
  const galleryLabels = useMemo(() => galleryLabelsFor(t), [t])
  const decoded = useMemo(() => imagePresentationForResult(block), [block])
  if (decoded === undefined) return null
  return <ImageResultCard decoded={decoded} sessionId={sessionId} load={load} sessionActions={sessionActions} galleryLabels={galleryLabels} actionsEnabled={actionsEnabled} t={t} />
}

function ImageResultCard({ decoded, sessionId, load, sessionActions, galleryLabels, actionsEnabled, t }: {
  decoded: ImagePresentationMeta
  sessionId: CodexImageToolViewProps['sessionId']
  load: ReturnType<typeof useImageLoader>
  sessionActions: ReturnType<typeof useSessionActions>
  galleryLabels: CodexImageGalleryLabels
  actionsEnabled: boolean
  t: Translate<OpenAICodexSettingsKey>
}) {
  const [editing, setEditing] = useState(false)
  return <ResponsiveCard
    label={t(decoded.edit === undefined ? 'completed' : 'imageEdited')}
    visual={<>
      <div style={headerStyle}><strong>{t(decoded.edit === undefined ? 'completed' : 'imageEdited')}</strong></div>
      <CodexImageGallery images={decoded.images.flatMap(image => image.preview === undefined ? [] : [{ attachment: image.preview }])} load={load} align="start" labels={galleryLabels} />
      {decoded.images.some(image => image.previewStatus === 'unavailable') ? <span role="status" style={imageDetailStyle}>{t('imagePreviewUnavailable')}</span> : null}
    </>}
    side={<>
      <PromptPanel prompt={decoded.prompt} t={t} />
      <div style={imageActionRowStyle}>
        <button type="button" style={imageActionStyle} disabled={!actionsEnabled || sessionActions.pending !== null} aria-busy={sessionActions.pending === 'follow-up'} onClick={() => { void sessionActions.followUp(imageRequestFollowUp(decoded.edit === undefined
          ? { operation: 'generate', prompt: decoded.prompt }
          : { operation: 'edit', prompt: decoded.prompt, edit: decoded.edit })) }}>
          {sessionActions.pending === 'follow-up' ? t('actionSending') : t(decoded.edit === undefined ? 'regenerate' : 'retryImageEdit')}
        </button>
        <button type="button" style={imageActionStyle} disabled={!actionsEnabled || sessionActions.pending !== null} aria-busy={sessionActions.pending === 'follow-up'} onClick={() => { setEditing(true) }}>
          {sessionActions.pending === 'follow-up' ? t('actionSending') : t('editImage')}
        </button>
        <ActionError visible={sessionActions.failed} t={t} />
      </div>
      {decoded.edit === undefined ? null : <span style={imageDetailStyle}>{t('editFrom', {
        source: imageInputLabel(decoded.edit.target), count: decoded.edit.references.length,
      })}</span>}
      {editing && actionsEnabled ? <ImageEditForm
        key={JSON.stringify([sessionId, decoded.images.map(image => [image.original?.assetId ?? null, image.preview?.attachmentId ?? null])])}
        decoded={decoded}
        actions={sessionActions}
        onClose={() => { setEditing(false) }}
        t={t}
      /> : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{decoded.images.flatMap((image, index) => {
        const preview = image.preview
        const suffix = preview?.name ?? String(index + 1)
        const exactOriginal = image.original
        const original = exactOriginal === undefined ? [] : [<DownloadButton
          key={`${sessionId}:${JSON.stringify(exactOriginal)}:${index}:original`}
          onDownload={signal => downloadOriginal(sessionId, exactOriginal, signal)}
          t={t}
          label={decoded.images.length === 1 ? t('downloadOriginal') : t('downloadOriginalNamed', { name: exactOriginal.name })}
        />]
        if (preview === undefined) return original
        return [...original, <DownloadButton
          key={`${sessionId}:${preview.attachmentId as string}:${index}:preview`}
          onDownload={async signal => {
            const url = await load(preview)
            if (!signal.aborted) triggerDownload(url, preview.name ?? t('image'))
          }}
          t={t}
          label={image.original === undefined
            ? decoded.images.length === 1 ? t('download') : t('downloadNamed', { name: suffix })
            : decoded.images.length === 1 ? t('downloadPreview') : t('downloadPreviewNamed', { name: suffix })}
        />]
      })}</div>
      <details>
        <summary style={{ cursor: 'pointer', color: 'var(--dsw-alias-label-secondary)', fontSize: 13 }}>{t('imageDetails')}</summary>
        <div style={{ ...imageDetailStyle, display: 'grid', gap: 4, marginTop: 6 }}>{decoded.images.flatMap((image, index) => {
          const preview = image.preview
          const original = image.original
          const name = preview?.name ?? String(index + 1)
          if (original === undefined) return preview === undefined ? [] : [<span key={`${preview.attachmentId as string}:${index}`}>{t('imageDetail', { name, format: formatMediaType(preview.mediaType), width: preview.width, height: preview.height, size: formatBytes(preview.bytes) })}</span>]
          return [
            <span key={`${original.assetId}:${index}:original`}>{t('originalImageDetail', { name: original.name, format: formatMediaType(original.mediaType), width: original.width, height: original.height, size: formatBytes(original.bytes) })}</span>,
            preview === undefined ? null : <span key={`${preview.attachmentId as string}:${index}:preview`}>{t('previewImageDetail', { format: formatMediaType(preview.mediaType), width: preview.width, height: preview.height, size: formatBytes(preview.bytes) })}</span>,
          ]
        })}</div>
      </details>
    </>}
  />
}
