const CF_API = 'https://api.cloudflare.com/client/v4'

export type DnsRecord = {
  id: string
  type: string
  name: string
  content: string
  priority?: number
  ttl: number
  proxied: boolean
}

function authHeaders() {
  if (!process.env.CLOUDFLARE_API_TOKEN) throw new Error('CLOUDFLARE_API_TOKEN is not set')
  return { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' }
}

async function cfFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${CF_API}${path}`, { ...init, headers: { ...authHeaders(), ...(init?.headers ?? {}) } })
  const data = await res.json()
  if (!res.ok || !data.success) {
    const msg = data.errors?.[0]?.message || `Cloudflare API error (${res.status})`
    throw new Error(msg)
  }
  return data.result
}

// Qualifies a record name ("@", "www", or a full hostname) against the zone's
// apex domain, matching what Cloudflare's DNS record API expects.
export function qualifyName(domain: string, name: string): string {
  const trimmed = name.trim().toLowerCase()
  if (trimmed === '@' || trimmed === '' || trimmed === domain) return domain
  if (trimmed.endsWith(`.${domain}`)) return trimmed
  return `${trimmed}.${domain}`
}

export async function createZone(domain: string): Promise<{ id: string; name_servers: string[]; status: string }> {
  if (!process.env.CLOUDFLARE_ACCOUNT_ID) throw new Error('CLOUDFLARE_ACCOUNT_ID is not set')
  return cfFetch('/zones', {
    method: 'POST',
    body: JSON.stringify({ name: domain, account: { id: process.env.CLOUDFLARE_ACCOUNT_ID }, type: 'full' }),
  })
}

export async function getZoneByDomain(domain: string): Promise<{ id: string; name_servers: string[]; status: string } | null> {
  const result = await cfFetch(`/zones?name=${encodeURIComponent(domain)}`)
  return result[0] ?? null
}

export async function getZone(zoneId: string): Promise<{ id: string; name_servers: string[]; status: string }> {
  return cfFetch(`/zones/${zoneId}`)
}

export async function deleteZone(zoneId: string): Promise<void> {
  await cfFetch(`/zones/${zoneId}`, { method: 'DELETE' })
}

export async function listDnsRecords(zoneId: string): Promise<DnsRecord[]> {
  return cfFetch(`/zones/${zoneId}/dns_records?per_page=100`)
}

export async function getDnsRecord(zoneId: string, recordId: string): Promise<DnsRecord> {
  return cfFetch(`/zones/${zoneId}/dns_records/${recordId}`)
}

export async function createDnsRecord(
  zoneId: string,
  record: { type: string; name: string; content: string; priority?: number; ttl?: number; proxied?: boolean }
): Promise<DnsRecord> {
  return cfFetch(`/zones/${zoneId}/dns_records`, {
    method: 'POST',
    body: JSON.stringify({ ttl: 1, proxied: false, ...record }),
  })
}

export async function updateDnsRecord(
  zoneId: string,
  recordId: string,
  record: Partial<{ name: string; content: string; priority: number; ttl: number; proxied: boolean }>
): Promise<DnsRecord> {
  return cfFetch(`/zones/${zoneId}/dns_records/${recordId}`, { method: 'PATCH', body: JSON.stringify(record) })
}

export async function deleteDnsRecord(zoneId: string, recordId: string): Promise<void> {
  await cfFetch(`/zones/${zoneId}/dns_records/${recordId}`, { method: 'DELETE' })
}
