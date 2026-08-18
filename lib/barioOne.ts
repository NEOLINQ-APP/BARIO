import { NextResponse } from 'next/server'
import { randomUUID, randomBytes } from 'node:crypto'
import { getSession } from '@/lib/session'
import { db, type User, type BoOrganization, type BoMembership } from '@/lib/db'
import { BO_MODULES, ensureModulesForOrg, getEnabledModules, hasModule, resolveModuleDependencies, seatLimitForModules, type BoModuleKey } from '@/lib/barioOneModules'
import { sendEmail } from '@/lib/email'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40) || 'company'
}

async function uniqueSlug(sql: any, name: string): Promise<string> {
  const base = slugify(name)
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${randomBytes(2).toString('hex')}`
    const existing = (await sql`SELECT 1 FROM bo_organizations WHERE slug = ${candidate}`) as unknown[]
    if (existing.length === 0) return candidate
  }
  // Astronomically unlikely to be reached given the loop above, but a
  // fully random fallback guarantees this function can never throw.
  return `${base}-${randomUUID().slice(0, 8)}`
}

// The one place an Organization + its owner membership get created —
// called from both the public /bario-one signup flow and (later) an admin
// comped-account flow, same shape as provisionVpsInstance being the single
// shared entry point for both the webhook and admin retry routes.
//
// Takes the real module selection directly (resolved to include
// dependencies) rather than one of the old fixed plan names — modular
// packaging is the real entitlement/billing mechanism now (see
// lib/barioOneModules.ts). `plan` stays 'starter' (the column's default)
// purely for backward-compat display; it's never read as authoritative
// anywhere anymore. Every self-serve signup gets a flat 14-day no-card
// trial covering whatever modules were selected — same policy every fixed
// plan used to share (only Enterprise, which isn't self-serve, had none).
export async function createOrganizationWithOwner(
  sql: any,
  ownerUserId: string,
  name: string,
  moduleKeys: BoModuleKey[]
): Promise<BoOrganization> {
  const id = randomUUID()
  const slug = await uniqueSlug(sql, name)
  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
  const enabledModulesJson = JSON.stringify(resolveModuleDependencies(moduleKeys))

  await sql`
    INSERT INTO bo_organizations (id, name, slug, owner_user_id, subscription_status, trial_ends_at, enabled_modules_json)
    VALUES (${id}, ${name}, ${slug}, ${ownerUserId}, 'trialing', ${trialEndsAt}, ${enabledModulesJson})
  `
  await sql`
    INSERT INTO bo_memberships (id, organization_id, user_id, role, status)
    VALUES (${randomUUID()}, ${id}, ${ownerUserId}, 'owner', 'active')
  `

  const rows = (await sql`SELECT * FROM bo_organizations WHERE id = ${id}`) as unknown as BoOrganization[]
  return rows[0]
}

// A user can belong to more than one organization eventually (e.g. an
// accountant managing multiple clients' Bario One accounts) — v1 picks the
// most recently created active membership, same "most recent wins" default
// resolveSiteId() already uses for a user's sites.
export async function getActiveOrgForUser(
  sql: any,
  userId: string
): Promise<{ org: BoOrganization; membership: BoMembership } | null> {
  const rows = (await sql`
    SELECT o.*, m.id as membership_id, m.role as membership_role, m.status as membership_status
    FROM bo_memberships m
    JOIN bo_organizations o ON o.id = m.organization_id
    WHERE m.user_id = ${userId} AND m.status = 'active'
    ORDER BY m.created_at DESC
    LIMIT 1
  `) as unknown as (BoOrganization & { membership_id: string; membership_role: BoMembership['role']; membership_status: BoMembership['status'] })[]
  const row = rows[0]
  if (!row) return null
  const { membership_id, membership_role, membership_status, ...org } = row
  return {
    org: org as BoOrganization,
    membership: {
      id: membership_id,
      organization_id: org.id,
      user_id: userId,
      invited_email: null,
      invite_token: null,
      role: membership_role,
      status: membership_status,
      created_at: org.created_at,
      updated_at: org.updated_at,
    },
  }
}

export async function listOrgMembers(sql: any, organizationId: string): Promise<(BoMembership & { email: string | null })[]> {
  return (await sql`
    SELECT m.*, u.email
    FROM bo_memberships m
    LEFT JOIN users u ON u.id = m.user_id
    WHERE m.organization_id = ${organizationId}
    ORDER BY m.created_at ASC
  `) as unknown as (BoMembership & { email: string | null })[]
}

// Record-level permissions (2026-08-17): an employee only sees customers/
// deals assigned to them; owners/admins always see everything regardless
// of assignment. An unassigned record stays visible to everyone so nothing
// pre-existing silently disappears from an employee's view on rollout.
export function isRecordVisibleToMember(membership: BoMembership, assignedToUserId: string | null): boolean {
  if (membership.role !== 'employee') return true
  return assignedToUserId === null || assignedToUserId === membership.user_id
}

function seatCount(org: BoOrganization): number | null {
  return seatLimitForModules(getEnabledModules(org))
}

// Invites a teammate by email — if they already have a Bario account, this
// still creates a *pending* membership (not an active one) so accepting is
// a deliberate action, not silent auto-join just because the email matched.
export async function inviteMember(
  sql: any,
  organizationId: string,
  invitedByEmail: string,
  email: string,
  role: 'admin' | 'employee',
  acceptBaseUrl: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const normalizedEmail = email.trim().toLowerCase()

  const orgRows = (await sql`SELECT * FROM bo_organizations WHERE id = ${organizationId}`) as unknown as BoOrganization[]
  let org = orgRows[0]
  if (!org) return { ok: false, error: 'Organization not found' }
  org = await ensureModulesForOrg(sql, org)

  const limit = seatCount(org)
  if (limit !== null) {
    const countRows = (await sql`
      SELECT count(*)::int as count FROM bo_memberships
      WHERE organization_id = ${organizationId} AND status IN ('active', 'invited')
    `) as unknown as { count: number }[]
    if ((countRows[0]?.count ?? 0) >= limit) {
      return { ok: false, error: `Your current modules are limited to ${limit} users — enable another module to add more seats.` }
    }
  }

  const existing = (await sql`
    SELECT 1 FROM bo_memberships
    WHERE organization_id = ${organizationId}
      AND (invited_email = ${normalizedEmail} OR user_id IN (SELECT id FROM users WHERE email = ${normalizedEmail}))
      AND status IN ('active', 'invited')
  `) as unknown[]
  if (existing.length > 0) {
    return { ok: false, error: 'That person is already a member or has a pending invite' }
  }

  const token = randomBytes(24).toString('hex')
  const existingUserRows = (await sql`SELECT id FROM users WHERE email = ${normalizedEmail}`) as unknown as { id: string }[]
  const userId = existingUserRows[0]?.id ?? null

  await sql`
    INSERT INTO bo_memberships (id, organization_id, user_id, invited_email, invite_token, role, status)
    VALUES (${randomUUID()}, ${organizationId}, ${userId}, ${normalizedEmail}, ${token}, ${role}, 'invited')
  `

  const acceptUrl = `${acceptBaseUrl}/dashboard/bario-one/invite?token=${token}`
  await sendEmail(
    normalizedEmail,
    `${invitedByEmail} invited you to join ${org.name} on Bario One`,
    `<p>${invitedByEmail} invited you to join <strong>${org.name}</strong> on Bario One as a${role === 'admin' ? 'n' : ''} ${role}.</p>
     <p><a href="${acceptUrl}">Click here to accept the invite</a>. You'll need a Bario account with this email address, or you can create one first.</p>`
  )

  return { ok: true }
}

