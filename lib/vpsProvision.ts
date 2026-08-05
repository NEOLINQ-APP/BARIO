import { randomBytes } from 'node:crypto'
import type { VpsInstance } from '@/lib/db'
import { VPS_TIERS, VPS_REGION, type VpsTierKey } from '@/lib/vpsTiers'
import { createSSHKey, createServer, setReverseDns, findSSHKeyByName } from '@/lib/hetzner'
import { buildUserData, buildWordPressUserData } from '@/lib/cloudInit'
import { encryptPassword } from '@/lib/vpsPassword'

// Bario's own management key, added (in addition to whatever the customer
// supplied, or as the only key when they chose the password fallback) to
// every 'wordpress' app_type server — this is what lets the "Issue HTTPS
// certificate" customer action (app/api/vps/wordpress/issue-cert) actually
// SSH in and run issue-cert.sh, regardless of the customer's own key setup.
const WP_MGMT_KEY_NAME = 'bario-vps-wordpress-management'

async function ensureManagementSshKeyId(): Promise<number> {
  const publicKey = process.env.BARIO_VPS_MGMT_SSH_PUBLIC_KEY
  if (!publicKey) throw new Error('BARIO_VPS_MGMT_SSH_PUBLIC_KEY is not set')
  const existing = await findSSHKeyByName(WP_MGMT_KEY_NAME)
  if (existing) return existing.id
  const created = await createSSHKey(WP_MGMT_KEY_NAME, publicKey)
  return created.id
}

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

    const isWordPress = order.app_type === 'wordpress'

    let sshKeyIds: number[] = []
    if (order.ssh_public_key) {
      const key = await createSSHKey(`bario-vps-${shortId}`, order.ssh_public_key)
      sshKeyIds = [key.id]
    }
    if (isWordPress) {
      sshKeyIds.push(await ensureManagementSshKeyId())
    }

    // Hetzner only returns a root password when zero ssh_keys are attached
    // — for 'wordpress' orders that chose the password-fallback option
    // (no ssh_public_key), Bario's management key is still attached, so we
    // generate and set the password ourselves via cloud-init instead of
    // relying on Hetzner's response (see buildWordPressUserData's
    // rootPassword param).
    const generatedRootPassword = isWordPress && !order.ssh_public_key ? randomBytes(12).toString('base64url') : null

    let wpAdminUser: string | null = null
    let wpAdminPasswordPlaintext: string | null = null
    const userData = isWordPress
      ? (() => {
          wpAdminUser = 'bario_admin'
          wpAdminPasswordPlaintext = randomBytes(12).toString('base64url')
          return buildWordPressUserData({
            hostname,
            wpDbPassword: randomBytes(16).toString('base64url'),
            wpAdminUser,
            wpAdminPassword: wpAdminPasswordPlaintext,
            wpAdminEmail: 'admin@bario.ca',
            rootPassword: generatedRootPassword ?? undefined,
          })
        })()
      : buildUserData({ hostname })

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

    const rootPasswordToStore = server.rootPassword ?? generatedRootPassword
    let passwordCiphertext: string | null = null
    let passwordIv: string | null = null
    if (rootPasswordToStore) {
      const enc = encryptPassword(rootPasswordToStore)
      passwordCiphertext = enc.ciphertext
      passwordIv = enc.iv
    }

    let wpAdminPasswordCiphertext: string | null = null
    let wpAdminPasswordIv: string | null = null
    if (wpAdminPasswordPlaintext) {
      const enc = encryptPassword(wpAdminPasswordPlaintext)
      wpAdminPasswordCiphertext = enc.ciphertext
      wpAdminPasswordIv = enc.iv
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
          wp_admin_user = ${wpAdminUser},
          wp_admin_password_ciphertext = ${wpAdminPasswordCiphertext},
          wp_admin_password_iv = ${wpAdminPasswordIv},
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
