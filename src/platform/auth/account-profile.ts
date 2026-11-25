/** Safe browser labels and composite identity derived locally from OpenAI Codex OAuth JWTs. */

import { Buffer } from 'node:buffer'
import type { OAuthCredential } from '@earendil-works/pi-ai'

const AUTH_CLAIM = 'https://api.openai.com/auth'
const PROFILE_CLAIM = 'https://api.openai.com/profile'
const MAX_JWT_PAYLOAD_LENGTH = 64 * 1024
const MAX_LABEL_LENGTH = 128
const MAX_EMAIL_LENGTH = 320
const MAX_USER_ID_LENGTH = 256

export type OpenAICodexAccountProfileSource = 'oauth' | 'generated'

export interface OpenAICodexAccountProfile {
  displayName: string
  maskedEmail?: string
  source: OpenAICodexAccountProfileSource
}

function boundedText(value: unknown, maximum: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.replace(/[\u0000-\u001f\u007f]/gu, '').trim()
  return normalized.length > 0 && normalized.length <= maximum ? normalized : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function decodeJwtPayload(access: string): Record<string, unknown> | undefined {
  const payload = access.split('.')[1]
  if (payload === undefined || payload.length === 0 || payload.length > MAX_JWT_PAYLOAD_LENGTH) return undefined
  try {
    const decoded: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return isRecord(decoded) ? decoded : undefined
  } catch {
    return undefined
  }
}

function maskEmail(email: string): string {
  const separator = email.lastIndexOf('@')
  if (separator <= 0 || separator === email.length - 1) return '••••'
  const local = email.slice(0, separator)
  const domain = email.slice(separator + 1)
  return `${local.slice(0, Math.min(2, local.length))}••@${domain}`
}

function formatPlanLabel(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined
  const lower = raw.toLowerCase()
  const labels: Record<string, string> = {
    team: 'Team',
    business: 'Business',
    enterprise: 'Enterprise',
    plus: 'Plus',
    pro: 'Pro',
    free: 'Free',
    edu: 'Edu',
  }
  return labels[lower] ?? raw
}

/**
 * Derive a stable per-(workspace, user) identity string from an OAuth credential.
 * ChatGPT Team/Business members share `chatgpt_account_id` (the workspace id),
 * so combining it with the JWT user identity keeps distinct members separate
 * while still allowing the same user to store multiple workspaces.
 */
export function openAICodexCredentialIdentity(credential: { accountId: string; access: string }): string {
  const payload = decodeJwtPayload(credential.access)
  if (payload === undefined) return credential.accountId
  const auth = isRecord(payload[AUTH_CLAIM]) ? payload[AUTH_CLAIM] : undefined
  const profile = isRecord(payload[PROFILE_CLAIM]) ? payload[PROFILE_CLAIM] : undefined
  const userId = boundedText(auth?.['chatgpt_user_id'], MAX_USER_ID_LENGTH)
    ?? boundedText(auth?.['user_id'], MAX_USER_ID_LENGTH)
    ?? boundedText(payload['sub'], MAX_USER_ID_LENGTH)
    ?? boundedText(profile?.['email'], MAX_EMAIL_LENGTH)?.toLowerCase()
  return userId === undefined ? credential.accountId : `${credential.accountId}\0${userId}`
}

function decodeOauthProfile(access: string): { name?: string; email?: string; plan?: string } {
  const payload = decodeJwtPayload(access)
  if (payload === undefined) return {}
  const auth = isRecord(payload[AUTH_CLAIM]) ? payload[AUTH_CLAIM] : undefined
  const profile = isRecord(payload[PROFILE_CLAIM]) ? payload[PROFILE_CLAIM] : undefined
  const name = boundedText(profile?.['name'], MAX_LABEL_LENGTH)
  const email = boundedText(profile?.['email'], MAX_EMAIL_LENGTH)
  const plan = formatPlanLabel(boundedText(auth?.['chatgpt_plan_type'], 32))
  return {
    ...(name === undefined ? {} : { name }),
    ...(email === undefined ? {} : { email }),
    ...(plan === undefined ? {} : { plan }),
  }
}

/** Resolve display-only labels without network access or provider account identifiers. */
export function resolveOpenAICodexAccountProfiles(
  credentials: readonly OAuthCredential[],
): readonly OpenAICodexAccountProfile[] {
  const base = credentials.map((credential, index) => {
    const oauth = decodeOauthProfile(credential.access)
    const displayName = oauth.name ?? `ChatGPT account ${String(index + 1)}`
    const maskedEmail = oauth.email === undefined ? undefined : maskEmail(oauth.email)
    return {
      displayName,
      maskedEmail,
      plan: oauth.plan,
      source: (oauth.name === undefined && oauth.email === undefined ? 'generated' : 'oauth') as OpenAICodexAccountProfileSource,
    }
  })

  // Disambiguate entries that share identical visible name and masked email (e.g. Personal + Team or multiple Teams).
  const groupCounts = new Map<string, number>()
  for (const entry of base) {
    const groupKey = `${entry.displayName}\0${entry.maskedEmail ?? ''}`
    groupCounts.set(groupKey, (groupCounts.get(groupKey) ?? 0) + 1)
  }
  const labeled = base.map(entry => {
    const groupKey = `${entry.displayName}\0${entry.maskedEmail ?? ''}`
    if ((groupCounts.get(groupKey) ?? 0) <= 1 || entry.plan === undefined) return entry
    return { ...entry, displayName: `${entry.displayName} (${entry.plan})` }
  })
  const finalCounts = new Map<string, number>()
  for (const entry of labeled) {
    const groupKey = `${entry.displayName}\0${entry.maskedEmail ?? ''}`
    finalCounts.set(groupKey, (finalCounts.get(groupKey) ?? 0) + 1)
  }
  const seen = new Map<string, number>()
  return labeled.map(entry => {
    const groupKey = `${entry.displayName}\0${entry.maskedEmail ?? ''}`
    let displayName = entry.displayName
    if ((finalCounts.get(groupKey) ?? 0) > 1) {
      const ordinal = (seen.get(groupKey) ?? 0) + 1
      seen.set(groupKey, ordinal)
      displayName = `${displayName} #${String(ordinal)}`
    }
    return {
      displayName,
      ...(entry.maskedEmail === undefined ? {} : { maskedEmail: entry.maskedEmail }),
      source: entry.source,
    }
  })
}