export async function acceptInvite(sql: any, token: string, userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const rows = (await sql`SELECT * FROM bo_memberships WHERE invite_token = ${token} AND status = 'invited'`) as unknown as BoMembership[]
  const membership = rows[0]
  if (!membership) return { ok: false, error: 'That invite link is invalid or has already been used' }

  const userRows = (await sql`SELECT email FROM users WHERE id = ${userId}`) as unknown as { email: string }[]
  const userEmail = userRows[0]?.email?.toLowerCase()
  if (membership.invited_email && userEmail !== membership.invited_email) {
    return { ok: false, error: `This invite was sent to ${membership.invited_email} — log in with that email to accept it` }
  }

  await sql`
    UPDATE bo_memberships
    SET user_id = ${userId}, status = 'active', invite_token = NULL, updated_at = now()
    WHERE id = ${membership.id}
  `
  return { ok: true }
}

// Shared guard for every Bario One module API route (CRM, and every module
// after it) — same "return NextResponse or value" shape as requireAdmin(),
// so a route just does `const auth = await requireBoMembership(); if (auth
// instanceof NextResponse) return auth`.
export async function requireBoMembership(): Promise<
  | { sql: any; user: User; org: BoOrganization; membership: BoMembership }
  | NextResponse
> {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const sql = await db()
  const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
  const user = userRows[0]
  if (!user) return NextResponse.json({ error: 'Account not found' }, { status: 401 })

  const found = await getActiveOrgForUser(sql, user.id)
  if (!found) return NextResponse.json({ error: 'Set up Bario One for your business first' }, { status: 404 })

  return { sql, user, org: found.org, membership: found.membership }
}

