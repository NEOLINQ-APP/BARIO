// Client for BARIO's own Mailcow instance (reseller.bario.ca) — real API
// shapes below were verified live against that instance (create+delete a
// throwaway domain/mailbox) before this file was written, not guessed from
// Mailcow's docs. Auth is a single admin-scoped API key via X-API-Key.
const MAILCOW_API = 'https://reseller.bario.ca/api/v1'

function authHeaders() {
  if (!process.env.MAILCOW_API_KEY) throw new Error('MAILCOW_API_KEY is not set')
  return { 'X-API-Key': process.env.MAILCOW_API_KEY, 'Content-Type': 'application/json' }
}

async function mailcowFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${MAILCOW_API}${path}`, { ...init, headers: { ...authHeaders(), ...(init?.headers ?? {}) } })
  const data = await res.json()
  // Mailcow returns an array of {type, log, msg} entries even for a single
  // action — "type":"danger"/"error" on any entry means the action failed,
  // there's no HTTP-status-based error signal to rely on.
  if (!res.ok) throw new Error(`Mailcow API error (${res.status})`)
  if (Array.isArray(data)) {
    const failure = data.find((entry: any) => entry.type === 'danger' || entry.type === 'error')
    if (failure) throw new Error(failure.msg?.join?.(' ') ?? failure.msg?.[1] ?? 'Mailcow rejected the request')
  }
  return data
}

export type MailcowDomain = { domain_name: string; mboxes_in_domain: number; max_num_mboxes_for_domain: number; active: number }
export type MailcowMailbox = { username: string; local_part: string; domain: string; quota: number; active: number }
export type MailcowDkim = { pubkey: string; dkim_txt: string; dkim_selector: string }

export async function listDomains(): Promise<MailcowDomain[]> {
  return mailcowFetch('/get/domain/all')
}

export async function domainExists(domain: string): Promise<boolean> {
  const domains = await listDomains()
  return domains.some((d) => d.domain_name.toLowerCase() === domain.toLowerCase())
}

export async function listMailboxes(domain: string): Promise<MailcowMailbox[]> {
  return mailcowFetch(`/get/mailbox/all/${encodeURIComponent(domain)}`)
}

export async function getDkim(domain: string): Promise<MailcowDkim> {
  return mailcowFetch(`/get/dkim/${encodeURIComponent(domain)}`)
}

// Creates the domain in Mailcow if it doesn't already exist — a customer
// domain only needs one Mailcow "domain" object no matter how many
// mailboxes get created under it later.
export async function ensureDomain(domain: string): Promise<void> {
  if (await domainExists(domain)) return
  await mailcowFetch('/add/domain', {
    method: 'POST',
    body: JSON.stringify({
      domain,
      description: `Bario customer domain: ${domain}`,
      aliases: '10',
      mailboxes: '10',
      defquota: '1024',
      maxquota: '10240',
      quota: '10240',
      active: '1',
    }),
  })
}

export async function createMailbox(opts: { domain: string; localPart: string; password: string; name: string; quotaMb?: number }): Promise<void> {
  await mailcowFetch('/add/mailbox', {
    method: 'POST',
    body: JSON.stringify({
      local_part: opts.localPart,
      domain: opts.domain,
      name: opts.name,
      password: opts.password,
      password2: opts.password,
      quota: String(opts.quotaMb ?? 1024),
      active: '1',
    }),
  })
}

export async function deleteMailbox(fullAddress: string): Promise<void> {
  await mailcowFetch('/delete/mailbox', { method: 'POST', body: JSON.stringify([fullAddress]) })
}
