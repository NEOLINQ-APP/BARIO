import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { recordIncident, autoResolveIfMissing, recordAutoFix, proposeApprovalAction } from '@/lib/neoIncidents'
import { hasSafeAction, runSafeAction } from '@/lib/neoActions'
import { hasApprovalAction, getApprovalAction } from '@/lib/neoApprovalActions'
import { getStripe } from '@/lib/stripe'
import { sendSms } from '@/lib/twilio'
import { getLatestProductionDeployments } from '@/lib/vercel'

// NEO's detection loop — runs every 15 minutes (vercel.json), same cadence
// and auth pattern as the existing wp-hosting-health cron. Every check
// below is a real, currently-meaningful signal, not a placeholder: key
// production endpoints actually responding, WP shared-hosting nodes
// actually reachable (cross-checked against wp_hosting_nodes, which
// wp-hosting-health already maintains), Stripe actually reachable with the
// configured key, and whether Sentry's read API is even wired up yet.
//
// Detect, then (only if a safe action is registered) auto-fix — see
// lib/neoActions.ts for why that list starts empty and how it grows.
export const maxDuration = 60

const SOURCE = 'health_check'

// Guards any check's external call against this route's own 60s
// maxDuration — added 2026-08-20 after checkStripe (below) silently ran
// this route past its ceiling. getStripe() has no explicit `timeout` set,
// so the Stripe SDK's own default (80s) applied, longer than this route's
// maxDuration; when Stripe was ever slow, the whole cron (including every
// OTHER check bundled in the same Promise.all) got killed by Vercel's
// runtime with no incident ever recorded, and no error to tell a human
// why. A bounded race here means one slow dependency degrades to "that one
// check didn't finish this run" instead of taking the whole health check
// down with it.
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ])
}

async function checkKeyEndpoints(sql: any) {
  const targets = [
    { name: 'homepage', url: 'https://www.bario.ca/' },
    { name: 'login_page', url: 'https://www.bario.ca/login' },
  ]
  const stillOpen: string[] = []
  for (const t of targets) {
    try {
      const res = await fetch(t.url, { signal: AbortSignal.timeout(10000), redirect: 'manual' })
      // 2xx/3xx are healthy; anything else (5xx especially) is a real problem.
      if (res.status >= 500) {
        const description = `${t.name} returned HTTP ${res.status}`
        stillOpen.push(description)
        await recordIncident(sql, {
          source: SOURCE,
          category: 'endpoint_down',
          severity: 'critical',
          description,
          details: { url: t.url, status: res.status },
        })
      }
    } catch (err: any) {
      const description = `${t.name} unreachable: ${err?.message ?? 'timeout/network error'}`
      stillOpen.push(description)
      await recordIncident(sql, {
        source: SOURCE,
        category: 'endpoint_down',
        severity: 'critical',
        description,
        details: { url: t.url, error: String(err?.message ?? err) },
      })
    }
  }
  await autoResolveIfMissing(sql, SOURCE, 'endpoint_down', stillOpen)
}

async function checkWpHostingNodes(sql: any) {
  const nodes = (await withTimeout(
    sql`SELECT id, ipv4, status FROM wp_hosting_nodes WHERE status != 'draining'`,
    10000,
    'wp_hosting_nodes query'
  )) as unknown as { id: string; ipv4: string; status: string }[]

  const stillOpen: string[] = []
  for (const node of nodes) {
    if (node.status === 'degraded' || node.status === 'unreachable') {
      const description = `WP shared-hosting node ${node.ipv4} is ${node.status}`
      stillOpen.push(description)
      await recordIncident(sql, {
        source: SOURCE,
        category: 'wp_hosting_node_unhealthy',
        severity: node.status === 'unreachable' ? 'critical' : 'warning',
        description,
        details: { nodeId: node.id, ipv4: node.ipv4, status: node.status },
      })
    }
  }
  await autoResolveIfMissing(sql, SOURCE, 'wp_hosting_node_unhealthy', stillOpen)
}

async function checkStripe(sql: any) {
  const category = 'stripe_unreachable'
  try {
    await withTimeout(getStripe().balance.retrieve(), 10000, 'Stripe balance.retrieve()')
    await autoResolveIfMissing(sql, SOURCE, category, [])
  } catch (err: any) {
    const description = `Stripe API call failed: ${err?.message ?? 'unknown error'}`
    await recordIncident(sql, {
      source: SOURCE,
      category,
      severity: 'critical',
      description,
      details: { error: String(err?.message ?? err) },
    })
    await autoResolveIfMissing(sql, SOURCE, category, [description])
  }
}

