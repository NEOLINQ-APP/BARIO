import type { VpsInstance } from '@/lib/db'
import { VPS_TIERS, VPS_REGION, type VpsTierKey } from '@/lib/vpsTiers'
import { createSSHKey, createServer, setReverseDns } from '@/lib/hetzner'
import { buildUserData } from '@/lib/cloudInit'
import { encryptPassword } from '@/lib/vpsPassword'

// The single function both the Stripe webhook and the admin
// approve/retry-provision routes call — this is what makes a failed
// provision retryable later without re-running any Stripe logic, and what
// makes a duplicate webhook delivery or a double admin-click a safe no-op
// instead of a second server.
export async function provisionVpsInstance(sql: any, instanceId: string): Promise<void> {
  const rows = (await sql`SELECT * FROM vps_instances WHERE id = ${instanceId} AND status = 'awaiting_provision'`) as unknown as VpsInstance[]
  const order = rows[0]
  if (!order) return // already claimed/processed by another call, or not actually ready — silent no-op

  // Claim the row before calling Hetzner so a concurrent retry can't race it.
  await sql`UPDATE vps_instances SET status = 'provisioning', updated_at = now() WHERE id = ${instanceId}`

  try {
    const tierKey = order.tier as VpsTierKey
    const tier = VPS_TIERS[tierKey]
    if (!tier) throw new Error(`Unknown VPS tier: ${order.tier}`)

    const shortId = instanceId.replace(/-/g, '').slice(0, 10)
    // Ideally paired with a matching forward DNS record on bario.ca's zone
    // for fully forward-confirmed reverse DNS — not required for the PTR
    // itself to be set correctly, a reasonable v1 gap to close later via
    // lib/cloudflare.ts.
    const hostname = `srv-${shortId}.vps.bario.ca`

    let sshKeyIds: number[] = []
    if (order.ssh_public_key) {
      const key = await createSSHKey(`bario-vps-${shortId}`, order.ssh_public_key)
      sshKeyIds = [key.id]
    }

    const userData = buildUserData({ hostname })

    const server = await createServer({
      name: hostname,
      serverType: tier.hetznerServerType,
      location: order.region || VPS_REGION,
      sshKeyIds,
      userData,
      enableBackups: order.backup_addon,
      labels: { bario_order_id: instanceId, bario_managed: 'true' },
    })

    if (server.ipv4) {
      await setReverseDns(String(server.id), server.ipv4, hostname)
    }

    let passwordCiphertext: string | null = null
    let passwordIv: string | null = null
    if (server.rootPassword) {
      const enc = encryptPassword(server.rootPassword)
      passwordCiphertext = enc.ciphertext
      passwordIv = enc.iv
    }

    await sql`
      UPDATE vps_instances
      SET status = 'active',
          hetzner_server_id = ${String(server.id)},
          hostname = ${hostname},
          primary_ipv4 = ${server.ipv4},
          primary_ipv6 = ${server.ipv6},
          root_password_ciphertext = ${passwordCiphertext},
          root_password_iv = ${passwordIv},
          updated_at = now()
      WHERE id = ${instanceId}
    `
  } catch (err: any) {
    await sql`
      UPDATE vps_instances SET status = 'provision_failed', last_error = ${err.message ?? String(err)}, updated_at = now()
      WHERE id = ${instanceId}
    `
    throw err
  }
}
