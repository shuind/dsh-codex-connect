/** Browser half: OpenAI Codex account management inside Plugin configuration. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-models/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { OPENAI_CODEX_SETTINGS_NAMESPACE } from '../shared/settings.ts'
import type { OpenAICodexSettingsConfig } from '../shared/settings.ts'
import { CODEX_CONNECT_VERSION } from '../version.ts'
import { en, zh } from './locales/index.ts'
import type { OpenAICodexSettingsKey } from './locales/index.ts'
import { OpenAICodexAccountStore } from './shared/account-store.ts'
import { OpenAICodexConfigForm } from './shared/config-form.ts'
import { OpenAICodexUpdateStore } from './shared/update-store.ts'
import {
  OpenAICodexBundleConfig,
  OpenAICodexModelsCard,
  OpenAICodexPluginCard,
} from './settings/OpenAICodexCards.tsx'
import type { OpenAICodexPluginCardInjected } from './settings/OpenAICodexCards.tsx'
import { OpenAICodexQuotaIndicator } from './speed/OpenAICodexQuotaIndicator.tsx'
import type { OpenAICodexQuotaIndicatorInjected } from './speed/OpenAICodexQuotaIndicator.tsx'
import { OpenAICodexFastModeToggle } from './speed/OpenAICodexFastModeToggle.tsx'
import type { OpenAICodexFastModeToggleInjected } from './speed/OpenAICodexFastModeToggle.tsx'
import { CodexImageToolView } from './images/CodexImageToolView.tsx'
import type { CodexImageToolViewInjected } from './images/CodexImageToolView.tsx'
import { CodexImageTurnTail } from './images/CodexImageTurnTail.tsx'
import type { CodexImageTurnTailProps } from './images/CodexImageTurnTail.tsx'
import { OpenAICodexUpdateOverlay } from './notices/OpenAICodexUpdateNotice.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** OpenAI Codex account page copy. */
    'settings.openai-codex': OpenAICodexSettingsKey
  }
}

/** Stable browser-plugin name. */
export const name = 'dsh-codex-connect-client'
/** Client services required by the Plugin configuration contribution. */
export const inject = ['slots', 'locale', 'connection', 'remote', 'remote.session', 'configForms', 'sessions']

/** Register account copy and the OpenAI Codex card under Plugin configuration. */
export function apply(ctx: ClientContext): void {
  const namespace = 'settings.openai-codex'
  const updater = new OpenAICodexUpdateStore(CODEX_CONNECT_VERSION)
  const account = new OpenAICodexAccountStore()
  ctx.effect(() => () => { account.dispose() }, 'dsh-codex-connect: account observation')
  ctx.effect(() => {
    void updater.refresh()
    return () => { updater.dispose() }
  }, 'dsh-codex-connect: update checker')
  ctx.effect(() => ctx.locale.register(namespace, { zh, en }), 'dsh-codex-connect: settings copy')
  const t = ctx.locale.bind(namespace) as OpenAICodexPluginCardInjected['t']
  const configScope = new OpenAICodexConfigForm(
    ctx.configForms.get<OpenAICodexSettingsConfig>(OPENAI_CODEX_SETTINGS_NAMESPACE),
    ctx.configForms.describe(),
  )
  ctx.effect(() => ctx.configForms.whileServed([OPENAI_CODEX_SETTINGS_NAMESPACE], () => {
    const disposers: Array<() => void> = []
    const dispose = (): void => {
      for (const off of disposers.splice(0).reverse()) off()
    }
    try {
      disposers.push(ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
        name: 'settings.plugins.tab',
        id: 'codex-connect',
        order: 40,
        locale: namespace,
        label: () => t('title'),
        inject: (): OpenAICodexPluginCardInjected => ({ t, configScope, updater, account }),
      }, OpenAICodexPluginCard)))
      disposers.push(ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
        name: 'plugins.bundle.config',
        key: '@shuind/dsh-codex-connect',
        locale: namespace,
        inject: (): OpenAICodexPluginCardInjected => ({ t, configScope, updater, account }),
      }, OpenAICodexBundleConfig)))
      return dispose
    } catch (error) {
      dispose()
      throw error
    }
  }), 'dsh-codex-connect: settings page while served')

  ctx.slots.inject('settings.models.footer', () => ctx.slots.register({
    name: 'settings.models.footer',
    id: 'dsh-codex-connect-account',
    order: 100,
    inject: () => ({ t, account, configScope }),
  }, OpenAICodexModelsCard))

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'dsh-codex-connect-update',
    order: 40,
    locale: namespace,
    inject: (): { updater: OpenAICodexUpdateStore } => ({ updater }),
  }, OpenAICodexUpdateOverlay))

  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview',
    key: 'codex_connect_image_generate',
    locale: namespace,
    inject: (): CodexImageToolViewInjected => ({ sessions: ctx.sessions, configScope }),
  }, CodexImageToolView))

  ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
    name: 'conversation.chat.turnTail',
    id: 'codex-connect-generated-images',
    order: 20,
    locale: namespace,
    inject: (): Pick<CodexImageTurnTailProps, 'sessions' | 'configScope'> => ({ sessions: ctx.sessions, configScope }),
  }, CodexImageTurnTail))

  ctx.inject(['slots', 'modelDirectories'], (scope: ClientContext) => {
    scope.slots.inject('conversation.input.right', () => scope.slots.register({
      name: 'conversation.input.right',
      id: 'openai-codex-fast-mode',
      order: 10,
      locale: namespace,
      inject: (sessionId): OpenAICodexFastModeToggleInjected => ({
        directory: scope.modelDirectories.directoryFor(sessionId).store,
        account,
      }),
    }, OpenAICodexFastModeToggle))
    scope.slots.inject('conversation.input.right', () => scope.slots.register({
      name: 'conversation.input.right',
      id: 'openai-codex-quota',
      order: 20,
      locale: namespace,
      inject: (sessionId): OpenAICodexQuotaIndicatorInjected => ({
        directory: scope.modelDirectories.directoryFor(sessionId).store,
      }),
    }, OpenAICodexQuotaIndicator))
  })
}
