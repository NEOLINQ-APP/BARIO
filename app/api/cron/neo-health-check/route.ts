import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { recordIncident, autoResolveIfMissing, recordAutoFix, proposeApprovalAction } from '@/lib/neoIncidents'
import { hasSafeAction, runSafeAction } from '@/lib/neoActions'
import { hasApprovalAction, getApprovalAction } from '@/lib/neoApprovalActions'
import { getStripe } from '@/lib/stripe'
import { sendSms } from '@/lib/twilio'

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
  const nodes = (await sql`
    SELECT id, ipv4, status FROM wp_hosting_nodes WHERE status != 'draining'
  `) as unknown as { id: string; ipv4: string; status: string }[]

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
    await getStripe().balance.retrieve()
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

async function checkSentryConfigured(sql: any) {
  const category = 'sentry_not_configured'
  if (process.env.SENTRY_API_TOKEN) {
    await autoResolveIfMissing(sql, SOURCE, category, [])
    return
  }
  const description = 'SENTRY_API_TOKEN is not set — NEO cannot read real error rates from Sentry yet'
  await recordIncident(sql, { source: SOURCE, category, severity: 'info', description })
}

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  const isCron = process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`
  const isAdminKey = process.env.BARIO_ADMIN_API_KEY && authHeader === `Bearer ${process.env.BARIO_ADMIN_API_KEY}`
  if (!isCron && !isAdminKey) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const sql = await db()

  await Promise.all([checkKeyEndpoints(sql), checkWpHostingNodes(sql), checkStripe(sql), checkSentryConfigured(sql)])

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
