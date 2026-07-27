import { neon } from '@neondatabase/serverless'

let _sql: ReturnType<typeof neon> | undefined
let schemaReady: Promise<void> | undefined

function getSql() {
  if (!_sql) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    _sql = neon(url)
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
