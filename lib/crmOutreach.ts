// Shared CRM-GraphQL config/helpers for the human-reviews-then-sends
// outreach flow (app/api/admin/crm-leadgen/*). Separate from
// app/api/cron/crm-leadgen's own copy since that route is cron-only and
// this is reused by two admin routes plus the enrichment cron.
export type CrmConfig = {
  key: string
  businessName: string
  graphqlUrl: string
  apiKeyEnvVar: string
  fromAddress: string
  smtpUserEnvVar: string
  smtpPassEnvVar: string
}

export const OUTREACH_CRMS: CrmConfig[] = [
  {
    key: 'afc',
    businessName: 'AFC Logistics',
    graphqlUrl: 'https://afc.crm.bario.ca/graphql',
    apiKeyEnvVar: 'AFC_CRM_API_KEY',
    fromAddress: '"AFC Logistics" <outreach@send.afclogistics.ca>',
    smtpUserEnvVar: 'AFC_OUTREACH_SMTP_USER',
    smtpPassEnvVar: 'AFC_OUTREACH_SMTP_PASS',
  },
  {
    key: 'sunbuilt',
    businessName: 'Sunbuilt Group',
    graphqlUrl: 'https://sunbuilt.crm.bario.ca/graphql',
    apiKeyEnvVar: 'SUNBUILT_CRM_API_KEY',
    fromAddress: '"Sunbuilt Group" <outreach@send.sunbuiltgroup.com>',
    smtpUserEnvVar: 'SUNBUILT_OUTREACH_SMTP_USER',
    smtpPassEnvVar: 'SUNBUILT_OUTREACH_SMTP_PASS',
  },
]

export function findCrm(key: string): CrmConfig | undefined {
  return OUTREACH_CRMS.find((c) => c.key === key)
}

export async function crmGraphQL(crm: CrmConfig, query: string, variables: Record<string, unknown>) {
  const apiKey = process.env[crm.apiKeyEnvVar]
  if (!apiKey) throw new Error(`${crm.apiKeyEnvVar} is not set`)
  const res = await fetch(crm.graphqlUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(`${crm.key} GraphQL error: ${JSON.stringify(json.errors)}`)
  return json.data
}
