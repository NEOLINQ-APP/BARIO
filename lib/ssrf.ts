import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

// Shared by every route that makes a server-side HTTP request to a
// user-supplied URL (the paid migration crawler and the public audit
// endpoint) — without this, a caller could point either one at an
// internal/cloud-metadata address (e.g. 169.254.169.254) to probe
// infrastructure that would otherwise be unreachable from the outside.
// Doesn't defend against DNS rebinding between this check and the fetches
// that follow — an acceptable residual risk given the migration route is
// paid-tier-gated and the audit route is rate-limited.
export async function assertPublicHost(hostname: string): Promise<void> {
  if (hostname === 'localhost') throw new Error("That URL points to a local address, not a public website")
  const ip = isIP(hostname) ? hostname : (await lookup(hostname)).address
  if (isPrivateIp(ip)) throw new Error("That URL points to a private or internal address, not a public website")
}

function isPrivateIp(ip: string): boolean {
  if (ip.includes(':')) {
    return ip === '::1' || /^fe80:/i.test(ip) || /^f[cd]/i.test(ip)
  }
  const [a, b] = ip.split('.').map(Number)
  return a === 127 || a === 10 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)
}
