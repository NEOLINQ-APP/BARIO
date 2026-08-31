// Client for BARIO's own registrar-proxy service (a small Express app on the
// main VPS, registrar.bario.ca) — exists solely because the registrar's API
// requires the calling IP to be pre-whitelisted on the account, and Vercel
// serverless functions have no fixed outbound IP. The proxy runs on the one
// box whose IP actually is whitelisted and forwards calls to the registrar.
// Originally built against Namecheap; swapped to ResellerClub 2026-08-12
// (Namecheap's production API access was stuck in a slow manual-approval
// queue) — this file's own interface didn't need to change, only the proxy's
// internals did (see TODO.md's 2026-08-12 entry). See lib/mailcow.ts/
// lib/hetzner.ts for the same "Vercel calls out to an internal API it
// doesn't run itself" shape already used elsewhere in this codebase.
function proxyUrl() {
  if (!process.env.REGISTRAR_PROXY_URL) throw new Error('REGISTRAR_PROXY_URL is not set')
  return process.env.REGISTRAR_PROXY_URL
}

function authHeaders() {
  if (!process.env.REGISTRAR_PROXY_SECRET) throw new Error('REGISTRAR_PROXY_SECRET is not set')
  return { Authorization: `Bearer ${process.env.REGISTRAR_PROXY_SECRET}`, 'Content-Type': 'application/json' }
}

async function proxyFetch(path: string, body: unknown) {
  const res = await fetch(`${proxyUrl()}${path}`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? `Registrar proxy error (${res.status})`)
  return data
}

export type DomainCheckResult = {
  domain: string
  available: boolean
  isPremium: boolean
  premiumRegistrationPrice: number
  icannFee: number
}

export async function checkDomains(domains: string[]): Promise<DomainCheckResult[]> {
  const data = await proxyFetch('/check', { domains })
  return data.results
}

export type TldPricing = { tld: string; currency: string; registrationPrice: number; additionalCost: number }

export async function getTldPricing(tld: string): Promise<TldPricing> {
  return proxyFetch('/pricing', { tld })
}

export type RegistrantContact = {
  firstName: string
  lastName: string
  organizationName?: string
  address1: string
  city: string
  stateProvince: string
  postalCode: string
  country: string
  phone: string
  emailAddress: string
}

export type DomainRegisterResult = {
  registered: boolean
  domain: string
  orderId: string
  chargedAmount: string
}

export async function registerDomain(domain: string, years: number, contact: RegistrantContact): Promise<DomainRegisterResult> {
  return proxyFetch('/register', { domain, years, contact })
}

// Points a domain Bario just registered at a Cloudflare zone's nameservers
// — fully automates "connect this domain to a site" for domains bought
// through us, no manual registrar-panel step needed from the customer.
export async function setDomainNameservers(domain: string, nameservers: string[]): Promise<{ updated: boolean }> {
  return proxyFetch('/set-nameservers', { domain, nameservers })
}