// Catches exactly the class of bug found 2026-08-20: a DNS record silently
// colliding with (or simply missing) what an external mail relay requires,
// breaking outbound email from a real mailbox with no application-level
// error anywhere -- the first sign was a bounce landing in someone's inbox,
// which NEO had no way to see. Detect-only: there is no safe auto-fix here
// (writing the wrong TXT value would be worse than leaving it alone), but
// at minimum this makes the problem visible on the next check instead of
// waiting for a human to notice a bounce.
async function checkDnsEmailDeliverability(sql: any) {
  const category = 'dns_email_deliverability'
  const stillOpen: string[] = []

  try {
    const spf = await withTimeout(
      fetch('https://dns.google/resolve?name=bario.ca&type=TXT').then((r) => r.json()),
      8000,
      'SPF DNS lookup'
    )
    const hasSpf = (spf.Answer ?? []).some((r: any) => typeof r.data === 'string' && r.data.includes('v=spf1'))
    if (!hasSpf) {
      const description = 'bario.ca has no SPF TXT record — outbound mail from @bario.ca addresses is likely to be rejected or bounced'
      stillOpen.push(description)
      await recordIncident(sql, { source: SOURCE, category, severity: 'warning', description })
    }

    const mc = await withTimeout(
      fetch('https://dns.google/resolve?name=_mailchannels.bario.ca&type=TXT').then((r) => r.json()),
      8000,
      'MailChannels DNS lookup'
    )
    const mcAnswer = (mc.Answer ?? [])[0]
    const mcIsTxt = mcAnswer?.type === 16
    if (!mcIsTxt) {
      const description = `_mailchannels.bario.ca is ${mcAnswer ? `a ${mcAnswer.type === 5 ? 'CNAME' : 'record type ' + mcAnswer.type} (${mcAnswer.data})` : 'missing'} instead of the TXT record MailChannels requires — outbound mail through Hostinger's relay will be rejected as unauthorized`
      stillOpen.push(description)
      await recordIncident(sql, { source: SOURCE, category, severity: 'critical', description, details: { found: mcAnswer } })
    }
  } catch (err: any) {
    console.error('NEO: DNS email deliverability check failed', err)
    return
  }

  await autoResolveIfMissing(sql, SOURCE, category, stillOpen)
}

// Measures how long the DB connection itself takes to establish (not just
// whether a query succeeds) -- catches the 2026-08-19/20 Supabase egress-cap
// incident's real signature: the pool going slow/flaky under load well
// before it fails outright. Note the inherent limit here: if the DB is
// fully unreachable, this cron can't run at all (recording an incident
// itself needs a DB write), so this only catches "degraded," never "fully
// down" -- a full outage shows up as the cron simply not completing, which
// is its own kind of signal (no incidents get auto-resolved, everything
// stays stuck open).
async function checkDatabaseLatency(sql: any, connectMs: number) {
  const category = 'database_slow'
  const THRESHOLD_MS = 3000
  if (connectMs > THRESHOLD_MS) {
    const description = `Database connection took ${connectMs}ms to establish (threshold ${THRESHOLD_MS}ms) — the connection pool may be under pressure`
    await recordIncident(sql, { source: SOURCE, category, severity: 'warning', description, details: { connectMs } })
    await autoResolveIfMissing(sql, SOURCE, category, [description])
  } else {
    await autoResolveIfMissing(sql, SOURCE, category, [])
  }
}

// A VPS order that never actually finished provisioning -- the customer
// paid for a server that doesn't exist yet. Has a real, safe, idempotent
// fix (vps_retry_provision, already used manually via the admin assistant)
// so this proposes rather than just alerting -- see
// lib/neoApprovalActions.ts.
async function checkVpsProvisioning(sql: any) {
  const category = 'vps_stuck_provisioning'
  const stuck = (await withTimeout(
    sql`SELECT id, hostname FROM vps_instances WHERE status = 'provision_failed'`,
    10000,
    'vps_instances query'
  )) as unknown as { id: string; hostname: string | null }[]

  const stillOpen: string[] = []
  for (const vps of stuck) {
    const description = `VPS ${vps.hostname ?? vps.id} is stuck in provision_failed`
    stillOpen.push(description)
    await recordIncident(sql, { source: SOURCE, category, severity: 'critical', description, details: { instanceId: vps.id } })
  }
  await autoResolveIfMissing(sql, SOURCE, category, stillOpen)
}

// Same shape as checkVpsProvisioning, for WordPress shared-hosting sites --
// wp_retry_provision is the existing, already-used-manually fix.
async function checkWpProvisioning(sql: any) {
  const category = 'wp_site_stuck_provisioning'
  const stuck = (await withTimeout(
    sql`SELECT id, custom_domain, subdomain FROM wp_sites WHERE status IN ('provision_failed', 'awaiting_capacity')`,
    10000,
    'wp_sites query'
  )) as unknown as { id: string; custom_domain: string | null; subdomain: string | null }[]

  const stillOpen: string[] = []
  for (const site of stuck) {
    const description = `WP site ${site.custom_domain ?? site.subdomain ?? site.id} is stuck provisioning`
    stillOpen.push(description)
    await recordIncident(sql, { source: SOURCE, category, severity: 'critical', description, details: { siteId: site.id } })
  }
  await autoResolveIfMissing(sql, SOURCE, category, stillOpen)
}

async function checkSentryConfigured(sql: any) {
  const category = 'sentry_not_configured'
  if (process.env.SENTRY_API_TOKEN) {
    await autoResolveIfMissing(sql, SOURCE, category, [])
    return
  }
  const description = 'SENTRY_API_TOKEN is not set — NEO cannot read real error rates from Sentry yet'
  await recordIncident(sql, { source: SOURCE, category, severity: 'info', description })
}

