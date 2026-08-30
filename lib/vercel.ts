const VERCEL_API = 'https://api.vercel.com'

function teamQuery(): string {
  return process.env.VERCEL_TEAM_ID ? `?teamId=${process.env.VERCEL_TEAM_ID}` : ''
}

function authHeaders() {
  if (!process.env.VERCEL_API_TOKEN) throw new Error('VERCEL_API_TOKEN is not set')
  return { Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}`, 'Content-Type': 'application/json' }
}

// Metadata only (key names, target, sensitivity, last-updated) -- Vercel's
// API never returns a Sensitive var's actual value under any credential,
// by design. Used by the daily backup cron so the *list* of what needs to
// exist is never lost even though the values themselves can only ever be
// recovered from Vercel's own dashboard by a logged-in human.
export async function listProductionEnvVarNames(): Promise<{ key: string; target: string[]; sensitive: boolean; updatedAt: number }[]> {
  if (!process.env.VERCEL_PROJECT_ID) throw new Error('VERCEL_PROJECT_ID is not set')
  const res = await fetch(`${VERCEL_API}/v9/projects/${process.env.VERCEL_PROJECT_ID}/env${teamQuery()}`, {
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(`Vercel env list failed: ${res.status}`)
  const data = await res.json()
  return (data.envs ?? []).map((e: any) => ({
    key: e.key,
    target: e.target ?? [],
    sensitive: e.type === 'sensitive' || e.sensitive === true,
    updatedAt: e.updatedAt ?? 0,
  }))
}

export async function addDomainToVercel(domain: string) {
  if (!process.env.VERCEL_PROJECT_ID) throw new Error('VERCEL_PROJECT_ID is not set')
  const res = await fetch(`${VERCEL_API}/v10/projects/${process.env.VERCEL_PROJECT_ID}/domains${teamQuery()}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ name: domain }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || 'Failed to add domain to Vercel')
  return data
}

export async function getDomainStatus(domain: string) {
  if (!process.env.VERCEL_PROJECT_ID) throw new Error('VERCEL_PROJECT_ID is not set')
  const res = await fetch(`${VERCEL_API}/v9/projects/${process.env.VERCEL_PROJECT_ID}/domains/${domain}${teamQuery()}`, {
    headers: authHeaders(),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || 'Failed to check domain status')
  return data as { verified: boolean; verification?: { type: string; domain: string; value: string; reason: string }[] }
}

// Ownership ("verified") is separate from actual DNS routing — a domain can pass
// the ownership challenge yet still not have its A/CNAME records pointed at Vercel.
// This checks the latter via Vercel's domain-config endpoint (`misconfigured`).
export async function getDomainConfig(domain: string) {
  const res = await fetch(`${VERCEL_API}/v6/domains/${domain}/config${teamQuery()}`, {
    headers: authHeaders(),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || 'Failed to check domain config')
  return data as { misconfigured: boolean }
}

export async function removeDomainFromVercel(domain: string) {
  if (!process.env.VERCEL_PROJECT_ID) throw new Error('VERCEL_PROJECT_ID is not set')
  const res = await fetch(`${VERCEL_API}/v9/projects/${process.env.VERCEL_PROJECT_ID}/domains/${domain}${teamQuery()}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok && res.status !== 404) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error?.message || 'Failed to remove domain from Vercel')
  }
}

// A connected apex domain gets its "www" sibling added/removed alongside it
// so both resolve, matching the DNS instructions we hand out (A @, CNAME www).
export function wwwSibling(domain: string): string | null {
  return domain.startsWith('www.') ? null : `www.${domain}`
}

export type VercelDeployment = { uid: string; state: string; created: number; url: string }

// Used by NEO's health-check cron (app/api/cron/neo-health-check/route.ts)
// to detect a broken production build — added 2026-08-20 after a real
// TypeScript build error sat unnoticed for ~10 minutes because every other
// NEO check only looks at the currently-*live* site, which keeps serving
// the last successful deploy and stays healthy while newer deploys keep
// failing behind it.
export async function getLatestProductionDeployments(limit = 5): Promise<VercelDeployment[]> {
  if (!process.env.VERCEL_PROJECT_ID) throw new Error('VERCEL_PROJECT_ID is not set')
  const params = new URLSearchParams({ projectId: process.env.VERCEL_PROJECT_ID, target: 'production', limit: String(limit) })
  if (process.env.VERCEL_TEAM_ID) params.set('teamId', process.env.VERCEL_TEAM_ID)
  const res = await fetch(`${VERCEL_API}/v6/deployments?${params}`, { headers: authHeaders() })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || 'Failed to list deployments')
  return data.deployments as VercelDeployment[]
}
