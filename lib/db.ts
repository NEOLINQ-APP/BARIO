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

// Bump this whenever a new CREATE TABLE/ALTER TABLE/CREATE INDEX statement
// is added anywhere below -- the fast path skips the entire rest of
// ensureSchema() once the DB's recorded version matches this, so a schema
// change shipped without bumping it will silently never run in production
// until the version changes again for some other reason. This is the
// deliberate tradeoff (see [[bario_afc_sunbuilt_lockout_and_disconnection]]
// for why it was added, 2026-08-19): the full ~289-statement sequence used
// to re-run on every single cold start (schemaReady is a module-level
// variable, reset on every fresh container), which under concurrent load
// (crons + admin + real traffic all cold-starting near each other) was
// exhausting Supabase's Supavisor connection pool and hanging every
// DB-touching route platform-wide, while non-DB routes stayed fast. Ship a
// schema change and forget to bump this = a real, live "why isn't my new
// column there" bug, not a hypothetical.
const CURRENT_SCHEMA_VERSION = 'v10-2026-08-21-spott-integration-phase2'

async function ensureSchema() {
  const sql = getSql()
  await sql`
    CREATE TABLE IF NOT EXISTS platform_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  const [marker] = await sql<{ value: string }[]>`SELECT value FROM platform_settings WHERE key = 'schema_version'`
  if (marker?.value === CURRENT_SCHEMA_VERSION) return

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

  // Lead capture for the public "meet Victoria" personal-assistant demo
  // page (2026-08-19) — a real live public phone/voice demo needs real
  // abuse-prevention design (new number, rate limiting, a restricted
  // toolset) that shouldn't be rushed, so the page's "try it" CTA is a
  // callback request instead for now, notified to Sherwin via SMS
  // (see app/api/public/victoria-demo-request/route.ts).
  await sql`
    CREATE TABLE IF NOT EXISTS victoria_demo_requests (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone_number TEXT NOT NULL,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  // 'personal' (Victoria, /victoria) or 'business' (AI Receptionist,
  // /ai-receptionist) — same table, same notify-Sherwin flow, just tagged
  // so leads aren't mixed up when reviewing them.
  await sql`ALTER TABLE victoria_demo_requests ADD COLUMN IF NOT EXISTS product TEXT NOT NULL DEFAULT 'personal'`
  await sql`ALTER TABLE victoria_demo_requests ADD COLUMN IF NOT EXISTS company_name TEXT`
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
  // Free-text internal note an admin can set on an account (billing holds,
  // suspensions, anything the support assistant should proactively know
  // about) -- surfaced into the post-login support assistant's own prompt
  // (app/api/assistant/support/route.ts) so it can speak to the situation
  // instead of giving a generic answer if the customer reaches out.
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_note TEXT`
  // NULL = active. Checked in both getSession() (kicks out an already-live
  // session on the very next request, not just future logins) and the login
  // route (clear "suspended" message instead of a generic invalid-password
  // error). Suspending also bumps session_version as a second, independent
  // layer — belt and suspenders, not redundant with the getSession() check.
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ`
  // A billing hold, not a discount — while in the future, this account must
  // never be auto-charged for hosting (app/api/checkout), any Bario One
  // module (app/api/bario-one/modules/checkout|update, keyed off the org
  // owner's user id), or a domain registration (app/api/domains/register).
  // Deliberately ONE shared date across all three rather than three
  // separate ones: extending it extends hosting+CRM+domains together by
  // construction, which is exactly what was asked for, not something that
  // needs remembering to keep in sync. NULL/past = no hold, normal billing
  // applies. Set via POST /api/admin/users/billing-protection.
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS comp_protected_until TIMESTAMPTZ`
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
  // content_hash (client-computed SHA-256 of the plaintext file, sent as a
  // form field on upload) and updated_at are what the X-Drive desktop sync
  // client needs to do real delta sync — without them the only way to know
  // "did this file change" is name+size+mtime, which is what the browser's
  // tab-only watcher falls back to today and is genuinely fragile.
  await sql`ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS content_hash TEXT`
  await sql`ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
  // Durable, revocable credentials for the desktop sync client — the only
  // auth a regular (non-admin) user has today is the browser session
  // cookie (lib/session.ts), which isn't something a native app should
  // hold onto indefinitely. token stores only a hash, never the raw token
  // (same "never store the secret itself" principle as password_hash).
  await sql`
    CREATE TABLE IF NOT EXISTS personal_access_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      token_hash TEXT NOT NULL UNIQUE,
      device_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_used_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ
    )
  `
  // Real per-contact conversation memory for Victoria's SMS/WhatsApp replies
  // (app/api/twilio/miko-sms) — without this, every inbound text would be
  // answered with zero memory of anything said before it in the same thread.
  await sql`
    CREATE TABLE IF NOT EXISTS victoria_messages (
      id TEXT PRIMARY KEY,
      phone_number TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'sms',
      direction TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS victoria_messages_phone_idx ON victoria_messages (phone_number, created_at)`

  // Conversation memory for the new installable Victoria assistant app
  // (session/login-based, not phone-number-based like SMS/WhatsApp above) —
  // separate table since this channel is keyed by user_id, not a phone
  // number, and carries tool-call/attachment metadata the text line doesn't.
  await sql`
    CREATE TABLE IF NOT EXISTS victoria_app_messages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      direction TEXT NOT NULL,
      body TEXT NOT NULL,
      attachments_json TEXT,
      tool_log_json TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS victoria_app_messages_user_idx ON victoria_app_messages (user_id, created_at)`

  // Deferred calls/texts Victoria places on her own -- a wake-up call, a
  // reminder call, a scheduled text -- distinct from make_call/send_text
  // (lib/victoriaAppTools.ts), which only ever execute immediately. The
  // app/api/cron/victoria-scheduled-actions cron polls for
  // status='pending' AND run_at <= now() every 5 minutes (matches the
  // finest existing cron cadence in this project, bo-campaigns-scheduled)
  // and actually places the call/sends the text at that point, using the
  // exact same lib/twilio.ts functions the immediate tools already use.
  await sql`
    CREATE TABLE IF NOT EXISTS victoria_scheduled_actions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      action_type TEXT NOT NULL CHECK(action_type IN ('call','text')),
      to_number TEXT NOT NULL,
      message TEXT NOT NULL,
      run_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','failed','cancelled')),
      result TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      completed_at TIMESTAMPTZ
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS victoria_scheduled_actions_due_idx ON victoria_scheduled_actions (status, run_at)`

  // Family members (Mya, Julianna, ...) get their own Victoria app access —
  // link + access_token instead of a real Bario login, since they're not
  // Bario customers. Deliberately its own table/token scheme rather than a
  // users row, so a leaked token can only ever reach this member's own
  // restricted chat (see lib/victoriaFamilyTools.ts's much smaller tool
  // set), never Sherwin's business tools or account.
  await sql`
    CREATE TABLE IF NOT EXISTS victoria_family_members (
      key TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone_number TEXT,
      access_token TEXT NOT NULL,
      last_location_lat DOUBLE PRECISION,
      last_location_lng DOUBLE PRECISION,
      last_location_at TIMESTAMPTZ,
      location_sharing_enabled BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS victoria_family_messages (
      id TEXT PRIMARY KEY,
      member_key TEXT NOT NULL REFERENCES victoria_family_members(key),
      direction TEXT NOT NULL,
      body TEXT NOT NULL,
      attachments_json TEXT,
      tool_log_json TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS victoria_family_messages_member_idx ON victoria_family_messages (member_key, created_at)`

  // Queue for coding tasks Victoria hands off to Claude rather than doing
  // herself — picked up by an hourly "Victoria Coding Dispatcher" routine
  // (a real Claude Code cloud session, created outside this repo via the
  // remote-trigger API) which does the work, commits it, and narrates
  // progress back into victoria_app_messages via /api/admin/victoria/narrate.
  await sql`
    CREATE TABLE IF NOT EXISTS coding_task_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      task TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      result TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      completed_at TIMESTAMPTZ
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS coding_task_requests_status_idx ON coding_task_requests (status, created_at)`

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
  // NEO — automated health-check detection + narrow, pre-approved auto-fix
  // log. `status` starts 'detected'; a registered safe action (see
  // lib/neoActions.ts) flips it straight to 'auto_fixed' with what it did;
  // anything without a registered safe action stays 'needs_review' for a
  // human, on purpose — NEO never invents a remediation for a pattern it
  // wasn't explicitly given permission to act on. Mirrors
  // admin_actions_log's shape deliberately so both audit trails read the
  // same way in the admin panel.
  await sql`
    CREATE TABLE IF NOT EXISTS neo_incidents (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      category TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info',
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'detected',
      action_taken TEXT,
      details_json TEXT NOT NULL DEFAULT '{}',
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  // Prevents the same still-open problem from spamming a fresh row every
  // 15 minutes — a health check re-detecting the same category+description
  // combo updates the existing open incident's timestamp instead of
  // creating a duplicate. Partial (only over open incidents) so a
  // recurring issue that gets resolved and comes back later legitimately
  // gets a new row, not silently merged into the old resolved one.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS neo_incidents_open_dedupe_idx
      ON neo_incidents (source, category, description)
      WHERE status IN ('detected', 'needs_review')
  `
  // Widened 2026-08-19 to also cover 'pending_approval' (see below) so a
  // still-pending proposal re-detected on the next 15-min run updates the
  // existing row instead of spamming a duplicate. Cheap to rebuild at this
  // table's size; DROP+CREATE since a partial index's WHERE clause can't
  // be altered in place and IF NOT EXISTS would otherwise silently keep
  // the old predicate.
  await sql`DROP INDEX IF EXISTS neo_incidents_open_dedupe_idx`
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS neo_incidents_open_dedupe_idx
      ON neo_incidents (source, category, description)
      WHERE status IN ('detected', 'needs_review', 'pending_approval')
  `
  // NEO merged with the admin assistant's tools 2026-08-19 (user's explicit
  // instruction: "he can repair and fix things but needs my approval on
  // something major"). Mirrors the existing safe-action registry
  // (lib/neoActions.ts) but for fixes real enough to propose, not run
  // blind: a category with an entry in lib/neoApprovalActions.ts flips an
  // incident to 'pending_approval' with the exact tool+args NEO wants to
  // run, notifies the admin (SMS), and only executes if explicitly
  // approved via /admin/neo — never on a timer, never without a click.
  await sql`ALTER TABLE neo_incidents ADD COLUMN IF NOT EXISTS proposed_tool TEXT`
  await sql`ALTER TABLE neo_incidents ADD COLUMN IF NOT EXISTS proposed_args_json TEXT`
  await sql`ALTER TABLE neo_incidents ADD COLUMN IF NOT EXISTS proposed_label TEXT`
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

  // Gated site-audit feature (2026-08-13) — persists both the free
  // rule-based findings and the paid AI deep-dive report per logged-in
  // user, so results can be revisited without re-crawling, and so the
  // deep-dive's credit charge has a durable receipt (charged only after a
  // successful LLM response — see app/api/site-audit/deep/route.ts).
  await sql`
    CREATE TABLE IF NOT EXISTS site_audits (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      url TEXT NOT NULL,
      findings_json TEXT NOT NULL,
      ai_report_json TEXT,
      credits_charged INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'complete',
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS site_audits_user_idx ON site_audits (user_id, created_at DESC)`

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
  // 'blank' (default, existing behavior) or 'wordpress' — buildUserData()
  // branches on this to install a WordPress+MariaDB+Nginx+Certbot stack
  // instead of just the security-patch baseline. See lib/cloudInit.ts.
  await sql`ALTER TABLE vps_instances ADD COLUMN IF NOT EXISTS app_type TEXT NOT NULL DEFAULT 'blank'`
  // WordPress-app_type-only fields. wp_admin_password mirrors the existing
  // root_password one-time-reveal pattern (see reveal-password route) rather
  // than a new mechanism. wp_domain/wp_cert_issued_at track the single
  // customer-supplied domain this box's nginx+certbot are configured for —
  // a dedicated box only ever serves one WordPress site, so one domain is
  // all this needs (unlike the shared-hosting tier's own domain handling).
  await sql`ALTER TABLE vps_instances ADD COLUMN IF NOT EXISTS wp_admin_user TEXT`
  await sql`ALTER TABLE vps_instances ADD COLUMN IF NOT EXISTS wp_admin_password_ciphertext TEXT`
  await sql`ALTER TABLE vps_instances ADD COLUMN IF NOT EXISTS wp_admin_password_iv TEXT`
  await sql`ALTER TABLE vps_instances ADD COLUMN IF NOT EXISTS wp_admin_password_revealed_at TIMESTAMPTZ`
  await sql`ALTER TABLE vps_instances ADD COLUMN IF NOT EXISTS wp_domain TEXT`
  await sql`ALTER TABLE vps_instances ADD COLUMN IF NOT EXISTS wp_cert_issued_at TIMESTAMPTZ`

  // Shared WordPress hosting (Product B) — Bario-owned Docker hosts, each
  // running the node-agent service (lives outside this repo, see
  // lib/wpSharedProvision.ts's comment) + Caddy for on-demand TLS. Capacity
  // is denominated in MB of the per-site RAM budget (not an arbitrary slot
  // count) so the counter can never drift from what's actually allocated —
  // see the validation-spike writeup in the plan file for why Caddy
  // specifically, and confirmed live 2026-08-05 that a cert survives a
  // service restart without re-issuing.
  await sql`
    CREATE TABLE IF NOT EXISTS wp_hosting_nodes (
      id TEXT PRIMARY KEY,
      ipv4 TEXT NOT NULL,
      agent_api_token_ciphertext TEXT NOT NULL,
      agent_api_token_iv TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      capacity_max_mb INTEGER NOT NULL,
      capacity_used_mb INTEGER NOT NULL DEFAULT 0,
      last_health_check_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `

  // ram_mb is this site's slice of its node's capacity — set once at
  // provision time from the tier the customer bought, used both as the
  // container's real mem_limit and as the capacity accounting unit, so the
  // two can never disagree with each other.
  await sql`
    CREATE TABLE IF NOT EXISTS wp_sites (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      node_id TEXT REFERENCES wp_hosting_nodes(id),
      container_name TEXT,
      ram_mb INTEGER NOT NULL DEFAULT 512,
      subdomain TEXT UNIQUE,
      custom_domain TEXT UNIQUE,
      domain_status TEXT NOT NULL DEFAULT 'none',
      status TEXT NOT NULL DEFAULT 'pending_payment',
      wp_admin_user TEXT,
      wp_admin_password_ciphertext TEXT,
      wp_admin_password_iv TEXT,
      wp_admin_password_revealed_at TIMESTAMPTZ,
      stripe_checkout_session_id TEXT,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `

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
  // AI sentiment classification (see app/api/cron/crm-outreach-replies) —
  // 'interested' | 'not_interested' | 'ooo_wrong_person' | 'neutral'. Purely
  // a UI/routing signal; 'not_interested' additionally inserts a row into
  // crm_do_not_contact so future outreach cron runs skip that person, but
  // nothing here auto-sends anything.
  await sql`ALTER TABLE crm_outreach_replies ADD COLUMN IF NOT EXISTS sentiment TEXT`

  // Suppresses future outreach drafts/re-engagement for a contact who
  // explicitly asked not to be contacted (detected via reply sentiment).
  // Checked by app/api/cron/crm-leadgen before drafting a new note.
  await sql`
    CREATE TABLE IF NOT EXISTS crm_do_not_contact (
      crm_key TEXT NOT NULL,
      person_id TEXT NOT NULL,
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (crm_key, person_id)
    )
  `

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

  // Bario Build — the new self-hosted AI app/site builder (chat -> real
  // files -> real sandbox -> real hosting), separate product from the
  // section-based Sky/Zeus builder above. See the plan at
  // C:\Users\surew\.claude\plans\unified-wishing-salamander.md.
  await sql`
    CREATE TABLE IF NOT EXISTS build_projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      framework_hint TEXT NOT NULL DEFAULT 'node',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `

  // File-tree state, one row per file — not a real git repo per project,
  // see the plan's "why rows-per-file" note. Binary/large assets go to
  // Vercel Blob and blob_url references them instead of inlining content.
  await sql`
    CREATE TABLE IF NOT EXISTS build_files (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES build_projects(id) ON DELETE CASCADE,
      path TEXT NOT NULL,
      content TEXT,
      is_binary BOOLEAN NOT NULL DEFAULT false,
      blob_url TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (project_id, path)
    )
  `

  // Persisted chat history per project — Builder.tsx keeps this
  // client-side only, but an agent loop that runs real shell commands
  // needs a durable transcript so a project can be closed and resumed.
  await sql`
    CREATE TABLE IF NOT EXISTS build_chat_messages (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES build_projects(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tool_calls_json TEXT NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `

  // One row per live ephemeral dev sandbox — the vps_instances analog for
  // this product. container_id/preview_url are set once the sandbox host
  // confirms creation (lib/sandboxHost.ts). expires_at is the idle-timeout
  // reap target, extended on activity by whatever polls session health.
  await sql`
    CREATE TABLE IF NOT EXISTS build_sandbox_sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES build_projects(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      container_id TEXT,
      status TEXT NOT NULL DEFAULT 'starting',
      preview_url TEXT,
      last_active_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `

  // Resolve any pre-existing duplicate active sessions *before* creating
  // the uniqueness constraint below. IF NOT EXISTS on the CREATE UNIQUE
  // INDEX only skips re-creation once the index already exists — it does
  // nothing for a first attempt that fails outright because current rows
  // already violate it, which is exactly the state real data can be in
  // (the race this index fixes already produced duplicate 'running' rows
  // for the same project before this migration ever ran). A failed CREATE
  // INDEX here would throw inside ensureSchema(), which every route calling
  // db() awaits — breaking login, admin, and every hosted site, not just
  // Bario Build. Keeping only the newest row per project active lets the
  // index creation below succeed unconditionally regardless of DB state.
  await sql`
    UPDATE build_sandbox_sessions b
    SET status = 'failed', last_error = 'superseded by a newer session for the same project (schema migration cleanup)', updated_at = now()
    WHERE b.status IN ('starting', 'running')
      AND b.id NOT IN (
        SELECT DISTINCT ON (project_id) id FROM build_sandbox_sessions
        WHERE status IN ('starting', 'running')
        ORDER BY project_id, created_at DESC
      )
  `

  // Enforces one active (starting/running) sandbox session per project at
  // the DB level. Without this, two requests that both see "no session
  // yet" (e.g. the editor's on-mount session-warmup call racing the first
  // chat message) each stand up a real, separate sandbox container for the
  // same project — confirmed live 2026-08-15: two containers created in
  // the same second, and the browser ended up pointed at whichever one
  // didn't have the AI's files, showing a permanent Bad Gateway. The
  // ON CONFLICT clause in ensureSandboxSession (lib/buildSession.ts) must
  // match this predicate exactly for Postgres to use it as the arbiter.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS build_sandbox_sessions_active_project_idx
      ON build_sandbox_sessions (project_id)
      WHERE status IN ('starting', 'running')
  `

  // Long-lived hosting for a "published" project — the sites-table analog
  // for Bario Build. Reuses lib/cloudflare.ts's per-domain zone pattern for
  // custom_domain/domain_status, same as sites.custom_domain does today.
  await sql`
    CREATE TABLE IF NOT EXISTS build_published_apps (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES build_projects(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      subdomain TEXT UNIQUE,
      custom_domain TEXT UNIQUE,
      domain_status TEXT NOT NULL DEFAULT 'none',
      cloudflare_zone_id TEXT,
      container_id TEXT,
      status TEXT NOT NULL DEFAULT 'building',
      published_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `

  // Bario Dialer's call history — logged from the client at call-start and
  // updated at call-end, since the actual call is placed browser-to-Twilio
  // directly (Voice SDK/WebRTC), not through a BARIO backend route that
  // could log it server-side on its own.
  await sql`
    CREATE TABLE IF NOT EXISTS dialer_call_log (
      id TEXT PRIMARY KEY,
      business_key TEXT NOT NULL,
      placed_by TEXT REFERENCES users(id),
      to_number TEXT NOT NULL,
      contact_name TEXT,
      status TEXT NOT NULL DEFAULT 'in_progress',
      duration_seconds INTEGER,
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      ended_at TIMESTAMPTZ
    )
  `
  // placed_by is nullable as of the client Dialer (app/dialer/<key>) --
  // AFC/Sunbuilt staff using it aren't Bario accounts at all, so there's no
  // users.id to attribute to. placed_by_label carries a plain-text
  // attribution instead for that case (e.g. "AFC Logistics client dialer").
  await sql`ALTER TABLE dialer_call_log ALTER COLUMN placed_by DROP NOT NULL`
  await sql`ALTER TABLE dialer_call_log ADD COLUMN IF NOT EXISTS placed_by_label TEXT`

  // Customer-facing custom-domain mailboxes, backed by the real Mailcow
  // instance on reseller.bario.ca (lib/mailcow.ts). Mailcow itself is the
  // source of truth for the mailbox's password/auth — this table only
  // tracks which BARIO account a given address belongs to, plus the
  // Cloudflare DNS record IDs auto-created for it so they can be cleaned
  // up if the mailbox is ever deleted.
  await sql`
    CREATE TABLE IF NOT EXISTS email_mailboxes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      site_id TEXT NOT NULL REFERENCES sites(id),
      domain TEXT NOT NULL,
      local_part TEXT NOT NULL,
      full_address TEXT NOT NULL UNIQUE,
      quota_mb INTEGER NOT NULL DEFAULT 1024,
      status TEXT NOT NULL DEFAULT 'active',
      mx_record_id TEXT,
      spf_record_id TEXT,
      dkim_record_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `

  // Domain registrations bought through Bario (lib/registrar.ts, via the
  // registrar-proxy service — see that file's header comment for why a
  // proxy is needed at all). Registrant contact info is stored so a renewal
  // or a second purchase doesn't require re-entering it, but the actual
  // registration/billing system of record is Namecheap itself — this table
  // is BARIO's own order history, not the authoritative WHOIS record.
  await sql`
    CREATE TABLE IF NOT EXISTS domain_orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      site_id TEXT REFERENCES sites(id),
      domain TEXT NOT NULL,
      years INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'pending',
      registrar_order_id TEXT,
      charged_amount TEXT,
      environment TEXT NOT NULL DEFAULT 'sandbox',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  // contact_json holds the registrant info collected at checkout time so the
  // Stripe webhook (which runs after payment, with no access to the
  // original request body) has what it needs to actually call
  // registerDomain. retail_price_cents is what the customer was actually
  // charged, separate from charged_amount (Namecheap's own wholesale charge
  // in USD) — the two currencies/amounts are expected to differ.
  await sql`ALTER TABLE domain_orders ADD COLUMN IF NOT EXISTS contact_json TEXT`
  await sql`ALTER TABLE domain_orders ADD COLUMN IF NOT EXISTS retail_price_cents INTEGER`
  await sql`ALTER TABLE domain_orders ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT`
  await sql`ALTER TABLE domain_orders ADD COLUMN IF NOT EXISTS stripe_payment_intent TEXT`
  await sql`ALTER TABLE domain_orders ADD COLUMN IF NOT EXISTS connected_to_site BOOLEAN NOT NULL DEFAULT false`

  // Native CRM feature — superseded the shared multi-tenant crm.bario.ca
  // approach (that instance caps out at 5 workspaces without a paid Twenty
  // Enterprise key, confirmed live) with a dedicated Twenty stack per
  // customer, matching the pattern already proven manually for AFC/Sunbuilt.
  // Kept around unused rather than dropped — this feature never had real
  // customers, but a DROP wasn't verified safe against production data.
  await sql`
    CREATE TABLE IF NOT EXISTS crm_workspaces (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      workspace_display_name TEXT NOT NULL,
      login_email TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'provisioning',
      login_token TEXT,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `

  // One dedicated Docker stack (own Postgres/Redis/Twenty/worker containers,
  // own subdomain, own cert) per customer, provisioned via the VPS-side
  // crm-provision-agent (lib/crmStack.ts) — no shared-instance workspace cap.
  // step mirrors the agent's own step field for the polling UI; slug is the
  // stack's directory/container-name prefix on the VPS and also the
  // subdomain label (<slug>.crm.bario.ca).
  await sql`
    CREATE TABLE IF NOT EXISTS crm_stacks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      slug TEXT NOT NULL UNIQUE,
      subdomain TEXT NOT NULL,
      workspace_display_name TEXT NOT NULL,
      login_email TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'provisioning',
      step TEXT,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `

  // Lets Bario's own backend (the Flo public API below, and eventually the
  // Social Dispatcher's lead sync) call this workspace's own Twenty GraphQL
  // API on the customer's behalf. Encrypted at rest (lib/flo/crypto.ts) —
  // set today via the admin-only route (app/api/admin/crm-stacks/[id]/api-key)
  // since crm-provision-agent (the VPS-side service that actually creates
  // the Twenty workspace) doesn't yet generate and hand back an API key
  // itself; that's real follow-up work on a separate, already-live service.
  await sql`ALTER TABLE crm_stacks ADD COLUMN IF NOT EXISTS twenty_api_key_encrypted TEXT`
  await sql`ALTER TABLE crm_stacks ADD COLUMN IF NOT EXISTS twenty_api_key_iv TEXT`

  // Login password for the admin/quick-access panel (app/admin/client-crms)
  // — lets Sherwin open any client's Twenty CRM without hunting through
  // memory files for credentials. Reuses lib/vpsPassword.ts's AES-256-GCM
  // helpers (same VPS_PASSWORD_ENCRYPTION_KEY) rather than a new key, purely
  // an encrypt/decrypt primitive, no reason to duplicate it. Deliberately
  // NOT one-time-reveal-then-destroy like vps_instances.root_password — this
  // is a recurring login the admin needs repeatedly, not a one-time initial
  // handoff, so the ciphertext stays in place after each reveal.
  await sql`ALTER TABLE crm_stacks ADD COLUMN IF NOT EXISTS login_password_encrypted TEXT`
  await sql`ALTER TABLE crm_stacks ADD COLUMN IF NOT EXISTS login_password_iv TEXT`

  // Flo's own public API keys (app/api/flo/v1/*) — deliberately separate
  // from personal_access_tokens (that's for Bario's own X-Drive sync client)
  // and from a workspace's Twenty API key above (that's Bario calling
  // Twenty; this is a third party calling Bario). key_prefix is what's shown
  // in the dashboard after creation ("flo_live_ab12cd34...") so a customer
  // can tell keys apart without Bario ever storing or re-displaying the
  // full secret — same never-store-the-secret-itself shape as
  // personal_access_tokens.token_hash.
  await sql`
    CREATE TABLE IF NOT EXISTS flo_api_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      crm_stack_id TEXT NOT NULL REFERENCES crm_stacks(id),
      name TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_used_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ
    )
  `

  // Voice Agent reseller — customer's submitted order + payment state,
  // mirrors vps_instances's pending_payment -> active shape. Deliberately
  // separate from crm_stacks (that's a Twenty CRM workspace; this is the
  // AI phone-answering product) — a customer can have either, both, or
  // neither. flo_api_key_id is optional: if the customer links an existing
  // Flo API key, leads the agent captures write into their real CRM via
  // /api/flo/v1/contacts instead of just sitting in this app.
  await sql`
    CREATE TABLE IF NOT EXISTS voice_agent_orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      business_name TEXT NOT NULL,
      business_description TEXT NOT NULL,
      forward_to_number TEXT NOT NULL,
      greeting TEXT,
      flo_api_key_id TEXT REFERENCES flo_api_keys(id),
      status TEXT NOT NULL DEFAULT 'pending_payment',
      stripe_checkout_session_id TEXT,
      stripe_subscription_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `

  // The finalized, live config the voice agent actually reads at call time
  // — written once by an admin in the build panel, after which the flow is
  // active with zero further manual touch. Kept separate from the order
  // row so "what the agent is currently doing" is never ambiguous with
  // "what the customer originally asked for" if an admin tweaks it later.
  await sql`
    CREATE TABLE IF NOT EXISTS voice_agent_configs (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES voice_agent_orders(id),
      twilio_number TEXT NOT NULL UNIQUE,
      business_name TEXT NOT NULL,
      business_description TEXT NOT NULL,
      forward_to_number TEXT NOT NULL,
      greeting TEXT NOT NULL,
      flo_api_key_id TEXT REFERENCES flo_api_keys(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `

  // "Business Brain" — structured knowledge an AI agent consults instead of
  // one free-text description. Generic on purpose (owner_user_id nullable,
  // lookup_key for Bario's own house businesses) so future agents (Miko,
  // Amber, Sky) can read the same table later, not just Victoria. Additive
  // to voice_agent_configs.business_description below, never a replacement
  // — a config with no linked profile keeps working exactly as before.
  await sql`
    CREATE TABLE IF NOT EXISTS business_profiles (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT REFERENCES users(id),
      lookup_key TEXT UNIQUE,
      name TEXT NOT NULL,
      about TEXT NOT NULL DEFAULT '',
      services_json TEXT NOT NULL DEFAULT '[]',
      hours TEXT,
      service_area_json TEXT NOT NULL DEFAULT '[]',
      employees_json TEXT NOT NULL DEFAULT '[]',
      faq_json TEXT NOT NULL DEFAULT '[]',
      policies TEXT,
      pricing_notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`ALTER TABLE voice_agent_configs ADD COLUMN IF NOT EXISTS business_profile_id TEXT REFERENCES business_profiles(id)`

  // Social Dispatcher ("blast one post to every connected platform") — the
  // customer-facing counterpart to marketing_connections/marketing_posts
  // above, which is Bario's own house account only. Keyed by user_id
  // directly (one BARIO account, many platform connections) rather than
  // crm_stacks.id, since a user can connect socials before/without ever
  // provisioning a Twenty CRM workspace.
  await sql`
    CREATE TABLE IF NOT EXISTS social_connections (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      platform TEXT NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      expires_at TIMESTAMPTZ,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      notify_phone TEXT,
      connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id, platform)
    )
  `
  // notify_phone predates being per-connection in spirit (it's really a
  // per-user setting for where lead-ad SMS alerts go) but lives here so the
  // webhook handler's single lookup-by-page-id also yields the phone to
  // notify without a second join.
  await sql`ALTER TABLE social_connections ADD COLUMN IF NOT EXISTS notify_phone TEXT`

  // One row per blast — status_json is a per-platform result map
  // ({ facebook: { status: 'posted', externalId }, tiktok: { status: 'failed', error } })
  // populated as each Promise.allSettled leg resolves, so a partial failure
  // (e.g. LinkedIn token expired) never blocks the platforms that succeeded.
  await sql`
    CREATE TABLE IF NOT EXISTS social_posts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      caption TEXT NOT NULL,
      media_url TEXT,
      media_type TEXT NOT NULL DEFAULT 'video',
      platforms_json TEXT NOT NULL DEFAULT '[]',
      is_ad_campaign BOOLEAN NOT NULL DEFAULT false,
      target_budget_cents INTEGER,
      status_json TEXT NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      dispatched_at TIMESTAMPTZ
    )
  `

  // Leads captured from a platform's Lead Ads webhook (currently: Meta only
  // — TikTok/LinkedIn lead-gen products need their own separate partner
  // approval, not just an OAuth scope, so their webhooks aren't wired yet).
  // raw_json keeps the full field_data payload for anything the fixed
  // columns below don't capture (custom form questions, consent answers).
  await sql`
    CREATE TABLE IF NOT EXISTS social_leads (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      platform TEXT NOT NULL,
      external_lead_id TEXT NOT NULL,
      full_name TEXT,
      email TEXT,
      phone TEXT,
      raw_json TEXT NOT NULL DEFAULT '{}',
      notified BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (platform, external_lead_id)
    )
  `

  // Manual quotes/invoices tool for Bario's own business (admin-only, not
  // exposed to regular customer accounts) — public_token is the unguessable
  // id used for the no-login shareable link (app/invoice/[token]), same
  // "unguessable UUID is the access boundary" shape as other public-link
  // features in this codebase.
  await sql`
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'invoice',
      number TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'draft',
      public_token TEXT NOT NULL UNIQUE,
      client_name TEXT NOT NULL,
      client_email TEXT,
      client_address TEXT,
      currency TEXT NOT NULL DEFAULT 'CAD',
      tax_percent NUMERIC NOT NULL DEFAULT 0,
      discount_type TEXT NOT NULL DEFAULT 'none',
      discount_value NUMERIC NOT NULL DEFAULT 0,
      notes TEXT,
      due_date DATE,
      stripe_checkout_session_id TEXT,
      stripe_payment_intent TEXT,
      paid_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_phone TEXT`

  // Recurring monthly bills for real external clients (AFC Logistics,
  // Sunbuilt Group, ...) who use Bario Dialer / Voice Agent but aren't
  // Bario.ca account holders themselves -- the invoices table above is
  // one-time-document only, so this is the go-forward subscription half.
  // Nothing charges until the client actually completes the Stripe
  // Checkout link (stripe_subscription_id stays NULL until then).
  await sql`
    CREATE TABLE IF NOT EXISTS external_client_subscriptions (
      id TEXT PRIMARY KEY,
      client_key TEXT NOT NULL,
      client_name TEXT NOT NULL,
      client_email TEXT,
      stripe_customer_id TEXT NOT NULL,
      stripe_subscription_id TEXT,
      stripe_checkout_session_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending_checkout',
      line_items_json TEXT NOT NULL,
      tax_percent NUMERIC NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS invoice_line_items (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      quantity NUMERIC NOT NULL DEFAULT 1,
      unit_price_cents INTEGER NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `

  // Amber (finance assistant) never writes to invoices/invoice_line_items
  // directly — every create/edit she proposes lands here as 'pending'
  // first. Only an explicit admin approve/reject in
  // app/api/admin/invoices/change-requests/[id] ever touches the real
  // invoice, which is what makes decided_at/decided_by a genuine approval
  // record rather than just an activity log.
  await sql`
    CREATE TABLE IF NOT EXISTS invoice_change_requests (
      id TEXT PRIMARY KEY,
      invoice_id TEXT REFERENCES invoices(id) ON DELETE CASCADE,
      agent_name TEXT NOT NULL DEFAULT 'amber',
      change_type TEXT NOT NULL,
      summary TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      decided_at TIMESTAMPTZ,
      decided_by TEXT,
      last_error TEXT
    )
  `

  // The one real roster of every AI agent on the platform — so tasks don't
  // get duplicated across agents and every agent's actual responsibilities
  // are written down in one place, not scattered across separate system
  // prompts only Claude can see.
  await sql`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      description TEXT NOT NULL,
      responsibilities TEXT NOT NULL,
      channels TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS agent_tasks (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `

  // Seeded once with what's actually built (not aspirational) — ON
  // CONFLICT DO NOTHING so re-running ensureSchema never clobbers edits
  // made later through the /admin/agents UI. Fully parameterized (no
  // manual quote-escaping) since these strings contain apostrophes.
  const seedAgents = [
    {
      id: 'agent-victoria', slug: 'victoria', name: 'Victoria',
      role: 'Executive Assistant & Receptionist (Unique Group Inc.)',
      description: "Answers Unique Group Inc.'s live phone line, recognizes known callers by number, and acts as Mr. Mendoza's personal assistant on his own calls.",
      responsibilities: "Answer/route inbound calls; ask who a caller is and which company/department they need before transferring; say hold on and connect them properly; take messages and orders and text them to Mr. Mendoza immediately; place outbound calls; keep personal notes/contacts/calendar for Mr. Mendoza with SMS reminders (private to him only); speak/understand English, Spanish, Canadian French, and Mandarin; never share one caller's information with another.",
      channels: 'Phone: +18254650880 (Unique Group Inc. line)',
    },
    {
      id: 'agent-miko', slug: 'miko', name: 'Miko',
      role: 'CRM Assistant (AFC Logistics / Sunbuilt Group)',
      description: "Lives inside each client's own Bario One CRM organization as their in-app AI copilot for leads and outreach (Twenty CRM, described here previously, was fully decommissioned 2026-08-20).",
      responsibilities: "Answer questions about leads/contacts/deals inside AFC Logistics' and Sunbuilt Group's own Bario One CRM organizations; draft outreach; surface what's in the CRM to whoever is logged into that workspace.",
      channels: 'In-app chat inside dashboard/bario-one/crm for each org',
    },
    {
      id: 'agent-atlas', slug: 'atlas', name: 'ATLAS',
      role: 'CRM & Ops Orchestrator',
      description: "Dispatches structured work (hot-lead follow-ups, research, drafting) to Bario's Router->Specialist->Critic->Delivery AI agency and tracks it as a real agent_tasks row, rather than any single specialist just answering in chat. Named separately from Miko/Victoria to avoid colliding with either (see the multi-agent CRM plan's naming note).",
      responsibilities: "Create agent_tasks when a lead's priority turns red (lib/leadPipeline.ts's recalculateLeadScore) or when an admin manually queues one; route each to the right specialist (sales/research/writer/etc.) via lib/agentAgency/orchestrate.ts; record the reviewed result back onto the task.",
      channels: 'Automatic (lead-priority triggers) + manual queue at /admin/agents',
    },
    {
      id: 'agent-amber', slug: 'amber', name: 'Amber',
      role: 'Finance Assistant (Bario invoicing)',
      description: "Helps draft and edit Bario's own quotes/invoices — scoped only to Bario's business, never AFC Logistics' or Sunbuilt Group's own client work.",
      responsibilities: "Look up existing quotes/invoices and the real product catalog freely; draft new quotes/invoices on command; propose price or line-item changes — every create or price change requires Mr. Mendoza's explicit approval and is recorded with who approved it and when, never applied automatically.",
      channels: 'Chat: /admin/invoices/amber',
    },
  ]
  for (const a of seedAgents) {
    await sql`
      INSERT INTO agents (id, slug, name, role, description, responsibilities, channels)
      VALUES (${a.id}, ${a.slug}, ${a.name}, ${a.role}, ${a.description}, ${a.responsibilities}, ${a.channels})
      ON CONFLICT (slug) DO NOTHING
    `
  }

  // Bario's own staff payroll — deliberately no SIN field (never asked
  // for, sensitive PII not worth storing without a clear need). pay_rate_cents
  // is per-hour if pay_type='hourly', per pay-period if 'salary'.
  // federal/provincial_claim_amount_cents let a specific employee's real
  // TD1 claim amount override the default BPA used in withholding calc.
  await sql`
    CREATE TABLE IF NOT EXISTS staff (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      address TEXT,
      province TEXT NOT NULL DEFAULT 'AB',
      pay_type TEXT NOT NULL DEFAULT 'hourly',
      pay_rate_cents INTEGER NOT NULL DEFAULT 0,
      pay_frequency TEXT NOT NULL DEFAULT 'biweekly',
      federal_claim_amount_cents INTEGER,
      provincial_claim_amount_cents INTEGER,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `

  // One row per paystub. ytd_*_cents are snapshots of the running totals
  // AS OF this paystub (after including it) — real payroll running totals,
  // not just this period's numbers, so CPP/EI correctly stop withholding
  // once the year's maximum is reached and year-end totals are always a
  // simple read of the latest row per staff member.
  await sql`
    CREATE TABLE IF NOT EXISTS paystubs (
      id TEXT PRIMARY KEY,
      staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
      pay_period_start DATE NOT NULL,
      pay_period_end DATE NOT NULL,
      pay_date DATE NOT NULL,
      province TEXT NOT NULL,
      gross_pay_cents INTEGER NOT NULL,
      bonuses_json TEXT NOT NULL DEFAULT '[]',
      additional_deductions_json TEXT NOT NULL DEFAULT '[]',
      cpp_cents INTEGER NOT NULL DEFAULT 0,
      cpp2_cents INTEGER NOT NULL DEFAULT 0,
      ei_cents INTEGER NOT NULL DEFAULT 0,
      federal_tax_cents INTEGER NOT NULL DEFAULT 0,
      provincial_tax_cents INTEGER NOT NULL DEFAULT 0,
      net_pay_cents INTEGER NOT NULL,
      ytd_gross_cents INTEGER NOT NULL,
      ytd_pensionable_cents INTEGER NOT NULL,
      ytd_insurable_cents INTEGER NOT NULL,
      ytd_deductions_cents INTEGER NOT NULL,
      ytd_net_cents INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `

  // Simple key/value store for platform-wide settings that don't need
  // Real CRA TD1/TD1-province record on file for each staff member — legally
  // required for payroll. Admin sends a token-gated link (no Bario login
  // needed, since a brand-new hire has no account); the employee downloads
  // the real fillable federal + provincial TD1 PDFs, fills/signs them in
  // their own PDF reader, and uploads both back. Typed full legal name +
  // timestamp + IP is the e-signature attestation for THIS submission (the
  // PDFs themselves may also carry a wet/typed signature CRA's own form
  // captures — this table's signature fields are Bario's own record of who
  // submitted it and when, a separate concern). Deliberately does not add a
  // SIN column here — the SIN lives inside the stored PDF itself (which is
  // literally what the government form requires), not duplicated into a
  // second plaintext column, matching the `staff` table's existing
  // no-SIN-unless-necessary posture.
  await sql`
    CREATE TABLE IF NOT EXISTS staff_td1_records (
      id TEXT PRIMARY KEY,
      staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      province TEXT NOT NULL,
      tax_year INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'completed' | 'expired'
      federal_pdf_url TEXT,
      provincial_pdf_url TEXT,
      federal_total_claim_cents INTEGER,
      provincial_total_claim_cents INTEGER,
      signature_name TEXT,
      signed_at TIMESTAMPTZ,
      signed_ip TEXT,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS staff_td1_records_staff_idx ON staff_td1_records (staff_id, created_at DESC)`

  // their own table — currently: the custom logo shown on invoices/
  // paystubs (falls back to Bario's own logo if unset), and employer
  // details required on a compliant paystub (legal name, address, CRA
  // Business Number/payroll program account number).
  // (platform_settings itself is created at the very top of this function
  // now, before the fast-path version check, so it's guaranteed to exist
  // even on a completely fresh database -- not duplicated here.)

  // One row per completed Victoria call, logged by the VPS-side
  // server.js at ws.on('close') via /api/admin/victoria/log-call. Claude
  // cost is real (actual token usage from the Anthropic API response ×
  // real Sonnet 5 pricing); Twilio cost is calculated from the real call
  // duration × Twilio's published per-minute rates (ConversationRelay +
  // underlying voice minute) — not an estimate pulled from Twilio's
  // actual billing API, so treat it as very close but not
  // penny-for-penny reconciled against your Twilio invoice.
  await sql`
    CREATE TABLE IF NOT EXISTS victoria_calls (
      id TEXT PRIMARY KEY,
      call_sid TEXT NOT NULL UNIQUE,
      business_key TEXT NOT NULL,
      direction TEXT NOT NULL,
      from_number TEXT NOT NULL,
      to_number TEXT NOT NULL,
      duration_seconds INTEGER NOT NULL,
      claude_input_tokens INTEGER NOT NULL DEFAULT 0,
      claude_output_tokens INTEGER NOT NULL DEFAULT 0,
      claude_cost_cents NUMERIC NOT NULL DEFAULT 0,
      twilio_cost_cents NUMERIC NOT NULL DEFAULT 0,
      total_cost_cents NUMERIC NOT NULL DEFAULT 0,
      started_at TIMESTAMPTZ NOT NULL,
      ended_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  // caller_name (resolved from Victoria's known-contacts list when the
  // number matches, else left null for an unrecognized caller) and summary
  // (a one/two-sentence recap of what the call was about) — let Victoria
  // answer "who called today" / "any messages for me" with real recall
  // instead of just raw numbers and durations.
  await sql`ALTER TABLE victoria_calls ADD COLUMN IF NOT EXISTS caller_name TEXT`
  await sql`ALTER TABLE victoria_calls ADD COLUMN IF NOT EXISTS summary TEXT`

  // A real, code-derived registry of every place Bario calls an AI model —
  // not aspirational, built by grepping the actual codebase for every
  // anthropic.messages.create/openai.chat.completions.create call site.
  // has_cost_tracking is honest: only Victoria has real per-call token
  // usage logged today (victoria_calls) — everything else here is a
  // real inventory entry, not yet instrumented for live cost.
  await sql`
    CREATE TABLE IF NOT EXISTS ai_integrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      domains TEXT NOT NULL,
      description TEXT NOT NULL,
      has_cost_tracking BOOLEAN NOT NULL DEFAULT false,
      source_file TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  const seedIntegrations = [
    { id: 'ai-victoria', name: 'Victoria (voice)', provider: 'anthropic', model: 'claude-sonnet-5', domains: '+18254650880 (Unique Group Inc.), +18253607175 (AFC Logistics), +18254352121 (Sunbuilt Group)', description: "Live phone-call AI receptionist/executive assistant — answers all three business lines.", hasCostTracking: true, sourceFile: '/var/www/miko-voice/server.js (VPS, not in this repo)' },
    { id: 'ai-amber', name: 'Amber (finance)', provider: 'openai', model: 'gpt-4o-mini', domains: 'bario.ca — /admin/invoices/amber', description: 'Drafts/edits Bario\'s own quotes and invoices, gated behind admin approval.', hasCostTracking: false, sourceFile: 'app/api/admin/invoices/amber/route.ts' },
    { id: 'ai-admin-assistant', name: 'Admin Assistant', provider: 'openai', model: 'gpt-4o-mini', domains: 'bario.ca — /admin/assistant', description: 'General-purpose ops assistant with autonomous low-risk account-fix tools.', hasCostTracking: false, sourceFile: 'app/api/admin/assistant/chat/route.ts' },
    { id: 'ai-pricing-bot', name: 'Pricing Assistant (pre-login)', provider: 'openai', model: 'gpt-4o-mini', domains: 'bario.ca — public marketing pages', description: 'Answers pricing/plan questions for visitors who have not signed up yet.', hasCostTracking: false, sourceFile: 'app/api/assistant/chat/route.ts' },
    { id: 'ai-support-bot', name: 'Support Assistant (post-login)', provider: 'openai', model: 'gpt-4o-mini', domains: 'bario.ca — customer dashboard', description: 'In-dashboard support chat for logged-in customers.', hasCostTracking: false, sourceFile: 'app/api/assistant/support/route.ts' },
    { id: 'ai-builder-sections', name: 'Bario AI — website builder (sections)', provider: 'anthropic', model: 'claude-sonnet-5', domains: 'bario.ca + every *.bario.ca subdomain and connected custom domain', description: "The core AI site builder — generates a site's structured sections_json.", hasCostTracking: false, sourceFile: 'app/api/builder/generate/route.ts' },
    { id: 'ai-builder-html', name: 'Bario AI — website builder (HTML edit mode)', provider: 'openai', model: 'gpt-4o-mini', domains: 'bario.ca + every *.bario.ca subdomain and connected custom domain', description: 'Targeted find/replace edits against imported/raw-HTML sites.', hasCostTracking: false, sourceFile: 'app/api/builder/generate-html/route.ts' },
    { id: 'ai-crm-outreach', name: 'CRM Outreach (draft/redraft replies)', provider: 'openai', model: 'gpt-5.6-luna', domains: 'afclogistics.ca, sunbuiltgroup.com (via afc.crm.bario.ca / sunbuilt.crm.bario.ca)', description: 'Drafts and redrafts AI outreach replies to real leads for AFC/Sunbuilt.', hasCostTracking: false, sourceFile: 'app/api/admin/crm-leadgen/{draft-reply,redraft,redraft-bulk}/route.ts' },
    { id: 'ai-crm-cron', name: 'CRM lead-gen & reply-check (scheduled)', provider: 'openai', model: 'gpt-5.6-luna', domains: 'afclogistics.ca, sunbuiltgroup.com (via afc.crm.bario.ca / sunbuilt.crm.bario.ca)', description: 'Cron-triggered lead generation and outreach-reply checking, unattended.', hasCostTracking: false, sourceFile: 'app/api/cron/{crm-leadgen,crm-outreach-replies}/route.ts' },
    { id: 'ai-studio-copilot', name: 'Bario Studio Copilot', provider: 'openai', model: 'gpt-5.6-luna', domains: 'bario.ca — /dashboard/studio', description: 'AI copilot inside the video/design Studio editor.', hasCostTracking: false, sourceFile: 'app/api/studio/copilot/route.ts' },
    { id: 'ai-build-agent', name: 'Bario Build agent (beta)', provider: 'multi (openai/xai/anthropic)', model: 'gpt-5.6-luna / grok-code-fast-1 / claude-opus-5, provider-switched', domains: 'bario.ca — /build/apps (beta)', description: 'AI app/site sandbox builder, still in beta rollout.', hasCostTracking: false, sourceFile: 'lib/buildAgentModel.ts' },
    { id: 'ai-marketing', name: 'Marketing post generator', provider: 'openai', model: 'gpt-4o-mini', domains: 'bario.ca admin — used for all client businesses\' marketing posts', description: 'Drafts AI social/marketing posts for admin review and approval.', hasCostTracking: false, sourceFile: 'lib/marketing/generate.ts' },
    { id: 'ai-crm-copilot', name: 'Miko (Twenty CRM built-in copilot)', provider: 'anthropic (Twenty\'s own key, separate from this app)', model: 'configured inside Twenty\'s own Docker stack', domains: 'crm.bario.ca, afc.crm.bario.ca, sunbuilt.crm.bario.ca', description: "Twenty CRM's own native AI chat feature — runs entirely inside that Docker stack, not this codebase, so its usage/cost isn't visible from here at all.", hasCostTracking: false, sourceFile: null },
    { id: 'ai-request-estimator', name: 'Client Request Estimator', provider: 'openai', model: 'gpt-5.6-luna', domains: 'bario.ca — /dashboard/requests, /admin/requests (AFC Logistics + Sunbuilt Group only)', description: 'Estimates effort hours for a submitted client request and computes a business-hours-aware ETA against the shared open queue.', hasCostTracking: false, sourceFile: 'lib/requestEstimator.ts' },
  ]
  for (const i of seedIntegrations) {
    await sql`
      INSERT INTO ai_integrations (id, name, provider, model, domains, description, has_cost_tracking, source_file)
      VALUES (${i.id}, ${i.name}, ${i.provider}, ${i.model}, ${i.domains}, ${i.description}, ${i.hasCostTracking}, ${i.sourceFile})
      ON CONFLICT (id) DO NOTHING
    `
  }

  // Bario One — the multi-tenant "business operating system" suite
  // (CRM/invoicing/payroll/POS/etc, built module by module). Deliberately
  // reuses the existing `users` table for login identity (one account
  // across every Bario product) rather than a separate user system — a
  // bo_membership row is what turns a normal Bario account into a member
  // of a specific company/tenant. Prefixed `bo_` to keep this large,
  // separate product area's tables visually distinct from the site-builder
  // tables above as this suite grows.
  await sql`
    CREATE TABLE IF NOT EXISTS bo_organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      owner_user_id TEXT NOT NULL REFERENCES users(id),
      plan TEXT NOT NULL DEFAULT 'starter',
      subscription_status TEXT NOT NULL DEFAULT 'trialing',
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      trial_ends_at TIMESTAMPTZ,
      branding_logo_url TEXT,
      branding_primary_color TEXT NOT NULL DEFAULT '#d4af37',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS bo_memberships (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES bo_organizations(id),
      user_id TEXT REFERENCES users(id),
      invited_email TEXT,
      invite_token TEXT,
      role TEXT NOT NULL DEFAULT 'employee',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  // Partial unique index rather than a plain UNIQUE constraint — user_id is
  // NULL for a pending invite (no account yet), and a plain UNIQUE
  // constraint treats every NULL as distinct anyway in Postgres, but being
  // explicit here documents that this is intentional, not an oversight.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS bo_memberships_org_user_unique
    ON bo_memberships (organization_id, user_id) WHERE user_id IS NOT NULL
  `
  await sql`CREATE INDEX IF NOT EXISTS bo_memberships_user_idx ON bo_memberships (user_id)`

  // Bario One Phase 2 — Bario CRM. bo_notes deliberately serves double duty
  // as both internal notes AND a log of sent emails/SMS (kind column) —
  // one table ordered by created_at IS the "customer history" feature,
  // rather than a separate activity-log abstraction duplicating the same
  // rows a note/email/sms already produces.
  await sql`
    CREATE TABLE IF NOT EXISTS bo_customers (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES bo_organizations(id),
      company_name TEXT,
      contact_name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      tags_json TEXT NOT NULL DEFAULT '[]',
      created_by_user_id TEXT REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS bo_customers_org_idx ON bo_customers (organization_id)`

  await sql`
    CREATE TABLE IF NOT EXISTS bo_deals (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES bo_organizations(id),
      customer_id TEXT NOT NULL REFERENCES bo_customers(id),
      title TEXT NOT NULL,
      stage TEXT NOT NULL DEFAULT 'lead',
      value_cents INTEGER NOT NULL DEFAULT 0,
      expected_close_date DATE,
      notes TEXT,
      created_by_user_id TEXT REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS bo_deals_org_idx ON bo_deals (organization_id)`
  await sql`CREATE INDEX IF NOT EXISTS bo_deals_customer_idx ON bo_deals (customer_id)`

  // Bario One CRM — record-level permissions (2026-08-17). An employee
  // (as opposed to owner/admin, who always see everything) is scoped to
  // only the customers/deals assigned to them; an unassigned record stays
  // visible to everyone so nothing existing silently disappears from an
  // employee's view on rollout. See isRecordVisibleToMember() in
  // lib/barioOne.ts for the read-side check this backs.
  await sql`ALTER TABLE bo_customers ADD COLUMN IF NOT EXISTS assigned_to_user_id TEXT REFERENCES users(id)`
  await sql`ALTER TABLE bo_deals ADD COLUMN IF NOT EXISTS assigned_to_user_id TEXT REFERENCES users(id)`
  await sql`CREATE INDEX IF NOT EXISTS bo_customers_assigned_idx ON bo_customers (assigned_to_user_id)`
  await sql`CREATE INDEX IF NOT EXISTS bo_deals_assigned_idx ON bo_deals (assigned_to_user_id)`

  // Self-serve "connect an existing external mailbox" (2026-08-18) — lets a
  // customer's Bario webmail also show mail from an account they already
  // have elsewhere (any IMAP/SMTP provider, deliberately not tied to one by
  // name anywhere in this product). This table is BARIO's own record of
  // what's connected, used only to enforce the 5-per-account limit and the
  // 1-year free-trial window (first connection's created_at is the trial's
  // start — see requireExternalMailQuota() in lib/sogoAuxAccounts.ts). The
  // real IMAP/SMTP credentials live only in SOGo's own per-user profile
  // (sogo_user_profile.c_defaults on the mail server) via
  // addAuxiliaryMailAccount() — never duplicated into this table, which
  // only keeps the SOGo-internal numeric id needed to remove one later.
  await sql`
    CREATE TABLE IF NOT EXISTS email_external_accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      mailbox_id TEXT NOT NULL REFERENCES email_mailboxes(id),
      label TEXT NOT NULL,
      email TEXT NOT NULL,
      sogo_account_id INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS email_external_accounts_user_idx ON email_external_accounts (user_id)`

  await sql`
    CREATE TABLE IF NOT EXISTS bo_tasks (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES bo_organizations(id),
      customer_id TEXT REFERENCES bo_customers(id),
      deal_id TEXT REFERENCES bo_deals(id),
      assigned_to_user_id TEXT REFERENCES users(id),
      title TEXT NOT NULL,
      due_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'open',
      created_by_user_id TEXT REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS bo_tasks_org_idx ON bo_tasks (organization_id)`
  await sql`CREATE INDEX IF NOT EXISTS bo_tasks_customer_idx ON bo_tasks (customer_id)`

  await sql`
    CREATE TABLE IF NOT EXISTS bo_notes (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES bo_organizations(id),
      customer_id TEXT NOT NULL REFERENCES bo_customers(id),
      author_user_id TEXT REFERENCES users(id),
      kind TEXT NOT NULL DEFAULT 'note',
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS bo_notes_customer_idx ON bo_notes (customer_id, created_at)`

  // Bario One CRM — comments/@mentions (2026-08-17). kind = 'comment' is a
  // new value on the existing free-text kind column (no schema change
  // needed for that); mentioned_user_ids_json records who was @mentioned
  // so a notification only fires once per resolved mention, not per
  // '@'-looking substring. See lib/barioOneMentions.ts.
  await sql`ALTER TABLE bo_notes ADD COLUMN IF NOT EXISTS mentioned_user_ids_json TEXT NOT NULL DEFAULT '[]'`

  // Bario One CRM — two-way email sync (2026-08-17). Each org can have a
  // real mailbox (its own domain, e.g. crm@afclogistics.ca -- either
  // already existing and just recorded here, or auto-provisioned via
  // lib/mailcow.ts for an org with none yet) used for BOTH sending CRM
  // emails and polling replies via IMAP, so a customer's reply naturally
  // lands back in the same mailbox app/api/cron/crm-email-sync polls.
  // Password stored encrypted via lib/vpsPassword.ts's existing AES-256-GCM
  // helper (reused, not a new encryption scheme).
  await sql`ALTER TABLE bo_organizations ADD COLUMN IF NOT EXISTS crm_mailbox_email TEXT`
  await sql`ALTER TABLE bo_organizations ADD COLUMN IF NOT EXISTS crm_mailbox_imap_host TEXT`
  await sql`ALTER TABLE bo_organizations ADD COLUMN IF NOT EXISTS crm_mailbox_imap_port INTEGER`
  await sql`ALTER TABLE bo_organizations ADD COLUMN IF NOT EXISTS crm_mailbox_smtp_host TEXT`
  await sql`ALTER TABLE bo_organizations ADD COLUMN IF NOT EXISTS crm_mailbox_smtp_port INTEGER`
  await sql`ALTER TABLE bo_organizations ADD COLUMN IF NOT EXISTS crm_mailbox_password_ciphertext TEXT`
  await sql`ALTER TABLE bo_organizations ADD COLUMN IF NOT EXISTS crm_mailbox_password_iv TEXT`

  // Threading/dedup for inbound mail, and enough to tell an inbound reply
  // apart from an outbound send in the shared history feed.
  await sql`ALTER TABLE bo_notes ADD COLUMN IF NOT EXISTS message_id TEXT`
  await sql`ALTER TABLE bo_notes ADD COLUMN IF NOT EXISTS direction TEXT`
  await sql`ALTER TABLE bo_notes ADD COLUMN IF NOT EXISTS from_email TEXT`
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS bo_notes_message_id_idx ON bo_notes (message_id) WHERE message_id IS NOT NULL`

  // Bario One CRM — bulk email campaigns (2026-08-18). Deliberately reuses
  // bo_notes for the per-recipient send log (via campaign_id below) rather
  // than a separate recipients table — a campaign send IS an outbound
  // email on that customer's timeline, same as a 1:1 send, just with
  // campaign_id set so the campaign's own history view can filter to it.
  // created_via distinguishes an admin-triggered send from one Miko sent on
  // request/schedule, purely for the campaign list UI, not access control.
  await sql`
    CREATE TABLE IF NOT EXISTS bo_email_campaigns (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES bo_organizations(id),
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      body_html TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      scheduled_at TIMESTAMPTZ,
      sent_at TIMESTAMPTZ,
      recipient_count INTEGER NOT NULL DEFAULT 0,
      sent_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      created_by_user_id TEXT REFERENCES users(id),
      created_via TEXT NOT NULL DEFAULT 'admin',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS bo_email_campaigns_org_idx ON bo_email_campaigns (organization_id)`
  await sql`CREATE INDEX IF NOT EXISTS bo_email_campaigns_scheduled_idx ON bo_email_campaigns (status, scheduled_at)`
  await sql`ALTER TABLE bo_notes ADD COLUMN IF NOT EXISTS campaign_id TEXT REFERENCES bo_email_campaigns(id)`

  // Per-contact AI personalization (2026-08-19) — when on, body_html is a
  // brief/template Claude rewrites individually per recipient (referencing
  // their company name) rather than the literal text sent to everyone.
  // Real per-send cost tradeoff, so it's opt-in per campaign, not default.
  await sql`ALTER TABLE bo_email_campaigns ADD COLUMN IF NOT EXISTS personalize BOOLEAN NOT NULL DEFAULT false`

  // Bring-your-own AI key for lead research (2026-08-19) — a customer can
  // plug in their own provider API key instead of using Bario's shared one
  // and shared monthly quota. Encrypted at rest via the same AES-256-GCM
  // helper (lib/vpsPassword.ts) already used for CRM mailbox passwords.
  // Only 'anthropic' is actually wired to real, web-search-verified
  // research today (see researchLeads() in lib/barioOneAssistantTools.ts) —
  // other providers can be stored but aren't executed against yet, since a
  // provider without a real web-search tool would risk inventing
  // businesses that don't exist, which this feature explicitly promises
  // never to do.
  await sql`ALTER TABLE bo_organizations ADD COLUMN IF NOT EXISTS own_ai_provider TEXT`
  await sql`ALTER TABLE bo_organizations ADD COLUMN IF NOT EXISTS own_ai_api_key_ciphertext TEXT`
  await sql`ALTER TABLE bo_organizations ADD COLUMN IF NOT EXISTS own_ai_api_key_iv TEXT`

  // Bario One — CRM custom fields (per-org field definitions, attachable to
  // customers and/or deals). Values live as a JSON map on the entity row
  // itself (custom_fields_json, keyed by field id) rather than a separate
  // EAV values table — matches this codebase's existing tags_json convention
  // and avoids an extra join on every list/detail read.
  await sql`
    CREATE TABLE IF NOT EXISTS bo_custom_fields (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES bo_organizations(id),
      entity_type TEXT NOT NULL,
      name TEXT NOT NULL,
      field_type TEXT NOT NULL DEFAULT 'text',
      options_json TEXT NOT NULL DEFAULT '[]',
      position INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS bo_custom_fields_org_idx ON bo_custom_fields (organization_id, entity_type)`
  await sql`ALTER TABLE bo_customers ADD COLUMN IF NOT EXISTS custom_fields_json TEXT NOT NULL DEFAULT '{}'`
  await sql`ALTER TABLE bo_deals ADD COLUMN IF NOT EXISTS custom_fields_json TEXT NOT NULL DEFAULT '{}'`

  // Bario One — multiple CRM pipelines (Monday/Twenty parity phase 2).
  // bo_deals.stage stays the source of truth for "which stage" (a plain
  // TEXT key) for backward compatibility with the original 5 hardcoded
  // stages — bo_pipeline_stages just adds structure/config (custom names,
  // custom additional pipelines, ordering) on top of that same key, rather
  // than replacing it. Every org lazily gets a default pipeline the first
  // time it's touched (see ensureDefaultPipeline in lib/barioOnePipelines.ts)
  // instead of a one-time backfill migration script.
  await sql`
    CREATE TABLE IF NOT EXISTS bo_pipelines (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES bo_organizations(id),
      name TEXT NOT NULL,
      is_default BOOLEAN NOT NULL DEFAULT false,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS bo_pipelines_org_idx ON bo_pipelines (organization_id)`

  await sql`
    CREATE TABLE IF NOT EXISTS bo_pipeline_stages (
      id TEXT PRIMARY KEY,
      pipeline_id TEXT NOT NULL REFERENCES bo_pipelines(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      name TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS bo_pipeline_stages_pipeline_idx ON bo_pipeline_stages (pipeline_id)`
  await sql`ALTER TABLE bo_deals ADD COLUMN IF NOT EXISTS pipeline_id TEXT REFERENCES bo_pipelines(id)`

  // Bario One — no-code automations (Monday/Twenty parity phase 3): "when
  // X happens, do Y." Reuses the same event vocabulary the outbound
  // webhooks feature already established, extended with deal-specific
  // events (webhooks never covered deals). Actions are deliberately
  // limited to safe, additive operations (create a task, tag/note/email/SMS
  // a customer) — same "the action list itself is the security boundary"
  // pattern as the admin/Bario AI assistants: no delete/refund/mark-paid
  // action exists to configure, so a misconfigured or abused automation
  // can't do real damage.
  await sql`
    CREATE TABLE IF NOT EXISTS bo_automations (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES bo_organizations(id),
      name TEXT NOT NULL,
      trigger_event TEXT NOT NULL,
      trigger_filter_json TEXT NOT NULL DEFAULT '{}',
      action_type TEXT NOT NULL,
      action_config_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'active',
      created_by_user_id TEXT REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS bo_automations_org_idx ON bo_automations (organization_id, trigger_event, status)`

  await sql`
    CREATE TABLE IF NOT EXISTS bo_automation_runs (
      id TEXT PRIMARY KEY,
      automation_id TEXT NOT NULL REFERENCES bo_automations(id) ON DELETE CASCADE,
      context_json TEXT NOT NULL DEFAULT '{}',
      success BOOLEAN NOT NULL DEFAULT false,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS bo_automation_runs_automation_idx ON bo_automation_runs (automation_id, created_at)`

  // Bario One Phase 3 — Bario Invoice. The issuing business's own info
  // (shown on every invoice/quote/estimate it sends) lives on the org
  // itself, not duplicated per-document.
  await sql`ALTER TABLE bo_organizations ADD COLUMN IF NOT EXISTS business_address TEXT`
  await sql`ALTER TABLE bo_organizations ADD COLUMN IF NOT EXISTS business_phone TEXT`
  await sql`ALTER TABLE bo_organizations ADD COLUMN IF NOT EXISTS business_email TEXT`
  await sql`ALTER TABLE bo_organizations ADD COLUMN IF NOT EXISTS tax_number TEXT`

  await sql`
    CREATE TABLE IF NOT EXISTS bo_invoices (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES bo_organizations(id),
      customer_id TEXT NOT NULL REFERENCES bo_customers(id),
      type TEXT NOT NULL DEFAULT 'invoice',
      number TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      public_token TEXT UNIQUE NOT NULL,
      currency TEXT NOT NULL DEFAULT 'CAD',
      tax_percent NUMERIC NOT NULL DEFAULT 0,
      tax_label TEXT NOT NULL DEFAULT 'Tax',
      discount_type TEXT NOT NULL DEFAULT 'none',
      discount_value NUMERIC NOT NULL DEFAULT 0,
      notes TEXT,
      due_date DATE,
      is_recurring BOOLEAN NOT NULL DEFAULT false,
      recurring_interval TEXT,
      next_recurrence_date DATE,
      sent_at TIMESTAMPTZ,
      paid_at TIMESTAMPTZ,
      created_by_user_id TEXT REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS bo_invoices_org_idx ON bo_invoices (organization_id)`
  await sql`CREATE INDEX IF NOT EXISTS bo_invoices_customer_idx ON bo_invoices (customer_id)`
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS bo_invoices_org_number_unique ON bo_invoices (organization_id, number)`

  await sql`
    CREATE TABLE IF NOT EXISTS bo_invoice_items (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL REFERENCES bo_invoices(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      quantity NUMERIC NOT NULL DEFAULT 1,
      unit_price_cents INTEGER NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS bo_invoice_items_invoice_idx ON bo_invoice_items (invoice_id)`

  // Bario One Phase 4 — Bario Payments. Each org gets its own Stripe
  // Connect Express account so customer payments land directly in THAT
  // business's own bank account (a "direct charge" — created with
  // {stripeAccount: id} — rather than Bario's platform account holding
  // funds and having to redistribute them, which would be its own real
  // money-transmission/compliance problem).
  await sql`ALTER TABLE bo_organizations ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT`
  await sql`ALTER TABLE bo_organizations ADD COLUMN IF NOT EXISTS stripe_connect_status TEXT NOT NULL DEFAULT 'none'`
  await sql`ALTER TABLE bo_invoices ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT`
  await sql`ALTER TABLE bo_invoices ADD COLUMN IF NOT EXISTS stripe_payment_intent TEXT`

  // Modular pay-per-module packaging: replaces the fixed starter/professional/
  // business tiers as the actual entitlement mechanism. `plan` stays for
  // backward-compat display only; enabled_modules_json is now the single
  // source of truth for what an org can access, kept in sync with Stripe
  // subscription items going forward. Empty ('[]') means "not yet
  // backfilled" — see ensureModulesForOrg in lib/barioOneModules.ts.
  await sql`ALTER TABLE bo_organizations ADD COLUMN IF NOT EXISTS enabled_modules_json TEXT NOT NULL DEFAULT '[]'`

  // Bario One Phase 5 — Employee Management. user_id is nullable: a
  // bo_employee is an HR record first (name/pay/documents), independent of
  // whether that person also has a Bario login — linking user_id is what
  // additionally lets them clock themselves in/out instead of an
  // owner/admin doing it on their behalf.
  await sql`
    CREATE TABLE IF NOT EXISTS bo_employees (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES bo_organizations(id),
      user_id TEXT REFERENCES users(id),
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      position TEXT,
      pay_type TEXT NOT NULL DEFAULT 'hourly',
      salary_cents INTEGER,
      hourly_rate_cents INTEGER,
      status TEXT NOT NULL DEFAULT 'active',
      document_urls_json TEXT NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS bo_employees_org_idx ON bo_employees (organization_id)`

  await sql`
    CREATE TABLE IF NOT EXISTS bo_time_entries (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES bo_organizations(id),
      employee_id TEXT NOT NULL REFERENCES bo_employees(id),
      clock_in TIMESTAMPTZ NOT NULL,
      clock_out TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS bo_time_entries_employee_idx ON bo_time_entries (employee_id, clock_in)`

  await sql`
    CREATE TABLE IF NOT EXISTS bo_shifts (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES bo_organizations(id),
      employee_id TEXT NOT NULL REFERENCES bo_employees(id),
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ NOT NULL,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS bo_shifts_org_idx ON bo_shifts (organization_id, starts_at)`
  await sql`CREATE INDEX IF NOT EXISTS bo_shifts_employee_idx ON bo_shifts (employee_id)`

  await sql`
    CREATE TABLE IF NOT EXISTS bo_vacation_requests (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES bo_organizations(id),
      employee_id TEXT NOT NULL REFERENCES bo_employees(id),
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS bo_vacation_requests_employee_idx ON bo_vacation_requests (employee_id)`

  await sql`
    CREATE TABLE IF NOT EXISTS bo_employee_notes (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES bo_organizations(id),
      employee_id TEXT NOT NULL REFERENCES bo_employees(id),
      author_user_id TEXT REFERENCES users(id),
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS bo_employee_notes_employee_idx ON bo_employee_notes (employee_id, created_at)`

  // Bario One Phase 6 — Bario Payroll. province + vacation_pay_percent live
  // on the employee record since they're per-employee facts (where they
  // work, their vacation entitlement), not per-pay-run inputs.
  await sql`ALTER TABLE bo_employees ADD COLUMN IF NOT EXISTS province TEXT`
  await sql`ALTER TABLE bo_employees ADD COLUMN IF NOT EXISTS vacation_pay_percent NUMERIC NOT NULL DEFAULT 4`

  await sql`
    CREATE TABLE IF NOT EXISTS bo_pay_runs (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES bo_organizations(id),
      frequency TEXT NOT NULL,
      pay_period_start DATE NOT NULL,
      pay_period_end DATE NOT NULL,
      pay_date DATE NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      created_by_user_id TEXT REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS bo_pay_runs_org_idx ON bo_pay_runs (organization_id)`

  // One row per employee per pay run — a real, itemized pay stub. Every
  // deduction amount is a plain cents integer, computed once at pay-run
  // creation time by lib/barioOnePayroll.ts and stored (not recomputed
  // live later), so a stub's numbers never silently drift if next year's
  // tax tables change after the fact.
  await sql`
    CREATE TABLE IF NOT EXISTS bo_pay_stubs (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES bo_organizations(id),
      pay_run_id TEXT NOT NULL REFERENCES bo_pay_runs(id) ON DELETE CASCADE,
      employee_id TEXT NOT NULL REFERENCES bo_employees(id),
      province TEXT NOT NULL,
      regular_hours NUMERIC NOT NULL DEFAULT 0,
      overtime_hours NUMERIC NOT NULL DEFAULT 0,
      regular_cents INTEGER NOT NULL DEFAULT 0,
      overtime_cents INTEGER NOT NULL DEFAULT 0,
      vacation_pay_cents INTEGER NOT NULL DEFAULT 0,
      gross_cents INTEGER NOT NULL DEFAULT 0,
      federal_tax_cents INTEGER NOT NULL DEFAULT 0,
      provincial_tax_cents INTEGER NOT NULL DEFAULT 0,
      cpp_or_qpp_cents INTEGER NOT NULL DEFAULT 0,
      ei_cents INTEGER NOT NULL DEFAULT 0,
      qpip_cents INTEGER NOT NULL DEFAULT 0,
      net_pay_cents INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS bo_pay_stubs_pay_run_idx ON bo_pay_stubs (pay_run_id)`
  await sql`CREATE INDEX IF NOT EXISTS bo_pay_stubs_employee_idx ON bo_pay_stubs (employee_id)`

  // Bario One Phase 7 — Bario POS + Inventory (bundled into one phase per
  // the approved build order, since a working POS needs real stock
  // tracking to not be a facade). Loyalty lives directly on bo_customers
  // (Phase 2's CRM table) rather than a new table — one real point balance
  // per customer, not a separate ledger for v1.
  await sql`ALTER TABLE bo_customers ADD COLUMN IF NOT EXISTS loyalty_points INTEGER NOT NULL DEFAULT 0`

  await sql`
    CREATE TABLE IF NOT EXISTS bo_products (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES bo_organizations(id),
      name TEXT NOT NULL,
      sku TEXT,
      barcode TEXT,
      price_cents INTEGER NOT NULL DEFAULT 0,
      cost_cents INTEGER NOT NULL DEFAULT 0,
      stock_quantity INTEGER NOT NULL DEFAULT 0,
      low_stock_threshold INTEGER NOT NULL DEFAULT 5,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS bo_products_org_idx ON bo_products (organization_id)`
  await sql`CREATE INDEX IF NOT EXISTS bo_products_barcode_idx ON bo_products (organization_id, barcode)`
  await sql`CREATE INDEX IF NOT EXISTS bo_products_sku_idx ON bo_products (organization_id, sku)`

  // Bario Invoice — product/service catalog for invoicing. bo_products stays
  // ONE shared table between POS/Inventory and Invoicing rather than a
  // duplicate catalog; item_type lets a service business ignore
  // stock_quantity/barcode entirely. unit_cost_cents on bo_invoice_items is a
  // COST SNAPSHOT at invoice-create time (bo_products.cost_cents can change
  // later — historical invoices must not silently re-price, same reasoning
  // as bo_pay_stubs snapshotting pay rates).
  await sql`ALTER TABLE bo_products ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT 'product'` // 'product' | 'service'
  await sql`ALTER TABLE bo_products ADD COLUMN IF NOT EXISTS description TEXT`
  await sql`ALTER TABLE bo_invoice_items ADD COLUMN IF NOT EXISTS product_id TEXT REFERENCES bo_products(id)` // NULL = free-text line, unchanged behavior
  await sql`ALTER TABLE bo_invoice_items ADD COLUMN IF NOT EXISTS unit_cost_cents INTEGER NOT NULL DEFAULT 0`

  // Document theme picker — org-wide (picked once, applies to every future
  // estimate/quote/invoice/work order), not per-document. invoice_theme_key
  // is validated app-side against the small fixed registry in
  // lib/barioOneInvoiceThemes.ts, not a DB constraint, matching how
  // status/discount_type are validated elsewhere in this file.
  await sql`ALTER TABLE bo_organizations ADD COLUMN IF NOT EXISTS invoice_theme_key TEXT NOT NULL DEFAULT 'classic'`
  await sql`ALTER TABLE bo_organizations ADD COLUMN IF NOT EXISTS invoice_field_toggles_json TEXT NOT NULL DEFAULT '{}'`

  // Work orders + estimate->invoice conversion. Work orders are a 4th
  // bo_invoices.type value rather than a new table — this reuses numbering,
  // items, PDF/HTML rendering, send/void, and the public customer view for
  // free; scheduled_date/job_site_address/assigned_employee_id are simply
  // NULL/unused for estimate/quote/invoice rows. assigned_employee_id
  // references bo_employees (a separately-gated 'employees' module) — the
  // UI must degrade to free-text or hide the picker when that module isn't
  // enabled, never hard-require it. converted_to_invoice_id/
  // converted_from_id are a self-referential pair so the UI can show
  // "Converted to INV-1042" and the convert route can refuse to
  // double-convert the same estimate/quote.
  await sql`ALTER TABLE bo_invoices ADD COLUMN IF NOT EXISTS scheduled_date DATE`
  await sql`ALTER TABLE bo_invoices ADD COLUMN IF NOT EXISTS job_site_address TEXT`
  await sql`ALTER TABLE bo_invoices ADD COLUMN IF NOT EXISTS assigned_employee_id TEXT REFERENCES bo_employees(id)`
  await sql`ALTER TABLE bo_invoices ADD COLUMN IF NOT EXISTS converted_to_invoice_id TEXT REFERENCES bo_invoices(id)`
  await sql`ALTER TABLE bo_invoices ADD COLUMN IF NOT EXISTS converted_from_id TEXT REFERENCES bo_invoices(id)`

  // Expenses — fully new, gated under the existing 'invoicing' module (no
  // new priced BoModuleKey; expenses/reporting are invoicing-adjacent, and
  // a new module would need real Stripe billing plumbing that wasn't asked
  // for). status='needs_review' is the lightweight analog of
  // invoice_change_requests' AI-proposes/human-approves shape — since this
  // is a single-tenant writing its own data (not Amber's cross-client AI
  // writes), a full separate staging table would be overkill; the report
  // query just excludes non-'confirmed' rows by default.
  await sql`
    CREATE TABLE IF NOT EXISTS bo_expenses (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES bo_organizations(id),
      vendor TEXT,
      category TEXT NOT NULL DEFAULT 'uncategorized',
      amount_cents INTEGER NOT NULL DEFAULT 0,
      tax_cents INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'CAD',
      expense_date DATE,
      notes TEXT,
      receipt_image_url TEXT,
      ocr_raw_json TEXT,
      status TEXT NOT NULL DEFAULT 'confirmed',
      created_by_user_id TEXT REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS bo_expenses_org_idx ON bo_expenses (organization_id, expense_date)`

  await sql`
    CREATE TABLE IF NOT EXISTS bo_suppliers (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES bo_organizations(id),
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS bo_suppliers_org_idx ON bo_suppliers (organization_id)`

  await sql`
    CREATE TABLE IF NOT EXISTS bo_purchase_orders (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES bo_organizations(id),
      supplier_id TEXT NOT NULL REFERENCES bo_suppliers(id),
      status TEXT NOT NULL DEFAULT 'draft',
      notes TEXT,
      created_by_user_id TEXT REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS bo_purchase_orders_org_idx ON bo_purchase_orders (organization_id)`

  await sql`
    CREATE TABLE IF NOT EXISTS bo_purchase_order_items (
      id TEXT PRIMARY KEY,
      purchase_order_id TEXT NOT NULL REFERENCES bo_purchase_orders(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES bo_products(id),
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_cost_cents INTEGER NOT NULL DEFAULT 0
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS bo_po_items_po_idx ON bo_purchase_order_items (purchase_order_id)`

  await sql`
    CREATE TABLE IF NOT EXISTS bo_pos_sales (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES bo_organizations(id),
      customer_id TEXT REFERENCES bo_customers(id),
      subtotal_cents INTEGER NOT NULL DEFAULT 0,
      tax_cents INTEGER NOT NULL DEFAULT 0,
      discount_cents INTEGER NOT NULL DEFAULT 0,
      total_cents INTEGER NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      status TEXT NOT NULL DEFAULT 'completed',
      loyalty_points_earned INTEGER NOT NULL DEFAULT 0,
      created_by_user_id TEXT REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS bo_pos_sales_org_idx ON bo_pos_sales (organization_id, created_at)`
  await sql`CREATE INDEX IF NOT EXISTS bo_pos_sales_customer_idx ON bo_pos_sales (customer_id)`

  await sql`
    CREATE TABLE IF NOT EXISTS bo_pos_sale_items (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL REFERENCES bo_pos_sales(id) ON DELETE CASCADE,
      product_id TEXT REFERENCES bo_products(id),
      description TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price_cents INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS bo_pos_sale_items_sale_idx ON bo_pos_sale_items (sale_id)`

  // Bario One Phase 9 — Flo API (Bario One's own customer-facing API,
  // same key shape as the main platform's flo_api_keys but scoped to an
  // organization_id instead of a crm_stack_id, since Bario One's tenancy
  // unit is the org). key_prefix stored in plaintext purely for the
  // customer's own "which key is this" recognition in the UI — the actual
  // secret only ever exists as a hash (key_hash), shown to the customer
  // exactly once at creation, same as every other credential in this app.
  await sql`
    CREATE TABLE IF NOT EXISTS bo_api_keys (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES bo_organizations(id),
      created_by_user_id TEXT REFERENCES users(id),
      name TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_used_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS bo_api_keys_org_idx ON bo_api_keys (organization_id)`

  // Bario One Phase 9 (finish) — outbound webhooks. This is the real,
  // buildable half of "Marketplace integrations": it connects Bario One to
  // Zapier/Make/n8n/literally-anything without Bario needing individual
  // developer-app approval from every provider (QuickBooks/Shopify each
  // require a real review process that can't be completed unilaterally —
  // see bario_one_platform memory). event_types_json is an array of
  // subscribed event names (e.g. ["invoice.paid","customer.created"]).
  await sql`
    CREATE TABLE IF NOT EXISTS bo_webhooks (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES bo_organizations(id),
      url TEXT NOT NULL,
      event_types_json TEXT NOT NULL DEFAULT '[]',
      secret TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_by_user_id TEXT REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS bo_webhooks_org_idx ON bo_webhooks (organization_id)`

  await sql`
    CREATE TABLE IF NOT EXISTS bo_webhook_deliveries (
      id TEXT PRIMARY KEY,
      webhook_id TEXT NOT NULL REFERENCES bo_webhooks(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      response_status INTEGER,
      success BOOLEAN NOT NULL DEFAULT false,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS bo_webhook_deliveries_webhook_idx ON bo_webhook_deliveries (webhook_id, created_at)`

  // Client Requests Portal — lets AFC Logistics and Sunbuilt Group submit
  // work requests directly and see an AI-estimated ETA computed against the
  // shared open-request queue for both companies. Deliberately separate
  // from the bo_* (Bario One) tables above: Bario One is the white-label CRM
  // product sold to arbitrary Bario customers to manage their OWN
  // customers; this is Sherwin's own internal client-ops tool for exactly
  // these two businesses, and needs estimate/priority fields bo_tasks
  // doesn't have.
  await sql`
    CREATE TABLE IF NOT EXISTS client_companies (
      user_id TEXT PRIMARY KEY REFERENCES users(id),
      company_key TEXT NOT NULL,
      company_label TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS client_requests (
      id TEXT PRIMARY KEY,
      company_key TEXT NOT NULL,
      user_id TEXT REFERENCES users(id),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      priority INTEGER NOT NULL DEFAULT 0,
      estimated_hours NUMERIC,
      estimated_completion_at TIMESTAMPTZ,
      estimate_reasoning TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS client_requests_company_idx ON client_requests (company_key, status)`
  await sql`
    CREATE TABLE IF NOT EXISTS client_request_events (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL REFERENCES client_requests(id),
      actor TEXT NOT NULL,
      actor_label TEXT NOT NULL,
      event_type TEXT NOT NULL,
      message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS client_request_events_request_idx ON client_request_events (request_id, created_at)`

  // Quick Links — admin-managed one-click buttons shown in the client
  // Requests portal (e.g. "Open Your CRM") so clients don't need to
  // remember URLs or juggle separate logins by hand.
  await sql`
    CREATE TABLE IF NOT EXISTS client_quick_links (
      id TEXT PRIMARY KEY,
      company_key TEXT NOT NULL,
      label TEXT NOT NULL,
      url TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS client_quick_links_company_idx ON client_quick_links (company_key, sort_order)`

  // Refund/financial-adjustment requests Aria (app/api/assistant/*) files
  // on a customer's behalf — never a refund itself, just a durable record +
  // trigger for a human to review. user_id is nullable because the
  // pre-login assistant can file one too (no session to attach it to), in
  // which case account_email/user_name come from what the visitor typed.
  await sql`
    CREATE TABLE IF NOT EXISTS refund_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      user_name TEXT,
      account_email TEXT NOT NULL,
      service_name TEXT NOT NULL,
      reason TEXT NOT NULL,
      attachment_url TEXT,
      status TEXT NOT NULL DEFAULT 'pending_review',
      sms_alert_sent BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `

  // Multi-agent CRM/lead-gen Phase 1 (2026-08-20) — lead scoring, priority,
  // and source-attribution foundation. Additive only: existing bo_customers
  // rows with no score yet just render blank/null in the UI, nothing here
  // changes existing read paths. See lib/leadPipeline.ts for the only
  // sanctioned write path to these tables (agents/services should never
  // write bo_customers.current_score directly).
  await sql`
    CREATE TABLE IF NOT EXISTS lead_scores (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES bo_customers(id) ON DELETE CASCADE,
      organization_id TEXT NOT NULL REFERENCES bo_organizations(id),
      score INTEGER NOT NULL,
      breakdown_json TEXT NOT NULL DEFAULT '{}',
      calculated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS lead_scores_customer_idx ON lead_scores (customer_id, calculated_at DESC)`

  // History of every priority change for a lead (spec: "Priority must be
  // dynamic... store priority changes") — append-only, never updated in
  // place, so a lead's full RED/YELLOW/GREEN/GREY trajectory stays
  // reconstructable for analytics later.
  await sql`
    CREATE TABLE IF NOT EXISTS priority_history (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES bo_customers(id) ON DELETE CASCADE,
      organization_id TEXT NOT NULL REFERENCES bo_organizations(id),
      priority TEXT NOT NULL,
      score INTEGER NOT NULL,
      reason TEXT NOT NULL,
      changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS priority_history_customer_idx ON priority_history (customer_id, changed_at DESC)`

  // First-touch/latest-touch source attribution, kept separate from
  // bo_customers itself (a lead can have multiple touches over time; this
  // table is append-only, bo_customers.source/campaign_id below are just a
  // denormalized "latest" cache for fast list rendering).
  await sql`
    CREATE TABLE IF NOT EXISTS lead_sources (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES bo_customers(id) ON DELETE CASCADE,
      source TEXT NOT NULL,
      source_detail TEXT,
      campaign_id TEXT,
      utm_source TEXT,
      utm_medium TEXT,
      utm_campaign TEXT,
      utm_content TEXT,
      utm_term TEXT,
      first_touch_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      latest_touch_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS lead_sources_customer_idx ON lead_sources (customer_id)`

  // Cached "current" values on bo_customers itself so list views don't need
  // a join/subquery against lead_scores/priority_history just to render a
  // badge — lead_scores/priority_history remain the source of truth/history,
  // these two columns are a read-optimization only, always written together
  // by lib/leadPipeline.ts's calculatePriority()/recordPriorityChange().
  await sql`ALTER TABLE bo_customers ADD COLUMN IF NOT EXISTS current_score INTEGER`
  await sql`ALTER TABLE bo_customers ADD COLUMN IF NOT EXISTS current_priority TEXT`
  await sql`ALTER TABLE bo_customers ADD COLUMN IF NOT EXISTS source TEXT`
  await sql`ALTER TABLE bo_customers ADD COLUMN IF NOT EXISTS campaign_id TEXT`
  await sql`ALTER TABLE bo_customers ADD COLUMN IF NOT EXISTS data_completeness_pct INTEGER`

  // Phase 7 (2026-08-20) — Bario One's own opt-out flag. Twenty CRM's
  // crm_do_not_contact table (person_id-keyed) doesn't apply here — Bario
  // One customers ARE bo_customers rows directly, no separate person
  // identity to key against, so this is just columns on the table itself.
  // unsubscribe_token backs a real public one-click unsubscribe link
  // embedded in bulk campaign emails (lib/barioOneCampaigns.ts) — CASL/
  // CAN-SPAM require every commercial bulk email to have one; generated
  // lazily (see lib/barioOneSuppression.ts) rather than backfilled for
  // every existing row.
  await sql`ALTER TABLE bo_customers ADD COLUMN IF NOT EXISTS do_not_contact BOOLEAN NOT NULL DEFAULT false`
  await sql`ALTER TABLE bo_customers ADD COLUMN IF NOT EXISTS do_not_contact_reason TEXT`
  await sql`ALTER TABLE bo_customers ADD COLUMN IF NOT EXISTS unsubscribe_token TEXT`
  // Phase 8 (business matching engine) — cached result of matching this
  // lead against the org's own bo_products catalog (lib/businessMatching.ts),
  // so the CRM detail view doesn't re-run an AI call on every page load;
  // refreshed only when someone clicks "Find matches" again.
  await sql`ALTER TABLE bo_customers ADD COLUMN IF NOT EXISTS suggested_products_json TEXT`
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS bo_customers_unsubscribe_token_idx ON bo_customers (unsubscribe_token) WHERE unsubscribe_token IS NOT NULL`

  // Phase 2 (2026-08-20) — the manual signal inputs (need/intent/fit/timing)
  // that calculateLeadScore() can't derive from bo_customers' own columns.
  // Persisted so recalculateLeadScore() can be re-run automatically (on
  // every customer edit or deal stage change) without the signals being
  // re-entered each time — last known values just carry forward.
  await sql`ALTER TABLE bo_customers ADD COLUMN IF NOT EXISTS lead_signals_json TEXT NOT NULL DEFAULT '{}'`

  // agent_tasks gets the structured field set the multi-agent orchestration
  // layer needs (Phase 3+) — added now, alongside the rest of this schema,
  // even though nothing writes them yet, so Phase 3 doesn't need its own
  // migration pass. All nullable/additive; existing rows (3 seed agents'
  // worth) are untouched.
  await sql`ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS lead_id TEXT REFERENCES bo_customers(id)`
  await sql`ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS contact_id TEXT`
  await sql`ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS company_id TEXT`
  await sql`ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS objective TEXT`
  await sql`ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS context_json TEXT`
  await sql`ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS data_confidence TEXT`
  await sql`ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS source_agent TEXT`
  await sql`ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS target_agent TEXT`
  await sql`ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS permissions_json TEXT`
  await sql`ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS restrictions_json TEXT`
  await sql`ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS expected_output TEXT`
  await sql`ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS deadline TIMESTAMPTZ`

  // Phase 3 (2026-08-20) — the actual output of a task once
  // lib/agentTasks.ts's processAgentTask() has run it through the
  // Router->Specialist->Critic->Delivery agency (lib/agentAgency/). NULL
  // means "not processed yet" -- that's what the agent-tasks cron scans
  // for, so a task with target_agent set but no result is exactly the
  // agency's work queue.
  await sql`ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS result_json TEXT`

  // Business OS Phase 1 (2026-08-21) — formal lifecycle stage. bo_customers
  // remains the single identity anchor (contact -> lead -> customer is a
  // state on the SAME row, never a different table) — this just makes
  // that lifecycle explicit instead of inferring it from tags/priority/
  // deal existence. NULL means "not yet classified" (every pre-existing
  // row) — same nullable-until-computed shape as current_score/
  // current_priority above. See lib/customerLifecycle.ts for the only
  // sanctioned write path (recalculateLifecycleStage), same pattern as
  // lib/leadPipeline.ts's recalculateLeadScore().
  await sql`ALTER TABLE bo_customers ADD COLUMN IF NOT EXISTS lifecycle_stage TEXT`
  await sql`CREATE INDEX IF NOT EXISTS bo_customers_lifecycle_stage_idx ON bo_customers (organization_id, lifecycle_stage)`

  // Business OS Phase 1 — external identity linking. Purely a place for a
  // FUTURE Spott.ca sync (a completely separate product/Supabase project,
  // no existing integration point today) to attach without inventing a
  // second identity table — this is exactly what keeps "a Spott customer,
  // a CRM customer, and a marketing customer" from ever being three
  // different rows for the same person. Nothing writes these yet.
  await sql`ALTER TABLE bo_customers ADD COLUMN IF NOT EXISTS external_source TEXT`
  await sql`ALTER TABLE bo_customers ADD COLUMN IF NOT EXISTS external_ref_id TEXT`
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS bo_customers_external_ref_unique
    ON bo_customers (organization_id, external_source, external_ref_id)
    WHERE external_source IS NOT NULL AND external_ref_id IS NOT NULL
  `

  // Business OS Phase 1 — bo_notes.kind grows 5 new values (spott_activity/
  // referral/review/website_visit/ai_conversation) so "Customer -> every
  // touch" stays ONE ordered table, the same precedent that already let
  // 'comment' get added with zero schema change (kind is free-text, not a
  // Postgres enum/CHECK — no constraint exists on it). metadata_json holds
  // the structured fields a few of these carry that a plain body string
  // doesn't fit (a review's rating/source URL, a website visit's page/
  // referrer, an AI conversation's session id) — every existing kind
  // leaves this at '{}', unaffected.
  await sql`ALTER TABLE bo_notes ADD COLUMN IF NOT EXISTS metadata_json TEXT NOT NULL DEFAULT '{}'`

  // Business OS Phase 1 — bo_appointments. Genuinely new: confirmed by
  // exhaustive grep that nothing under Bario One has ever modeled an
  // appointment before (bo_tasks is a plain due-date checklist, no time
  // range or location). Shaped as a direct sibling of bo_tasks (same org/
  // customer/deal/assignee columns), with the two fields a calendar-shaped
  // record needs beyond a task's single due_at: a real start/end range and
  // a location.
  await sql`
    CREATE TABLE IF NOT EXISTS bo_appointments (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES bo_organizations(id),
      customer_id TEXT REFERENCES bo_customers(id),
      deal_id TEXT REFERENCES bo_deals(id),
      assigned_to_user_id TEXT REFERENCES users(id),
      title TEXT NOT NULL,
      location TEXT,
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'scheduled',
      notes TEXT,
      created_by_user_id TEXT REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS bo_appointments_org_idx ON bo_appointments (organization_id)`
  await sql`CREATE INDEX IF NOT EXISTS bo_appointments_customer_idx ON bo_appointments (customer_id)`
  await sql`CREATE INDEX IF NOT EXISTS bo_appointments_starts_at_idx ON bo_appointments (organization_id, starts_at)`

  // Business OS Steps 3-15 (2026-08-21) — Marketing foundation (Step 6).
  // Four tables, not five: attribution folds into lead_sources below
  // rather than a separate marketing_attribution table, per Step 8's own
  // "do not duplicate/destroy existing attribution." Every row carries
  // organization_id (the tenant_id requirement). Schema only this pass —
  // no UI beyond a "Coming in Phase 2" placeholder writes to these yet.
  await sql`
    CREATE TABLE IF NOT EXISTS marketing_campaigns (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES bo_organizations(id),
      name TEXT NOT NULL,
      channel TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      audience_filter_json TEXT NOT NULL DEFAULT '{}',
      created_by_user_id TEXT REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS marketing_campaigns_org_idx ON marketing_campaigns (organization_id)`
  await sql`
    CREATE TABLE IF NOT EXISTS marketing_events (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES bo_organizations(id),
      campaign_id TEXT REFERENCES marketing_campaigns(id),
      customer_id TEXT REFERENCES bo_customers(id),
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS marketing_events_org_idx ON marketing_events (organization_id)`
  await sql`
    CREATE TABLE IF NOT EXISTS marketing_audiences (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES bo_organizations(id),
      name TEXT NOT NULL,
      filter_json TEXT NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS marketing_audiences_org_idx ON marketing_audiences (organization_id)`
  await sql`
    CREATE TABLE IF NOT EXISTS marketing_assets (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES bo_organizations(id),
      asset_type TEXT NOT NULL,
      url TEXT,
      name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS marketing_assets_org_idx ON marketing_assets (organization_id)`

  // Business OS Step 8 — unified lead attribution. lead_sources already
  // existed (built earlier tonight) but was never wired to anything —
  // confirmed via grep before extending it rather than creating a
  // separate marketing_attribution table. bo_customers.source (the flat
  // cache from Phases 4/6) is untouched — this becomes the real
  // multi-touch detail table going forward, written to by
  // lib/leadAttribution.ts's recordLeadSource().
  await sql`ALTER TABLE lead_sources ADD COLUMN IF NOT EXISTS creative TEXT`
  await sql`ALTER TABLE lead_sources ADD COLUMN IF NOT EXISTS landing_page TEXT`
  await sql`ALTER TABLE lead_sources ADD COLUMN IF NOT EXISTS referrer TEXT`

  // Business OS Step 7 — Spott integration architecture. spott_categories
  // is deliberately NOT tenant-scoped (a shared taxonomy like "Plumbing"
  // isn't per-business) — Step 7 only requires listings/leads to carry a
  // tenant. spott_leads.customer_id is the whole point: "every Spott lead
  // must be capable of being associated with an existing CRM contact or
  // creating a new one" (see lib/spottIntegration.ts). No live Spott sync
  // writes any of this yet — the architecture is ready to receive it.
  await sql`
    CREATE TABLE IF NOT EXISTS spott_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS spott_listings (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES bo_organizations(id),
      category_id TEXT REFERENCES spott_categories(id),
      external_spott_id TEXT,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS spott_listings_org_idx ON spott_listings (organization_id)`
  await sql`
    CREATE TABLE IF NOT EXISTS spott_promotions (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES bo_organizations(id),
      listing_id TEXT REFERENCES spott_listings(id),
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS spott_promotions_org_idx ON spott_promotions (organization_id)`
  await sql`
    CREATE TABLE IF NOT EXISTS spott_leads (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES bo_organizations(id),
      listing_id TEXT REFERENCES spott_listings(id),
      customer_id TEXT REFERENCES bo_customers(id),
      contact_name TEXT,
      phone TEXT,
      email TEXT,
      message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS spott_leads_org_idx ON spott_leads (organization_id)`
  await sql`
    CREATE TABLE IF NOT EXISTS spott_reviews (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES bo_organizations(id),
      listing_id TEXT REFERENCES spott_listings(id),
      customer_id TEXT REFERENCES bo_customers(id),
      rating INTEGER,
      body TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS spott_reviews_org_idx ON spott_reviews (organization_id)`

  // Phase 2 (2026-08-21) — Spott CRM integration. spott_listings gets
  // cache columns only (Spott stays authoritative for the business
  // profile — see the plan's D1); BARIO never silently overwrites what
  // Spott sends back.
  await sql`ALTER TABLE spott_listings ADD COLUMN IF NOT EXISTS public_url TEXT`
  await sql`ALTER TABLE spott_listings ADD COLUMN IF NOT EXISTS sync_status TEXT NOT NULL DEFAULT 'not_connected'`
  await sql`ALTER TABLE spott_listings ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ`
  await sql`ALTER TABLE spott_listings ADD COLUMN IF NOT EXISTS description TEXT`
  await sql`ALTER TABLE spott_listings ADD COLUMN IF NOT EXISTS phone TEXT`
  await sql`ALTER TABLE spott_listings ADD COLUMN IF NOT EXISTS email TEXT`
  await sql`ALTER TABLE spott_listings ADD COLUMN IF NOT EXISTS website TEXT`
  await sql`ALTER TABLE spott_listings ADD COLUMN IF NOT EXISTS address TEXT`
  await sql`ALTER TABLE spott_listings ADD COLUMN IF NOT EXISTS hours_json TEXT`
  await sql`ALTER TABLE spott_listings ADD COLUMN IF NOT EXISTS hero_image_url TEXT`
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS spott_listings_org_connected_idx ON spott_listings (organization_id) WHERE sync_status != 'not_connected'`

  // Credentials isolated from the constantly-read listing row (D3) — a
  // stray SELECT * on spott_listings can never leak a secret, same
  // reasoning as bo_webhooks keeping its own secret in its own row.
  await sql`
    CREATE TABLE IF NOT EXISTS spott_connection_credentials (
      id TEXT PRIMARY KEY,
      listing_id TEXT NOT NULL UNIQUE REFERENCES spott_listings(id),
      api_key TEXT NOT NULL,
      webhook_signing_secret TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `

  // spott_leads — only the relational bits (D2: generic multi-touch
  // attribution stays in lead_sources, never forked here).
  await sql`ALTER TABLE spott_leads ADD COLUMN IF NOT EXISTS promotion_id TEXT`
  await sql`ALTER TABLE spott_leads ADD COLUMN IF NOT EXISTS external_lead_id TEXT`
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS spott_leads_external_idx ON spott_leads (organization_id, external_lead_id) WHERE external_lead_id IS NOT NULL`

  // Inbound webhook idempotency — Spott's queue WILL redeliver on a
  // 5xx/timeout even after this side actually processed the event; a
  // duplicate delivery must be a no-op, never a second bo_customers row.
  await sql`
    CREATE TABLE IF NOT EXISTS spott_webhook_events (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES bo_organizations(id),
      event_type TEXT NOT NULL,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS spott_webhook_events_org_idx ON spott_webhook_events (organization_id)`

  await sql`
    INSERT INTO platform_settings (key, value, updated_at) VALUES ('schema_version', ${CURRENT_SCHEMA_VERSION}, now())
    ON CONFLICT (key) DO UPDATE SET value = ${CURRENT_SCHEMA_VERSION}, updated_at = now()
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
  admin_note: string | null
  suspended_at: string | null
  comp_protected_until: string | null
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

export type SiteAudit = {
  id: string
  user_id: string
  url: string
  findings_json: string
  ai_report_json: string | null
  credits_charged: number
  status: 'complete' | 'pending' | 'failed'
  error: string | null
  created_at: string
}

export type InvoiceChangeRequest = {
  id: string
  invoice_id: string | null
  agent_name: string
  change_type: 'create' | 'update'
  summary: string
  payload_json: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  decided_at: string | null
  decided_by: string | null
  last_error: string | null
}

export type AiIntegration = {
  id: string
  name: string
  provider: string
  model: string
  domains: string
  description: string
  has_cost_tracking: boolean
  source_file: string | null
  created_at: string
}

export type VictoriaCall = {
  id: string
  call_sid: string
  business_key: 'unique' | 'afc' | 'sunbuilt'
  direction: string
  from_number: string
  to_number: string
  duration_seconds: number
  claude_input_tokens: number
  claude_output_tokens: number
  claude_cost_cents: number
  twilio_cost_cents: number
  total_cost_cents: number
  started_at: string
  ended_at: string
  created_at: string
  caller_name: string | null
  summary: string | null
}

export type Staff = {
  id: string
  name: string
  email: string | null
  address: string | null
  province: string
  pay_type: 'hourly' | 'salary'
  pay_rate_cents: number
  pay_frequency: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly'
  federal_claim_amount_cents: number | null
  provincial_claim_amount_cents: number | null
  status: string
  created_at: string
}

export type Paystub = {
  id: string
  staff_id: string
  pay_period_start: string
  pay_period_end: string
  pay_date: string
  province: string
  gross_pay_cents: number
  bonuses_json: string
  additional_deductions_json: string
  cpp_cents: number
  cpp2_cents: number
  ei_cents: number
  federal_tax_cents: number
  provincial_tax_cents: number
  net_pay_cents: number
  ytd_gross_cents: number
  ytd_pensionable_cents: number
  ytd_insurable_cents: number
  ytd_deductions_cents: number
  ytd_net_cents: number
  created_at: string
}

export type StaffTd1Record = {
  id: string
  staff_id: string
  token: string
  province: string
  tax_year: number
  status: 'pending' | 'completed' | 'expired'
  federal_pdf_url: string | null
  provincial_pdf_url: string | null
  federal_total_claim_cents: number | null
  provincial_total_claim_cents: number | null
  signature_name: string | null
  signed_at: string | null
  signed_ip: string | null
  expires_at: string
  created_at: string
}

export type Agent = {
  id: string
  slug: string
  name: string
  role: string
  description: string
  responsibilities: string
  channels: string
  status: string
  created_at: string
}

export type AgentTask = {
  id: string
  agent_id: string
  title: string
  description: string | null
  status: 'open' | 'in_progress' | 'done'
  lead_id: string | null
  contact_id: string | null
  company_id: string | null
  objective: string | null
  context_json: string | null
  data_confidence: string | null
  source_agent: string | null
  target_agent: string | null
  permissions_json: string | null
  restrictions_json: string | null
  expected_output: string | null
  deadline: string | null
  result_json: string | null
  created_at: string
  updated_at: string
}

export type Invoice = {
  id: string
  type: 'quote' | 'invoice'
  number: string
  status: 'draft' | 'sent' | 'paid' | 'void'
  public_token: string
  client_name: string
  client_email: string | null
  client_address: string | null
  client_phone: string | null
  currency: string
  tax_percent: string
  discount_type: 'none' | 'percent' | 'fixed'
  discount_value: string
  notes: string | null
  due_date: string | null
  stripe_checkout_session_id: string | null
  stripe_payment_intent: string | null
  paid_at: string | null
  created_at: string
  updated_at: string
}

export type ExternalClientSubscription = {
  id: string
  client_key: string
  client_name: string
  client_email: string | null
  stripe_customer_id: string
  stripe_subscription_id: string | null
  stripe_checkout_session_id: string | null
  status: 'pending_checkout' | 'active' | 'canceled'
  line_items_json: string
  tax_percent: string
  created_at: string
  updated_at: string
}

export type InvoiceLineItem = {
  id: string
  invoice_id: string
  description: string
  quantity: string
  unit_price_cents: number
  sort_order: number
}

export type VpsInstance = {
  id: string
  user_id: string
  tier: string
  billing_cycle: string
  app_type: string
  wp_admin_user: string | null
  wp_admin_password_ciphertext: string | null
  wp_admin_password_iv: string | null
  wp_admin_password_revealed_at: string | null
  wp_domain: string | null
  wp_cert_issued_at: string | null
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

export type WpHostingNode = {
  id: string
  ipv4: string
  agent_api_token_ciphertext: string
  agent_api_token_iv: string
  status: 'active' | 'degraded' | 'unreachable' | 'draining'
  capacity_max_mb: number
  capacity_used_mb: number
  last_health_check_at: string | null
  created_at: string
  updated_at: string
}

export type WpSite = {
  id: string
  user_id: string
  node_id: string | null
  container_name: string | null
  ram_mb: number
  subdomain: string | null
  custom_domain: string | null
  domain_status: 'none' | 'pending' | 'verified'
  status: string
  wp_admin_user: string | null
  wp_admin_password_ciphertext: string | null
  wp_admin_password_iv: string | null
  wp_admin_password_revealed_at: string | null
  stripe_checkout_session_id: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  last_error: string | null
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
  content_hash: string | null
  updated_at: string
}

export type PersonalAccessToken = {
  id: string
  user_id: string
  token_hash: string
  device_name: string
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

export type VictoriaMessage = {
  id: string
  phone_number: string
  channel: string
  direction: 'inbound' | 'outbound'
  body: string
  created_at: string
}

export type VictoriaAppMessage = {
  id: string
  user_id: string
  direction: 'inbound' | 'outbound'
  body: string
  attachments_json: string | null
  tool_log_json: string | null
  created_at: string
}

export type VictoriaFamilyMember = {
  key: string
  name: string
  phone_number: string | null
  access_token: string
  last_location_lat: number | null
  last_location_lng: number | null
  last_location_at: string | null
  location_sharing_enabled: boolean
  created_at: string
}

export type VictoriaFamilyMessage = {
  id: string
  member_key: string
  direction: 'inbound' | 'outbound'
  body: string
  attachments_json: string | null
  tool_log_json: string | null
  created_at: string
}

export type CodingTaskRequest = {
  id: string
  user_id: string
  task: string
  status: 'pending' | 'in_progress' | 'done' | 'failed'
  result: string | null
  created_at: string
  completed_at: string | null
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

export type CrmStack = {
  id: string
  user_id: string
  slug: string
  subdomain: string
  workspace_display_name: string
  login_email: string
  status: 'provisioning' | 'active' | 'failed'
  step: string | null
  last_error: string | null
  twenty_api_key_encrypted: string | null
  twenty_api_key_iv: string | null
  login_password_encrypted: string | null
  login_password_iv: string | null
  created_at: string
  updated_at: string
}

export type FloApiKey = {
  id: string
  user_id: string
  crm_stack_id: string
  name: string
  key_prefix: string
  key_hash: string
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

export type VoiceAgentOrderStatus = 'pending_payment' | 'pending_build' | 'active'

export type VoiceAgentOrder = {
  id: string
  user_id: string
  business_name: string
  business_description: string
  forward_to_number: string
  greeting: string | null
  flo_api_key_id: string | null
  status: VoiceAgentOrderStatus
  stripe_checkout_session_id: string | null
  stripe_subscription_id: string | null
  created_at: string
  updated_at: string
}

export type VoiceAgentConfig = {
  id: string
  order_id: string
  twilio_number: string
  business_name: string
  business_description: string
  forward_to_number: string
  greeting: string
  flo_api_key_id: string | null
  business_profile_id: string | null
  created_at: string
}

export type BusinessProfileRow = {
  id: string
  owner_user_id: string | null
  lookup_key: string | null
  name: string
  about: string
  services_json: string
  hours: string | null
  service_area_json: string
  employees_json: string
  faq_json: string
  policies: string | null
  pricing_notes: string | null
  created_at: string
  updated_at: string
}

export type SocialPlatform = 'facebook' | 'instagram' | 'tiktok' | 'linkedin'

export type SocialConnection = {
  id: string
  user_id: string
  platform: SocialPlatform
  access_token: string
  refresh_token: string | null
  expires_at: string | null
  metadata_json: string
  notify_phone: string | null
  connected_at: string
  updated_at: string
}

export type SocialPlatformResult = { status: 'posted' | 'failed'; externalId?: string; error?: string }

export type SocialPost = {
  id: string
  user_id: string
  caption: string
  media_url: string | null
  media_type: 'video' | 'image'
  platforms_json: string
  is_ad_campaign: boolean
  target_budget_cents: number | null
  status_json: string
  created_at: string
  dispatched_at: string | null
}

export type SocialLead = {
  id: string
  user_id: string
  platform: SocialPlatform
  external_lead_id: string
  full_name: string | null
  email: string | null
  phone: string | null
  raw_json: string
  notified: boolean
  created_at: string
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

export type BoPlan = 'starter' | 'professional' | 'business' | 'enterprise'

export type BoOrganization = {
  id: string
  name: string
  slug: string
  owner_user_id: string
  plan: BoPlan
  subscription_status: 'trialing' | 'active' | 'past_due' | 'canceled'
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  trial_ends_at: string | null
  branding_logo_url: string | null
  branding_primary_color: string
  business_address: string | null
  business_phone: string | null
  business_email: string | null
  tax_number: string | null
  invoice_theme_key: string
  invoice_field_toggles_json: string
  enabled_modules_json: string
  stripe_connect_account_id: string | null
  stripe_connect_status: 'none' | 'onboarding' | 'active' | 'restricted'
  crm_mailbox_email: string | null
  crm_mailbox_imap_host: string | null
  crm_mailbox_imap_port: number | null
  crm_mailbox_smtp_host: string | null
  crm_mailbox_smtp_port: number | null
  crm_mailbox_password_ciphertext: string | null
  crm_mailbox_password_iv: string | null
  own_ai_provider: string | null
  own_ai_api_key_ciphertext: string | null
  own_ai_api_key_iv: string | null
  created_at: string
  updated_at: string
}

export type BoMembership = {
  id: string
  organization_id: string
  user_id: string | null
  invited_email: string | null
  invite_token: string | null
  role: 'owner' | 'admin' | 'employee'
  status: 'active' | 'invited' | 'suspended'
  created_at: string
  updated_at: string
}

export type LeadPriority = 'red' | 'yellow' | 'green' | 'grey'
export type BoCustomerLifecycleStage = 'contact' | 'lead' | 'customer'

export type BoCustomer = {
  id: string
  organization_id: string
  company_name: string | null
  contact_name: string
  phone: string | null
  email: string | null
  address: string | null
  tags_json: string
  loyalty_points: number
  custom_fields_json: string
  assigned_to_user_id: string | null
  created_by_user_id: string | null
  current_score: number | null
  current_priority: LeadPriority | null
  source: string | null
  campaign_id: string | null
  data_completeness_pct: number | null
  lead_signals_json: string
  do_not_contact: boolean
  do_not_contact_reason: string | null
  unsubscribe_token: string | null
  suggested_products_json: string | null
  lifecycle_stage: BoCustomerLifecycleStage | null
  external_source: string | null
  external_ref_id: string | null
  created_at: string
  updated_at: string
}

export type LeadScore = {
  id: string
  customer_id: string
  organization_id: string
  score: number
  breakdown_json: string
  calculated_at: string
}

export type PriorityHistoryEntry = {
  id: string
  customer_id: string
  organization_id: string
  priority: LeadPriority
  score: number
  reason: string
  changed_at: string
}

export type LeadSource = {
  id: string
  customer_id: string
  source: string
  source_detail: string | null
  campaign_id: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  utm_term: string | null
  creative: string | null
  landing_page: string | null
  referrer: string | null
  first_touch_at: string
  latest_touch_at: string
}

// Business OS Step 8 — the real vocabulary lib/leadAttribution.ts's
// recordLeadSource() writes into lead_sources.source. Free-text column
// (no CHECK constraint, matching this schema's convention), this is the
// app-level source of truth for valid values.
export const LEAD_SOURCE_VALUES = [
  'spott', 'website', 'landing_page', 'email', 'sms', 'referral', 'qr_code',
  'organic', 'google', 'facebook', 'instagram', 'direct', 'manual', 'ai',
] as const
export type LeadSourceValue = (typeof LEAD_SOURCE_VALUES)[number]

export type BoEmailCampaign = {
  id: string
  organization_id: string
  name: string
  subject: string
  body_html: string
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed'
  scheduled_at: string | null
  sent_at: string | null
  recipient_count: number
  sent_count: number
  failed_count: number
  personalize: boolean
  created_by_user_id: string | null
  created_via: 'admin' | 'ai_assistant'
  created_at: string
  updated_at: string
}

export type BoDealStage = 'lead' | 'opportunity' | 'quote' | 'won' | 'lost'

export type BoDeal = {
  id: string
  organization_id: string
  customer_id: string
  title: string
  stage: BoDealStage
  value_cents: number
  expected_close_date: string | null
  notes: string | null
  custom_fields_json: string
  pipeline_id: string | null
  assigned_to_user_id: string | null
  created_by_user_id: string | null
  created_at: string
  updated_at: string
}

export type BoPipeline = {
  id: string
  organization_id: string
  name: string
  is_default: boolean
  position: number
  created_at: string
  updated_at: string
}

export type BoPipelineStage = {
  id: string
  pipeline_id: string
  key: string
  name: string
  position: number
  created_at: string
  updated_at: string
}

export type BoAutomationTrigger = 'deal.created' | 'deal.stage_changed' | 'customer.created' | 'invoice.paid' | 'appointment.booked' | 'appointment.completed'
export type BoAutomationActionType = 'create_task' | 'add_tag' | 'add_note' | 'send_email' | 'send_sms'

export type BoAutomation = {
  id: string
  organization_id: string
  name: string
  trigger_event: BoAutomationTrigger
  trigger_filter_json: string
  action_type: BoAutomationActionType
  action_config_json: string
  status: 'active' | 'paused'
  created_by_user_id: string | null
  created_at: string
  updated_at: string
}

export type BoAutomationRun = {
  id: string
  automation_id: string
  context_json: string
  success: boolean
  error: string | null
  created_at: string
}

export type BoCustomFieldEntity = 'customer' | 'deal'
export type BoCustomFieldType = 'text' | 'number' | 'date' | 'select' | 'checkbox'

export type BoCustomField = {
  id: string
  organization_id: string
  entity_type: BoCustomFieldEntity
  name: string
  field_type: BoCustomFieldType
  options_json: string
  position: number
  created_at: string
  updated_at: string
}

export type BoTask = {
  id: string
  organization_id: string
  customer_id: string | null
  deal_id: string | null
  assigned_to_user_id: string | null
  title: string
  due_at: string | null
  status: 'open' | 'done'
  created_by_user_id: string | null
  created_at: string
  updated_at: string
}

export type BoNote = {
  id: string
  organization_id: string
  customer_id: string
  author_user_id: string | null
  kind: 'note' | 'email' | 'sms' | 'comment' | 'spott_activity' | 'referral' | 'review' | 'website_visit' | 'ai_conversation'
  body: string
  mentioned_user_ids_json: string
  message_id: string | null
  direction: 'outbound' | 'inbound' | null
  from_email: string | null
  metadata_json: string
  created_at: string
}

export type BoAppointmentStatus = 'scheduled' | 'completed' | 'canceled' | 'no_show'
export type BoAppointment = {
  id: string
  organization_id: string
  customer_id: string | null
  deal_id: string | null
  assigned_to_user_id: string | null
  title: string
  location: string | null
  starts_at: string
  ends_at: string | null
  status: BoAppointmentStatus
  notes: string | null
  created_by_user_id: string | null
  created_at: string
  updated_at: string
}

// Business OS Steps 3-15 — Marketing foundation (Step 6). Schema-only this
// pass; no UI writes to these yet beyond what's explicitly noted per-page.
export type MarketingCampaign = {
  id: string
  organization_id: string
  name: string
  channel: string
  status: string
  audience_filter_json: string
  created_by_user_id: string | null
  created_at: string
  updated_at: string
}
export type MarketingEvent = {
  id: string
  organization_id: string
  campaign_id: string | null
  customer_id: string | null
  event_type: string
  payload_json: string
  occurred_at: string
}
export type MarketingAudience = {
  id: string
  organization_id: string
  name: string
  filter_json: string
  created_at: string
}
export type MarketingAsset = {
  id: string
  organization_id: string
  asset_type: string
  url: string | null
  name: string | null
  created_at: string
}

// Business OS Step 7 — Spott integration architecture. No live sync
// writes any of this yet; see lib/spottIntegration.ts.
export type SpottCategory = { id: string; name: string; created_at: string }
export type SpottListingSyncStatus = 'not_connected' | 'pending' | 'synced' | 'conflict' | 'error'
export type SpottListing = {
  id: string
  organization_id: string
  category_id: string | null
  external_spott_id: string | null
  name: string
  status: string
  public_url: string | null
  sync_status: SpottListingSyncStatus
  last_synced_at: string | null
  description: string | null
  phone: string | null
  email: string | null
  website: string | null
  address: string | null
  hours_json: string | null
  hero_image_url: string | null
  created_at: string
  updated_at: string
}
export type SpottConnectionCredentials = {
  id: string
  listing_id: string
  api_key: string
  webhook_signing_secret: string
  created_at: string
}
export type SpottWebhookEvent = {
  id: string
  organization_id: string
  event_type: string
  processed_at: string
}
export type SpottPromotion = {
  id: string
  organization_id: string
  listing_id: string | null
  title: string
  status: string
  created_at: string
}
export type SpottLead = {
  id: string
  organization_id: string
  listing_id: string | null
  customer_id: string | null
  promotion_id: string | null
  external_lead_id: string | null
  contact_name: string | null
  phone: string | null
  email: string | null
  message: string | null
  created_at: string
}
export type SpottReview = {
  id: string
  organization_id: string
  listing_id: string | null
  customer_id: string | null
  rating: number | null
  body: string | null
  created_at: string
}

export type BoInvoiceType = 'estimate' | 'quote' | 'invoice' | 'work_order'

export type BoInvoice = {
  id: string
  organization_id: string
  customer_id: string
  type: BoInvoiceType
  number: string
  status: 'draft' | 'sent' | 'accepted' | 'paid' | 'overdue' | 'void'
  public_token: string
  currency: string
  tax_percent: number
  tax_label: string
  discount_type: 'none' | 'percent' | 'fixed'
  discount_value: number
  notes: string | null
  due_date: string | null
  is_recurring: boolean
  recurring_interval: 'weekly' | 'monthly' | 'yearly' | null
  next_recurrence_date: string | null
  sent_at: string | null
  paid_at: string | null
  stripe_checkout_session_id: string | null
  stripe_payment_intent: string | null
  created_by_user_id: string | null
  scheduled_date: string | null
  job_site_address: string | null
  assigned_employee_id: string | null
  converted_to_invoice_id: string | null
  converted_from_id: string | null
  created_at: string
  updated_at: string
}

export type BoInvoiceItem = {
  id: string
  invoice_id: string
  description: string
  quantity: number
  unit_price_cents: number
  sort_order: number
  product_id: string | null
  unit_cost_cents: number
}

export type BoEmployee = {
  id: string
  organization_id: string
  user_id: string | null
  name: string
  email: string | null
  phone: string | null
  position: string | null
  pay_type: 'salary' | 'hourly'
  salary_cents: number | null
  hourly_rate_cents: number | null
  status: 'active' | 'inactive'
  document_urls_json: string
  province: string | null
  vacation_pay_percent: number
  created_at: string
  updated_at: string
}

export type BoTimeEntry = {
  id: string
  organization_id: string
  employee_id: string
  clock_in: string
  clock_out: string | null
  created_at: string
}

export type BoShift = {
  id: string
  organization_id: string
  employee_id: string
  starts_at: string
  ends_at: string
  notes: string | null
  created_at: string
  updated_at: string
}

export type BoVacationRequest = {
  id: string
  organization_id: string
  employee_id: string
  start_date: string
  end_date: string
  status: 'pending' | 'approved' | 'denied'
  notes: string | null
  created_at: string
  updated_at: string
}

export type BoEmployeeNote = {
  id: string
  organization_id: string
  employee_id: string
  author_user_id: string | null
  body: string
  created_at: string
}

export type BoPayRun = {
  id: string
  organization_id: string
  frequency: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly'
  pay_period_start: string
  pay_period_end: string
  pay_date: string
  status: 'draft' | 'finalized'
  created_by_user_id: string | null
  created_at: string
  updated_at: string
}

export type BoPayStub = {
  id: string
  organization_id: string
  pay_run_id: string
  employee_id: string
  province: string
  regular_hours: number
  overtime_hours: number
  regular_cents: number
  overtime_cents: number
  vacation_pay_cents: number
  gross_cents: number
  federal_tax_cents: number
  provincial_tax_cents: number
  cpp_or_qpp_cents: number
  ei_cents: number
  qpip_cents: number
  net_pay_cents: number
  created_at: string
}

export type BoProduct = {
  id: string
  organization_id: string
  name: string
  sku: string | null
  barcode: string | null
  price_cents: number
  cost_cents: number
  stock_quantity: number
  low_stock_threshold: number
  status: 'active' | 'inactive'
  item_type: 'product' | 'service'
  description: string | null
  created_at: string
  updated_at: string
}

export type BoExpense = {
  id: string
  organization_id: string
  vendor: string | null
  category: string
  amount_cents: number
  tax_cents: number
  currency: string
  expense_date: string | null
  notes: string | null
  receipt_image_url: string | null
  ocr_raw_json: string | null
  status: 'needs_review' | 'confirmed'
  created_by_user_id: string | null
  created_at: string
  updated_at: string
}

export type BoSupplier = {
  id: string
  organization_id: string
  name: string
  email: string | null
  phone: string | null
  notes: string | null
  created_at: string
}

export type BoPurchaseOrder = {
  id: string
  organization_id: string
  supplier_id: string
  status: 'draft' | 'ordered' | 'received'
  notes: string | null
  created_by_user_id: string | null
  created_at: string
  updated_at: string
}

export type BoPurchaseOrderItem = {
  id: string
  purchase_order_id: string
  product_id: string
  quantity: number
  unit_cost_cents: number
}

export type BoPosSale = {
  id: string
  organization_id: string
  customer_id: string | null
  subtotal_cents: number
  tax_cents: number
  discount_cents: number
  total_cents: number
  payment_method: 'cash' | 'card' | 'other'
  status: 'completed' | 'refunded'
  loyalty_points_earned: number
  created_by_user_id: string | null
  created_at: string
}

export type BoPosSaleItem = {
  id: string
  sale_id: string
  product_id: string | null
  description: string
  quantity: number
  unit_price_cents: number
  sort_order: number
}

export type BoApiKey = {
  id: string
  organization_id: string
  created_by_user_id: string | null
  name: string
  key_prefix: string
  key_hash: string
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

export type BoWebhookEvent =
  | 'invoice.created' | 'invoice.sent' | 'invoice.paid' | 'customer.created' | 'pos_sale.completed' | 'shift.scheduled'
  // Business OS Steps 3-15 — lead.*/appointment.*/deal.won have real call
  // sites this pass. spott.*/review.*/referral.*/campaign.* are added so
  // the architecture "is capable of supporting" them (Step 9's own
  // wording) — nothing fires them yet since no live Spott sync or
  // campaign-send system exists to trigger them honestly.
  | 'lead.created' | 'lead.updated' | 'appointment.booked' | 'appointment.completed' | 'deal.won'
  | 'spott.lead_created' | 'spott.offer_claimed' | 'review.created' | 'referral.converted'
  | 'campaign.launched' | 'campaign.paused'

export type BoWebhook = {
  id: string
  organization_id: string
  url: string
  event_types_json: string
  secret: string
  status: 'active' | 'disabled'
  created_by_user_id: string | null
  created_at: string
  updated_at: string
}

export type BoWebhookDelivery = {
  id: string
  webhook_id: string
  event_type: string
  payload_json: string
  response_status: number | null
  success: boolean
  error: string | null
  created_at: string
}
