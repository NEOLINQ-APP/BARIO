// Client for BARIO's crm-provision-agent (a small Express app on the main
// VPS, crm-agent.bario.ca) — the agent runs real docker compose / nginx /
// certbot commands as root to stand up one fully dedicated Twenty CRM stack
// (own Postgres, Redis, Twenty, worker containers, own subdomain, own cert)
// per customer. This replaced an earlier design that shared one
// multi-workspace Twenty instance (crm.bario.ca) across all customers —
// that instance hard-caps at 5 workspaces without a paid Twenty Enterprise
// key (confirmed live: "Cannot create more than 5 workspaces without a
// valid enterprise key"). Dedicated single-workspace stacks have no such
// cap, matching the pattern already used manually for AFC/Sunbuilt.
//
// Same "Vercel calls out to an internal API it doesn't run itself" shape as
// lib/registrar.ts/lib/hetzner.ts.
import { createDnsRecord } from '@/lib/cloudflare'

const VPS_IP = '2.25.139.207'
const CRM_ZONE_ID = '4c9c3a5ab1480f6bc23b498e7052bb9c' // bario.ca zone, confirmed via Cloudflare API

function agentUrl() {
  if (!process.env.CRM_AGENT_URL) throw new Error('CRM_AGENT_URL is not set')
  return process.env.CRM_AGENT_URL
}

function authHeaders() {
  if (!process.env.CRM_AGENT_SECRET) throw new Error('CRM_AGENT_SECRET is not set')
  return { Authorization: `Bearer ${process.env.CRM_AGENT_SECRET}`, 'Content-Type': 'application/json' }
}

export function slugify(displayName: string): string {
  const base = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
  return base || 'workspace'
}

// Creates the <slug>.crm.bario.ca A record pointing at the VPS before
// kicking off provisioning — the agent's certbot step needs this to already
// resolve (Cloudflare is authoritative for bario.ca, so propagation is
// normally seconds, but the agent also retries certbot with backoff as a
// safety net for this one externally-caused failure mode).
export async function pointStackDns(slug: string): Promise<void> {
  await createDnsRecord(CRM_ZONE_ID, { type: 'A', name: `${slug}.crm`, content: VPS_IP, ttl: 1, proxied: false })
}

export async function startStackProvision(opts: {
  slug: string
  displayName: string
  adminEmail: string
  adminPassword: string
}): Promise<void> {
  const res = await fetch(`${agentUrl()}/provision`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ slug: opts.slug, displayName: opts.displayName, adminEmail: opts.adminEmail, adminPassword: opts.adminPassword }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? `crm-provision-agent error (${res.status})`)
}

export type StackStatus = {
  status: 'provisioning' | 'active' | 'failed'
  step?: string
  domain: string
  error?: string
}

export async function checkStackStatus(slug: string): Promise<StackStatus> {
  const res = await fetch(`${agentUrl()}/status/${encodeURIComponent(slug)}`, { headers: authHeaders() })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? `crm-provision-agent error (${res.status})`)
  return { status: data.status, step: data.step, domain: data.domain, error: data.error }
}
