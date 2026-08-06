import { createZone, getZoneByDomain, createDnsRecord } from '@/lib/cloudflare'

// Provisions a Cloudflare zone for the domain (or reuses one already sitting
// in our account) and seeds A/CNAME records pointing it at an arbitrary
// target IP, so once the domain's nameservers point here the site just
// works with no manual DNS entry required. Non-fatal on failure — callers
// fall back to the older manual A/CNAME-at-current-registrar flow if
// Cloudflare isn't available. Shared by /api/sites/domain, the
// domain-reseller purchase flow, and both WordPress hosting tiers (Product
// A's dedicated VPS, Product B's shared node) — same DNS shape either way,
// just a different target IP each time.
export async function provisionCloudflareZoneForTarget(domain: string, targetIp: string): Promise<{ zoneId: string; nameservers: string[] } | null> {
  try {
    const zone = (await getZoneByDomain(domain)) ?? (await createZone(domain))
    // Both apex and www point at the same dedicated/shared-node IP — unlike
    // Vercel's edge network, a VPS/hosting-node target has no separate CNAME
    // endpoint of its own.
    await Promise.all([
      createDnsRecord(zone.id, { type: 'A', name: '@', content: targetIp, proxied: false }).catch(() => {}),
      createDnsRecord(zone.id, { type: 'A', name: 'www', content: targetIp, proxied: false }).catch(() => {}),
    ])
    return { zoneId: zone.id, nameservers: zone.name_servers ?? [] }
  } catch {
    return null
  }
}

// Unchanged original behavior for existing sites/domain-reseller callers —
// www uses Vercel's own recommended CNAME target, not a bare A record.
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
