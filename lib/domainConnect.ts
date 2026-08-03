import { createZone, getZoneByDomain, createDnsRecord } from '@/lib/cloudflare'

// Provisions a Cloudflare zone for the domain (or reuses one already sitting
// in our account) and seeds the A/CNAME records that point it at Vercel, so
// once the domain's nameservers point here the site just works with no
// manual DNS entry required. Non-fatal on failure — callers fall back to
// the older manual A/CNAME-at-current-registrar flow if Cloudflare isn't
// available. Shared by /api/sites/domain (a domain the customer already
// owns) and the domain-reseller purchase flow (a domain Bario just
// registered on their behalf) — same DNS shape either way.
export async function provisionCloudflareZone(domain: string): Promise<{ zoneId: string; nameservers: string[] } | null> {
  try {
    const zone = (await getZoneByDomain(domain)) ?? (await createZone(domain))
    await Promise.all([
      createDnsRecord(zone.id, { type: 'A', name: '@', content: '76.76.21.21', proxied: false }).catch(() => {}),
      createDnsRecord(zone.id, { type: 'CNAME', name: 'www', content: 'cname.vercel-dns.com', proxied: false }).catch(() => {}),
    ])
    return { zoneId: zone.id, nameservers: zone.name_servers ?? [] }
  } catch {
    return null
  }
}
