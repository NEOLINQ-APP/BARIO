import postgres from 'postgres'

// Switched from @neondatabase/serverless to postgres.js when the project
// moved off Neon to Supabase — Neon's driver only speaks its own HTTP proxy
// protocol, not standard Postgres wire protocol, so it couldn't point at
// Supabase at all. postgres.js supports the same `sql\`...\`` tagged-template
// calling convention, so every call site elsewhere in the codebase is
// unchanged. Points at Supabase's Supavisor pooler (transaction mode, port
// 6543) rather than a direct connection — serverless functions can spin up
// in large numbers, and a direct Postgres connection per invocation would
// exhaust the database's connection limit fast; the pooler is built
// specifically to absorb that. `max: 1` caps how many pooled connections any
// single invocation opens, and `prepare: false` is required in transaction-
// mode pooling, where a prepared statement from one query isn't guaranteed
// to hit the same underlying connection on the next.
let _sql: ReturnType<typeof postgres> | undefined
let schemaReady: Promise<void> | undefined

function getSql() {
  if (!_sql) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    _sql = postgres(url, { ssl: 'require', max: 1, prepare: false })
  }
  return _sql
}

async function ensureSchema() {
  const sql = getSql()
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      plan TEXT,
      subscription_status TEXT NOT NULL DEFAULT 'none',
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      is_admin BOOLEAN NOT NULL DEFAULT false,
      credits_remaining INTEGER NOT NULL DEFAULT 0,
      credits_reset_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS credits_remaining INTEGER NOT NULL DEFAULT 0`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS credits_reset_at TIMESTAMPTZ`
  // Grandfather in accounts that existed before email verification was required —
  // only backfills at the moment the column is first created, never again after.
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'email_verified') THEN
        ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT false;
        UPDATE users SET email_verified = true;
      END IF;
    END $$
  `
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0`
  // Personal media-library storage (separate product from the site plan —
  // a user can be on any site plan and independently subscribe for more
  // storage, same as Google One stacking on a free Google account).
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS storage_tier TEXT NOT NULL DEFAULT 'free'`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS storage_subscription_status TEXT NOT NULL DEFAULT 'none'`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_storage_subscription_id TEXT`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS family_group_id TEXT`
  // X-Drive end-to-end encryption. All key material here is opaque to the
  // server by construction: the MEK (master encryption key) is generated
  // client-side and never transmitted in plaintext — only wrapped (encrypted)
  // copies are stored, one wrapped by a key derived from the user's chosen
  // passphrase, one wrapped by a key derived from their recovery code. Losing
  // BOTH the passphrase and the recovery code means the MEK is unrecoverable
  // and every encrypted file is permanently unreadable — by design, this is
  // what "the server never sees plaintext" actually means. See lib/e2eCrypto.ts.
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS e2e_enabled BOOLEAN NOT NULL DEFAULT false`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS e2e_salt TEXT`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS e2e_wrapped_mek TEXT`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS e2e_wrapped_mek_iv TEXT`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS e2e_recovery_salt TEXT`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS e2e_recovery_wrapped_mek TEXT`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS e2e_recovery_wrapped_mek_iv TEXT`
  await sql`
    CREATE TABLE IF NOT EXISTS family_groups (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS family_invites (
      id TEXT PRIMARY KEY,
      family_group_id TEXT NOT NULL REFERENCES family_groups(id),
      email TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS media_assets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      folder TEXT NOT NULL DEFAULT '',
      filename TEXT NOT NULL,
      url TEXT NOT NULL,
      content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      size_bytes INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  // content_type on an encrypted row is still the REAL mime type (so the UI
  // knows to render an <img>/<video>, once decrypted) — only the blob body
  // itself is ciphertext. iv is the per-file AES-GCM nonce, base64, needed
  // to decrypt; it's safe to store in the clear (an IV isn't secret).
  await sql`ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS encrypted BOOLEAN NOT NULL DEFAULT false`
  await sql`ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS iv TEXT`
  await sql`
    CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL DEFAULT 'My Site',
      sections_json TEXT NOT NULL DEFAULT '[]',
      theme_json TEXT NOT NULL DEFAULT '{"primary":"#0A2342","accent":"#1a56db"}',
      subdomain TEXT UNIQUE,
      custom_domain TEXT UNIQUE,
      domain_status TEXT NOT NULL DEFAULT 'none',
      is_published BOOLEAN NOT NULL DEFAULT false,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS theme_json TEXT NOT NULL DEFAULT '{"primary":"#0A2342","accent":"#1a56db"}'`
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS subdomain TEXT UNIQUE`
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS custom_domain TEXT UNIQUE`
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS domain_status TEXT NOT NULL DEFAULT 'none'`
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT false`
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS meta_title TEXT`
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS meta_description TEXT`
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS analytics_id TEXT`
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS favicon_url TEXT`
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS content_mode TEXT NOT NULL DEFAULT 'sections'`
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS raw_html TEXT`
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS cloudflare_zone_id TEXT`
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS nameservers TEXT`
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS show_badge BOOLEAN NOT NULL DEFAULT true`
  // Manual payment-collection escalation for sites built outside the normal
  // Stripe flow (e.g. friends/family sites live before payment) — admin-only,
  // not tied to subscription_status. 'none' -> 'reminder_sent' (email) ->
  // 'warning_shown' (dashboard popup) -> 'locked' (site serves a maintenance
  // page instead of real content). See app/api/admin/users/collection-status.
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS collection_status TEXT NOT NULL DEFAULT 'none'`
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS collection_note TEXT`
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS collection_updated_at TIMESTAMPTZ`
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS business_name TEXT`
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS business_category TEXT`
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS business_hours TEXT`
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS business_location TEXT`
  await sql`
    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      html TEXT NOT NULL,
      is_premium BOOLEAN NOT NULL DEFAULT true,
      price_cents INTEGER NOT NULL DEFAULT 4900,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS template_licenses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      template_id TEXT NOT NULL REFERENCES templates(id),
      site_id TEXT,
      license_key TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending_approval',
      stripe_payment_intent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      folder TEXT NOT NULL DEFAULT '',
      filename TEXT NOT NULL,
      url TEXT NOT NULL,
      content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      size_bytes INTEGER NOT NULL DEFAULT 0,
      uploaded_by TEXT REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      token TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      token TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT NOT NULL,
      window_start TIMESTAMPTZ NOT NULL,
      count INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (key, window_start)
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS marketing_posts (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      error TEXT,
      external_post_id TEXT,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      posted_at TIMESTAMPTZ
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS marketing_connections (
      platform TEXT PRIMARY KEY,
      access_token TEXT NOT NULL,
      access_token_secret TEXT,
      refresh_token TEXT,
      expires_at TIMESTAMPTZ,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      connected_by TEXT REFERENCES users(id),
      connected_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS gift_codes (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      credits INTEGER NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      max_redemptions INTEGER,
      redemption_count INTEGER NOT NULL DEFAULT 0,
      expires_at TIMESTAMPTZ,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS gift_code_redemptions (
      id TEXT PRIMARY KEY,
      gift_code_id TEXT NOT NULL REFERENCES gift_codes(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (gift_code_id, user_id)
    )
  `
  // Snapshot of the previous raw_html, taken right before it gets overwritten
  // by an import/edit — lets the admin-restore tool undo a bad edit without
  // needing a full version history table.
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS raw_html_backup TEXT`
  await sql`
    CREATE TABLE IF NOT EXISTS admin_actions_log (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      target_email TEXT,
      params_json TEXT NOT NULL DEFAULT '{}',
      result TEXT NOT NULL,
      triggered_by TEXT NOT NULL DEFAULT 'admin',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  // Optional multi-page content for a site, additive to the single
  // sites.raw_html column above. A site with zero rows here is unaffected —
  // /site/[domain] keeps rendering exactly as before (sections_json or
  // sites.raw_html) regardless of the requested path. A site WITH rows here
  // switches to per-path lookup: '' (or the row with is_home) for the root,
  // otherwise the row matching the joined path segments as `slug`.
  await sql`
    CREATE TABLE IF NOT EXISTS site_pages (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      slug TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT 'Page',
      raw_html TEXT NOT NULL,
      is_home BOOLEAN NOT NULL DEFAULT false,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (site_id, slug)
    )
  `
  // Backs the public, unauthenticated site-audit endpoint's rate limit —
  // this route makes server-side requests to arbitrary user-supplied URLs
  // with no login required, so it needs its own abuse guard rather than
  // relying on session/plan checks like everything else that touches the
  // crawler.
  await sql`
    CREATE TABLE IF NOT EXISTS audit_requests (
      id TEXT PRIMARY KEY,
      ip TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS audit_requests_ip_idx ON audit_requests (ip, created_at)`
  await sql`
    CREATE TABLE IF NOT EXISTS support_messages (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      email TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  // Append-only — never updated. An Acceptable Use Policy only means
  // something if acceptance is affirmative and provable; this is that proof,
  // one row per order-specific "yes," with the exact policy version pinned
  // at accept-time so a later policy change can't retroactively alter what a
  // past customer is deemed to have agreed to.
  await sql`
    CREATE TABLE IF NOT EXISTS legal_acceptances (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      policy_slug TEXT NOT NULL,
      policy_version TEXT NOT NULL,
      accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      ip_address TEXT,
      user_agent TEXT
    )
  `
  // One row per Stripe purchase's resulting VPS, tracked through its whole
  // lifecycle via `status` — same shape as template_licenses, not sites,
  // since this is "one purchase's provisioned thing" rather than an
  // ever-editable resource. hetzner_server_type is denormalized at order
  // time so a later VPS_TIERS repricing never retroactively changes an
  // in-flight order.
  await sql`
    CREATE TABLE IF NOT EXISTS vps_instances (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      tier TEXT NOT NULL,
      billing_cycle TEXT NOT NULL DEFAULT 'monthly',
      region TEXT NOT NULL DEFAULT 'nbg1',
      hetzner_server_type TEXT,
      hostname TEXT,
      ssh_public_key TEXT,
      backup_addon BOOLEAN NOT NULL DEFAULT false,
      root_password_ciphertext TEXT,
      root_password_iv TEXT,
      root_password_revealed_at TIMESTAMPTZ,
      hetzner_server_id TEXT,
      primary_ipv4 TEXT,
      primary_ipv6 TEXT,
      status TEXT NOT NULL DEFAULT 'pending_payment',
      risk_flag TEXT NOT NULL DEFAULT 'none',
      last_error TEXT,
      legal_acceptance_id TEXT REFERENCES legal_acceptances(id),
      stripe_checkout_session_id TEXT,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      paid_at TIMESTAMPTZ,
      suspended_at TIMESTAMPTZ,
      deprovisioned_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  // The table above already existed from Phase 1 (before billing_cycle was
  // added to the CREATE statement) — CREATE TABLE IF NOT EXISTS silently
  // skips on an existing table, so the column needs this explicit ALTER to
  // actually reach production, same as every other post-launch column
  // addition in this file.
  await sql`ALTER TABLE vps_instances ADD COLUMN IF NOT EXISTS billing_cycle TEXT NOT NULL DEFAULT 'monthly'`

  // Tracks which CRM contacts already have an AI-drafted outreach note, so
  // the lead-gen cron doesn't redraft the same person every run. Keyed by
  // (crm_key, person_id) rather than a foreign key — the actual Person
  // record lives in a separate Twenty CRM workspace's own Postgres, not
  // this database.
  await sql`
    CREATE TABLE IF NOT EXISTS crm_leadgen_drafted (
      crm_key TEXT NOT NULL,
      person_id TEXT NOT NULL,
      note_id TEXT,
      drafted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (crm_key, person_id)
    )
  `
  // sent_at stays null until a human reviews and explicitly sends the
  // drafted outreach note (see app/api/admin/crm-leadgen/send) — never set
  // automatically, per the deliberate no-auto-send decision.
  await sql`ALTER TABLE crm_leadgen_drafted ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ`
  // What was actually emailed — kept separate from the CRM Note's text since
  // an admin can edit the subject/body before sending (see AdminCrmOutreach),
  // so the note and the real sent content can diverge. sent_email is the
  // exact address mail went to, used to match inbound replies back to this
  // contact even if the CRM record's email later changes.
  await sql`ALTER TABLE crm_leadgen_drafted ADD COLUMN IF NOT EXISTS sent_email TEXT`
  await sql`ALTER TABLE crm_leadgen_drafted ADD COLUMN IF NOT EXISTS sent_subject TEXT`
  await sql`ALTER TABLE crm_leadgen_drafted ADD COLUMN IF NOT EXISTS sent_body TEXT`
  // "Send later" — when set (and sent_at is still null), app/api/cron/crm-
  // outreach-scheduled sends it once scheduled_at has passed, using
  // scheduled_subject/scheduled_body exactly like an immediate edited send.
  await sql`ALTER TABLE crm_leadgen_drafted ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ`
  await sql`ALTER TABLE crm_leadgen_drafted ADD COLUMN IF NOT EXISTS scheduled_subject TEXT`
  await sql`ALTER TABLE crm_leadgen_drafted ADD COLUMN IF NOT EXISTS scheduled_body TEXT`

  // One row per inbound reply detected in an outreach mailbox (see
  // app/api/cron/crm-outreach-replies). response_mode/response_sent_at
  // track how (and whether) a human answered it — nothing here sends a
  // response automatically, matching the same no-auto-send principle as
  // the initial outreach.
  await sql`
    CREATE TABLE IF NOT EXISTS crm_outreach_replies (
      id TEXT PRIMARY KEY,
      crm_key TEXT NOT NULL,
      person_id TEXT,
      from_email TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      message_id TEXT UNIQUE,
      received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      response_mode TEXT,
      response_body TEXT,
      response_sent_at TIMESTAMPTZ
    )
  `
  // Same "send later" pattern as crm_leadgen_drafted, for reply responses.
  await sql`ALTER TABLE crm_outreach_replies ADD COLUMN IF NOT EXISTS scheduled_response_at TIMESTAMPTZ`
  await sql`ALTER TABLE crm_outreach_replies ADD COLUMN IF NOT EXISTS scheduled_response_body TEXT`
  await sql`ALTER TABLE crm_outreach_replies ADD COLUMN IF NOT EXISTS scheduled_response_mode TEXT`

  // Tracks which CRM contacts have already been checked for a real email
  // address on their own company website, so the enrichment cron doesn't
  // re-fetch the same site every run. found=false is still a useful record
  // (that business just doesn't publish a contact email) — don't retry it
  // forever.
  await sql`
    CREATE TABLE IF NOT EXISTS crm_email_enrichment (
      crm_key TEXT NOT NULL,
      person_id TEXT NOT NULL,
      found BOOLEAN NOT NULL,
      checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (crm_key, person_id)
    )
  `

  // One row per Studio generation (video or voiceover). Credits are charged
  // up front at submit time (same convention as the builder route) and
  // refunded here if the job ends up failing — see app/api/studio/generate
  // and app/api/cron/studio-reconcile.
  await sql`
    CREATE TABLE IF NOT EXISTS studio_jobs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      job_type TEXT NOT NULL,
      provider_request_id TEXT,
      input_params JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      output_url TEXT,
      credits_charged INTEGER NOT NULL,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      completed_at TIMESTAMPTZ
    )
  `
}

export async function db() {
  if (!schemaReady) schemaReady = ensureSchema()
  await schemaReady
  return getSql()
}

export type User = {
  id: string
  email: string
  password_hash: string
  plan: string | null
  subscription_status: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  is_admin: boolean
  credits_remaining: number
  credits_reset_at: string | null
  email_verified: boolean
  session_version: number
  storage_tier: string
  storage_subscription_status: string
  stripe_storage_subscription_id: string | null
  family_group_id: string | null
  e2e_enabled: boolean
  e2e_salt: string | null
  e2e_wrapped_mek: string | null
  e2e_wrapped_mek_iv: string | null
  e2e_recovery_salt: string | null
  e2e_recovery_wrapped_mek: string | null
  e2e_recovery_wrapped_mek_iv: string | null
}

export type VpsInstance = {
  id: string
  user_id: string
  tier: string
  billing_cycle: string
  region: string
  hetzner_server_type: string | null
  hostname: string | null
  ssh_public_key: string | null
  backup_addon: boolean
  root_password_ciphertext: string | null
  root_password_iv: string | null
  root_password_revealed_at: string | null
  hetzner_server_id: string | null
  primary_ipv4: string | null
  primary_ipv6: string | null
  status: string
  risk_flag: string
  last_error: string | null
  legal_acceptance_id: string | null
  stripe_checkout_session_id: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  paid_at: string | null
  suspended_at: string | null
  deprovisioned_at: string | null
  created_at: string
  updated_at: string
}

export type MediaAsset = {
  id: string
  user_id: string
  folder: string
  filename: string
  url: string
  content_type: string
  size_bytes: number
  created_at: string
  encrypted: boolean
  iv: string | null
}

export type FamilyGroup = {
  id: string
  owner_user_id: string
  created_at: string
}

export type FamilyInvite = {
  id: string
  family_group_id: string
  email: string
  token: string
  status: string
  created_at: string
  expires_at: string
}

export type Template = {
  id: string
  title: string
  category: string
  description: string
  html: string
  is_premium: boolean
  price_cents: number
}

export type Asset = {
  id: string
  folder: string
  filename: string
  url: string
  content_type: string
  size_bytes: number
  uploaded_by: string | null
  created_at: string
}

export type Site = {
  id: string
  user_id: string
  name: string
  sections_json: string
  theme_json: string
  subdomain: string | null
  custom_domain: string | null
  domain_status: 'none' | 'pending' | 'verified'
  is_published: boolean
  meta_title: string | null
  meta_description: string | null
  analytics_id: string | null
  favicon_url: string | null
  content_mode: 'sections' | 'template'
  raw_html: string | null
  cloudflare_zone_id: string | null
  nameservers: string | null
  show_badge: boolean
  business_name: string | null
  business_category: string | null
  business_hours: string | null
  business_location: string | null
}

export type SitePage = {
  id: string
  site_id: string
  slug: string
  name: string
  raw_html: string
  is_home: boolean
  updated_at: string
}

export type MarketingPlatform = 'twitter' | 'facebook' | 'instagram' | 'linkedin' | 'google_business'

export type MarketingPost = {
  id: string
  platform: MarketingPlatform
  content: string
  status: 'draft' | 'approved' | 'posted' | 'failed' | 'rejected'
  error: string | null
  external_post_id: string | null
  created_by: string
  created_at: string
  posted_at: string | null
}

// One row per platform's OAuth connection. Facebook and Instagram share a
// single Meta connection (a Page token covers both — Instagram posting just
// needs the linked IG Business Account ID, stored in metadata_json), so
// Instagram never gets its own row; its "connected" status is derived from
// the facebook row having an igUserId in metadata.
export type MarketingConnection = {
  platform: MarketingPlatform
  access_token: string
  access_token_secret: string | null
  refresh_token: string | null
  expires_at: string | null
  metadata_json: string
  connected_by: string | null
  connected_at: string
}

export type GiftCode = {
  id: string
  code: string
  credits: number
  note: string
  max_redemptions: number | null
  redemption_count: number
  expires_at: string | null
  is_active: boolean
  created_by: string
}

export type AdminActionLog = {
  id: string
  action: string
  target_email: string | null
  params_json: string
  result: string
  triggered_by: 'admin' | 'ai_autonomous'
  created_at: string
}

export type SupportMessage = {
  id: string
  user_id: string | null
  email: string
  subject: string
  message: string
  status: 'open' | 'closed'
  created_at: string
}
