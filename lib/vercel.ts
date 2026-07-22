const VERCEL_API = 'https://api.vercel.com'

function teamQuery(): string {
  return process.env.VERCEL_TEAM_ID ? `?teamId=${process.env.VERCEL_TEAM_ID}` : ''
}

function authHeaders() {
  if (!process.env.VERCEL_API_TOKEN) throw new Error('VERCEL_API_TOKEN is not set')
  return { Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}`, 'Content-Type': 'application/json' }
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
