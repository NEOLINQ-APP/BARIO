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

export type TemplateLicense = {
  id: string
  user_id: string
  template_id: string
  site_id: string | null
  license_key: string
  status: 'pending_approval' | 'active' | 'revoked'
  stripe_payment_intent: string | null
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
