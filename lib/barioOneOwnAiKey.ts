import { encryptPassword, decryptPassword } from '@/lib/vpsPassword'
import type { BoOrganization } from '@/lib/db'

// Providers a customer can plug their own key in for — only 'anthropic' is
// actually executed against today (see researchLeads() in
// lib/barioOneAssistantTools.ts). The others are accepted/stored so the
// UI can show "coming soon" rather than not exist at all, but
// getOwnAiKey() callers must still check `supported` before using one —
// running lead research against a provider with no real web-search tool
// would risk inventing businesses that don't exist.
export const OWN_AI_PROVIDERS = [
  { key: 'anthropic', label: 'Anthropic (Claude)', supported: true },
  { key: 'openai', label: 'OpenAI', supported: false },
  { key: 'google', label: 'Google (Gemini)', supported: false },
] as const
export type OwnAiProviderKey = (typeof OWN_AI_PROVIDERS)[number]['key']

export function isOwnAiProviderKey(v: unknown): v is OwnAiProviderKey {
  return typeof v === 'string' && OWN_AI_PROVIDERS.some((p) => p.key === v)
}

export type OwnAiKey = { provider: string; apiKey: string; supported: boolean }

export function getOwnAiKey(org: BoOrganization): OwnAiKey | null {
  if (!org.own_ai_provider || !org.own_ai_api_key_ciphertext || !org.own_ai_api_key_iv) return null
  const supported = OWN_AI_PROVIDERS.find((p) => p.key === org.own_ai_provider)?.supported ?? false
  return {
    provider: org.own_ai_provider,
    apiKey: decryptPassword(org.own_ai_api_key_ciphertext, org.own_ai_api_key_iv),
    supported,
  }
}

export async function setOwnAiKey(sql: any, orgId: string, provider: OwnAiProviderKey, apiKey: string): Promise<void> {
  const { ciphertext, iv } = encryptPassword(apiKey)
  await sql`
    UPDATE bo_organizations
    SET own_ai_provider = ${provider}, own_ai_api_key_ciphertext = ${ciphertext}, own_ai_api_key_iv = ${iv}, updated_at = now()
    WHERE id = ${orgId}
  `
}

export async function clearOwnAiKey(sql: any, orgId: string): Promise<void> {
  await sql`
    UPDATE bo_organizations
    SET own_ai_provider = NULL, own_ai_api_key_ciphertext = NULL, own_ai_api_key_iv = NULL, updated_at = now()
    WHERE id = ${orgId}
  `
}
