import { randomBytes } from 'node:crypto'
import type { WpSite, WpHostingNode } from '@/lib/db'
import { encryptPassword, decryptPassword } from '@/lib/vpsPassword'
import { WP_SHARED_RAM_MB } from '@/lib/wpSharedTiers'

// Client for the node-agent service — a small always-on Node process
// living ONLY on each hosting-node box (not in this repo, same convention
// as miko-voice/server.js and Bario Build's sandbox-host). Mirrors
// lib/sandboxHost.ts's shape (thin bearer-token fetch wrapper to a
// separate box), not lib/hetzner.ts's (Hetzner is only used once, to
// provision the node box itself — see the admin nodes/register route).
async function nodeAgentFetch(nodeIpv4: string, agentToken: string, path: string, init?: RequestInit) {
  const res = await fetch(`http://${nodeIpv4}:4100${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${agentToken}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `Node agent error (${res.status})`)
  return data
}

function randomSubdomain(): string {
  return `site-${randomBytes(4).toString('hex')}`
}

// The single function the webhook (and an admin retry route) call —
// mirrors lib/vpsProvision.ts's provisionVpsInstance shape: idempotent,
// status-guarded, claims the row before doing any real work so a duplicate
// webhook delivery or a retry click is a safe no-op.
export async function provisionWpSharedSite(sql: any, siteId: string): Promise<void> {
  const rows = (await sql`SELECT * FROM wp_sites WHERE id = ${siteId} AND status = 'awaiting_provision'`) as unknown as WpSite[]
  const site = rows[0]
  if (!site) return

  await sql`UPDATE wp_sites SET status = 'provisioning', updated_at = now() WHERE id = ${siteId}`

  try {
    // Row-locked node pick + capacity reservation in one transaction —
    // closes the double-booking race two concurrent checkouts would
    // otherwise hit. Picks the least-loaded qualifying node (bin-packing
    // toward balance, not toward filling one node first).
    const picked = await sql.begin(async (tx: any) => {
      const nodeRows = (await tx`
        SELECT * FROM wp_hosting_nodes
        WHERE status = 'active' AND capacity_used_mb + ${WP_SHARED_RAM_MB} <= capacity_max_mb
        ORDER BY capacity_used_mb ASC
        LIMIT 1
        FOR UPDATE
      `) as unknown as WpHostingNode[]
      const node = nodeRows[0]
      if (!node) return null
      await tx`UPDATE wp_hosting_nodes SET capacity_used_mb = capacity_used_mb + ${WP_SHARED_RAM_MB}, updated_at = now() WHERE id = ${node.id}`
      return node
    })

    if (!picked) {
      // Real, visible state — v1 has 1-2 manually-provisioned nodes, no
      // automatic spillover to a freshly-provisioned node yet.
      await sql`UPDATE wp_sites SET status = 'awaiting_capacity', updated_at = now() WHERE id = ${siteId}`
      return
    }

    const agentToken = decryptPassword(picked.agent_api_token_ciphertext, picked.agent_api_token_iv)
    const subdomain = `${randomSubdomain()}.wp.bario.ca`
    const wpAdminUser = 'bario_admin'
    const wpAdminPassword = randomBytes(12).toString('base64url')
    const wpDbPassword = randomBytes(16).toString('base64url')
    const enc = encryptPassword(wpAdminPassword)

    // Persisted BEFORE the agent call — real container creation + wp-cli
    // install can take minutes on a first image pull, far past what
    // Vercel's function duration or Cloudflare's ~100s proxy timeout can
    // wait on synchronously (a real 524 gateway timeout, hit and fixed
    // live during this feature's own build). The node agent's POST /sites
    // responds immediately (202) and reports the real outcome later via
    // /api/internal/wp-hosting-provision-callback — status stays
    // 'provisioning' until that callback arrives.
    await sql`
      UPDATE wp_sites
      SET node_id = ${picked.id}, subdomain = ${subdomain}, wp_admin_user = ${wpAdminUser},
          wp_admin_password_ciphertext = ${enc.ciphertext}, wp_admin_password_iv = ${enc.iv},
          ram_mb = ${WP_SHARED_RAM_MB}, updated_at = now()
      WHERE id = ${siteId}
    `

    try {
      await nodeAgentFetch(picked.ipv4, agentToken, '/sites', {
        method: 'POST',
        body: JSON.stringify({
          siteId,
          subdomain,
          customDomain: null,
          ramMb: WP_SHARED_RAM_MB,
          wpDbPassword,
          wpAdminUser,
          wpAdminPassword,
          wpAdminEmail: 'admin@bario.ca',
        }),
      })
    } catch (err) {
      // The agent never even accepted the request (unreachable, 401, bad
      // input) — release the capacity reserved above, since no background
      // work was ever started for it to eventually report back on via the
      // callback (applyWpSharedProvisionResult only fires for requests the
      // agent DID accept).
      await sql`UPDATE wp_hosting_nodes SET capacity_used_mb = GREATEST(capacity_used_mb - ${WP_SHARED_RAM_MB}, 0), updated_at = now() WHERE id = ${picked.id}`
      throw err
    }
  } catch (err: any) {
    await sql`UPDATE wp_sites SET status = 'provision_failed', last_error = ${err.message ?? String(err)}, updated_at = now() WHERE id = ${siteId}`
    throw err
  }
}

// Called by the node agent once it actually knows the outcome (success or
// failure) of a POST /sites it accepted earlier — see provisionWpSharedSite
// above for why this can't just be the direct response to that call. On
// failure, releases the capacity reserved when the request was first
// accepted — a real capacity leak found and fixed live during this
// feature's own build (a failed background install left capacity_used_mb
// permanently inflated with nothing to show for it).
export async function applyWpSharedProvisionResult(
  sql: any,
  siteId: string,
  result: { status: 'active' | 'provision_failed'; containerName?: string; error?: string }
): Promise<void> {
  if (result.status === 'active') {
    await sql`UPDATE wp_sites SET status = 'active', container_name = ${result.containerName ?? null}, updated_at = now() WHERE id = ${siteId}`
    return
  }

  const rows = (await sql`SELECT node_id, ram_mb FROM wp_sites WHERE id = ${siteId}`) as unknown as { node_id: string | null; ram_mb: number }[]
  const site = rows[0]
  if (site?.node_id) {
    await sql`UPDATE wp_hosting_nodes SET capacity_used_mb = GREATEST(capacity_used_mb - ${site.ram_mb}, 0), updated_at = now() WHERE id = ${site.node_id}`
  }
  await sql`UPDATE wp_sites SET status = 'provision_failed', last_error = ${result.error ?? 'unknown error'}, updated_at = now() WHERE id = ${siteId}`
}

// Tells the node agent to add a verified custom domain to an already-active
// site's Caddy routes — callers must confirm the domain actually resolves
// to the node's IP BEFORE calling this (same "DNS correct ≠ live" gotcha
// already tracked elsewhere in this project), this function does not
// re-check it itself.
export async function setWpSharedCustomDomain(sql: any, siteId: string, customDomain: string | null): Promise<void> {
  const rows = (await sql`SELECT * FROM wp_sites WHERE id = ${siteId}`) as unknown as WpSite[]
  const site = rows[0]
  if (!site || !site.node_id) throw new Error('Site has no active node')
  const nodeRows = (await sql`SELECT * FROM wp_hosting_nodes WHERE id = ${site.node_id}`) as unknown as WpHostingNode[]
  const node = nodeRows[0]
  if (!node) throw new Error('Node not found')
  const agentToken = decryptPassword(node.agent_api_token_ciphertext, node.agent_api_token_iv)
  await nodeAgentFetch(node.ipv4, agentToken, `/sites/${siteId}`, { method: 'PATCH', body: JSON.stringify({ customDomain }) })
}

// Real teardown — durable write first (mirrors lib/vpsProvision.ts's own
// deprovision ordering) so a node-agent failure leaves the row in a state
// an admin can see and retry, rather than silently reverting to "active".
export async function deprovisionWpSharedSite(sql: any, siteId: string): Promise<void> {
  const rows = (await sql`SELECT * FROM wp_sites WHERE id = ${siteId}`) as unknown as WpSite[]
  const site = rows[0]
  if (!site) return

  await sql`UPDATE wp_sites SET status = 'canceled_pending_deprovision', updated_at = now() WHERE id = ${siteId}`

  try {
    if (site.node_id) {
      const nodeRows = (await sql`SELECT * FROM wp_hosting_nodes WHERE id = ${site.node_id}`) as unknown as WpHostingNode[]
      const node = nodeRows[0]
      if (node) {
        const agentToken = decryptPassword(node.agent_api_token_ciphertext, node.agent_api_token_iv)
        await nodeAgentFetch(node.ipv4, agentToken, `/sites/${siteId}`, { method: 'DELETE' })
        await sql`UPDATE wp_hosting_nodes SET capacity_used_mb = GREATEST(capacity_used_mb - ${site.ram_mb}, 0), updated_at = now() WHERE id = ${node.id}`
      }
    }
    await sql`UPDATE wp_sites SET status = 'deprovisioned', updated_at = now() WHERE id = ${siteId}`
  } catch (err: any) {
    console.error('wp shared deprovision error', err)
    await sql`UPDATE wp_sites SET last_error = ${err.message ?? String(err)}, updated_at = now() WHERE id = ${siteId}`
    throw err
  }
}
