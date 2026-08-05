import type { CrmStack } from '@/lib/db'
import { decryptSecret } from '@/lib/flo/crypto'

// Real, honest failure mode for every crm_stacks row created before an
// admin has run POST /api/admin/crm-stacks/[id]/api-key for it (which is
// all of them today — see the comment on twenty_api_key_encrypted in
// lib/db.ts) — callers surface this as a 409, not a silent empty result.
export class TwentyNotLinkedError extends Error {
  constructor() {
    super('This CRM workspace isn\'t linked to Bario yet — contact support to enable API access.')
  }
}

export async function queryTwenty(crmStack: CrmStack, query: string, variables: Record<string, unknown> = {}): Promise<any> {
  if (!crmStack.twenty_api_key_encrypted || !crmStack.twenty_api_key_iv) throw new TwentyNotLinkedError()

  const apiKey = decryptSecret(crmStack.twenty_api_key_encrypted, crmStack.twenty_api_key_iv)
  const res = await fetch(`https://${crmStack.subdomain}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(`Twenty GraphQL error: ${JSON.stringify(json.errors)}`)
  return json.data
}
