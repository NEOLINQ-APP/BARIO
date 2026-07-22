// RDAP (Registration Data Access Protocol) is the modern, free, public
// successor to WHOIS — every gTLD/ccTLD registry that supports it can be
// queried with no API key. We go through rdap.org, a public bootstrap
// redirector, instead of implementing the full IANA TLD-to-registry lookup
// ourselves.
export type DomainAvailability = 'available' | 'taken' | 'unknown'

export async function checkDomainAvailability(domain: string): Promise<DomainAvailability> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      signal: controller.signal,
      headers: { Accept: 'application/rdap+json' },
    })
    if (res.status === 404) return 'available'
    if (res.ok) return 'taken'
    return 'unknown'
  } catch {
    return 'unknown'
  } finally {
    clearTimeout(timeout)
  }
}