// Module-gated variant of requireBoMembership() — every route for a paid
// module (CRM, Invoicing, Payments, Employees, Payroll, POS, AI Assistant,
// API & Integrations) calls this instead, with its module key. Same return
// shape, so the call-site idiom (`if (auth instanceof NextResponse) return
// auth`) never changes at the ~60 call sites — only which guard function is
// called. Lazily backfills enabled_modules_json on first touch (see
// ensureModulesForOrg) so a pre-existing org's access doesn't change on the
// day this system rolled out.
// Real gap found 2026-08-18: `enabled_modules_json` containing a module
// key was the ONLY thing this guard ever checked — subscription_status
// and trial_ends_at were never consulted anywhere in this function, so an
// org whose 14-day trial had lapsed (never converted to a paid Stripe
// subscription) or whose subscription was actually canceled kept full
// access to every paid module — including AI Assistant's find_new_leads
// tool, which spends real Anthropic/web-search cost per call — forever,
// for free. AFC Logistics and Sunbuilt Group's own Bario One orgs are
// still sitting at subscription_status='trialing' today, which is exactly
// the scenario this closes. 'past_due' is deliberately still allowed
// (Stripe is mid-retry on a real subscription, not "no subscription") —
// only an unconverted expired trial or an actually-canceled subscription
// blocks access now.
function hasActiveEntitlement(org: BoOrganization): boolean {
  if (org.subscription_status === 'active' || org.subscription_status === 'past_due') return true
  if (org.subscription_status === 'trialing') {
    if (!org.trial_ends_at) return true
    return new Date(org.trial_ends_at).getTime() > Date.now()
  }
  return false
}

export async function requireBoModule(
  moduleKey: BoModuleKey
): Promise<{ sql: any; user: User; org: BoOrganization; membership: BoMembership } | NextResponse> {
  const auth = await requireBoMembership()
  if (auth instanceof NextResponse) return auth

  const org = await ensureModulesForOrg(auth.sql, auth.org)
  if (!hasModule(org, moduleKey)) {
    return NextResponse.json(
      { error: 'module_not_enabled', moduleKey, moduleName: BO_MODULES[moduleKey].name },
      { status: 403 }
    )
  }

  if (!hasActiveEntitlement(org)) {
    return NextResponse.json(
      { error: 'subscription_required', message: 'Your free trial has ended — subscribe to keep using Bario One.' },
      { status: 402 }
    )
  }

  return { ...auth, org }
}