// Catches a broken production build/deploy — distinct from checkKeyEndpoints
// above, which only sees the currently-*live* site and stays green even
// while newer deploys keep failing behind it (confirmed as a real gap
// 2026-08-20: a TypeScript error blocked every deploy for ~10 minutes with
// no NEO incident raised, since bario.ca itself was still being served fine
// from the last good deployment). Severity is 'warning' not 'critical' for
// exactly that reason — the site is still up, it's new changes that can't
// ship. Detect-only, same as every other check here: NEO reports this for a
// human to look at, it never touches code or triggers a deploy itself (see
// lib/neoActions.ts's registry for why that boundary exists).
async function checkVercelDeploys(sql: any) {
  const category = 'vercel_deploy_failed'
  try {
    const deployments = await withTimeout(getLatestProductionDeployments(5), 10000, 'Vercel deployments API')
    const latest = deployments[0]
    if (latest && (latest.state === 'ERROR' || latest.state === 'CANCELED')) {
      const description = `Latest production deploy failed (state: ${latest.state}) — ${latest.url}`
      await recordIncident(sql, {
        source: SOURCE,
        category,
        severity: 'warning',
        description,
        details: { uid: latest.uid, state: latest.state, url: latest.url, created: latest.created },
      })
      await autoResolveIfMissing(sql, SOURCE, category, [description])
    } else {
      await autoResolveIfMissing(sql, SOURCE, category, [])
    }
  } catch (err: any) {
    // A Vercel API hiccup (rate limit, transient network error) shouldn't
    // itself become a false-positive incident — just skip this run and try
    // again on the next 15-minute tick.
    console.error('NEO: vercel deploy check failed', err)
  }
}

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  const isCron = process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`
  const isAdminKey = process.env.BARIO_ADMIN_API_KEY && authHeader === `Bearer ${process.env.BARIO_ADMIN_API_KEY}`
  if (!isCron && !isAdminKey) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const dbStart = Date.now()
  const sql = await db()
  const connectMs = Date.now() - dbStart

  // Sequential, not Promise.all -- db()'s client is opened with max: 1 (one
  // real Postgres connection per invocation, see lib/db.ts), so "running
  // concurrently" never actually parallelized these queries anyway, it just
  // queued them on the same connection. With 9 checks now (was 5), that
  // queuing produced real contention: vps_instances's query alone timed out
  // at 10s waiting behind the others. Running them one at a time removes
  // the contention entirely and costs nothing -- they were never truly
  // concurrent to begin with, and the route's 60s budget comfortably fits
  // 9 sequential checks that each individually finish in a second or two.
  await checkKeyEndpoints(sql)
  await checkWpHostingNodes(sql)
  await checkStripe(sql)
  await checkSentryConfigured(sql)
  await checkVercelDeploys(sql)
  await checkDnsEmailDeliverability(sql)
  await checkDatabaseLatency(sql, connectMs)
  await checkVpsProvisioning(sql)
  await checkWpProvisioning(sql)

  // Any freshly-'detected' incident whose category has a registered safe
  // action gets fixed immediately; everything else waits at 'needs_review'
  // for a human — see lib/neoActions.ts.
  const openIncidents = (await sql`
    SELECT id, category, description, details_json FROM neo_incidents WHERE status = 'detected'
  `) as unknown as { id: string; category: string; description: string; details_json: string }[]

  const autoFixed: string[] = []
  const proposed: string[] = []
  for (const incident of openIncidents) {
    const details = JSON.parse(incident.details_json || '{}')

    if (hasSafeAction(incident.category)) {
      try {
        const actionTaken = await runSafeAction(sql, incident.category, details)
        await recordAutoFix(sql, SOURCE, incident.category, incident.description, actionTaken)
        autoFixed.push(incident.description)
      } catch (err: any) {
        // A safe action that itself throws just leaves the incident at
        // 'detected' for a human — never silently mark something fixed that
        // wasn't.
        console.error(`NEO safe action failed for ${incident.category}:`, err)
      }
      continue
    }

    if (hasApprovalAction(incident.category)) {
      const action = getApprovalAction(incident.category)!
      try {
        await proposeApprovalAction(sql, SOURCE, incident.category, incident.description, {
          tool: action.tool,
          args: action.buildArgs(details),
          label: action.label,
        })
        proposed.push(incident.description)
        const alertNumber = process.env.EXEC_ALERT_PHONE_NUMBER
        if (alertNumber) {
          await sendSms(alertNumber, `NEO found something that needs your approval: ${incident.description}. Proposed fix: ${action.label}. Review at https://www.bario.ca/admin/neo`).catch((err) =>
            console.error('NEO approval SMS failed', err)
          )
        }
      } catch (err: any) {
        console.error(`NEO approval proposal failed for ${incident.category}:`, err)
      }
    }
  }

  return NextResponse.json({ ok: true, autoFixed, proposed })
}
