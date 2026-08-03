import type { MarketingPlatform } from '@/lib/db'

export const PLATFORM_LABELS: Record<MarketingPlatform, string> = {
  twitter: 'X (Twitter)',
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  google_business: 'Google Business Profile',
}

export const PLATFORM_CHAR_LIMITS: Record<MarketingPlatform, number> = {
  twitter: 280,
  facebook: 5000,
  instagram: 2200,
  linkedin: 3000,
  google_business: 1500,
}

// The "app" credentials (Client ID/Secret) identify Bario's own developer
// app registration on each platform — static, set once as env vars. These
// are what let the "Connect" button start an OAuth flow at all. The actual
// per-platform access token that flow produces lives in the
// marketing_connections table (see lib/marketing/connections.ts), not env
// vars — it's obtained dynamically, so env vars (which need a redeploy to
// change) are the wrong place for it.
const REQUIRED_APP_ENV: Record<MarketingPlatform, string[]> = {
  twitter: ['TWITTER_API_KEY', 'TWITTER_API_SECRET'],
  facebook: ['META_APP_ID', 'META_APP_SECRET'],
  instagram: ['META_APP_ID', 'META_APP_SECRET'],
  linkedin: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
  google_business: ['GOOGLE_BUSINESS_CLIENT_ID', 'GOOGLE_BUSINESS_CLIENT_SECRET'],
}

// Whether Bario's own developer app is configured for this platform — i.e.
// whether the "Connect" button can even attempt an OAuth flow yet.
export function isAppConfigured(platform: MarketingPlatform): boolean {
  return REQUIRED_APP_ENV[platform].every((key) => !!process.env[key])
}

export function missingAppEnvFor(platform: MarketingPlatform): string[] {
  return REQUIRED_APP_ENV[platform].filter((key) => !process.env[key])
}

export const ALL_PLATFORMS: MarketingPlatform[] = ['twitter', 'facebook', 'instagram', 'linkedin', 'google_business']
