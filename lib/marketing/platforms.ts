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

// Which env vars each platform needs before publish() can actually call out —
// checked up front so a missing credential fails fast with a clear message
// instead of a confusing HTTP error partway through.
const REQUIRED_ENV: Record<MarketingPlatform, string[]> = {
  twitter: ['TWITTER_API_KEY', 'TWITTER_API_SECRET', 'TWITTER_ACCESS_TOKEN', 'TWITTER_ACCESS_SECRET'],
  facebook: ['META_PAGE_ACCESS_TOKEN', 'META_PAGE_ID'],
  instagram: ['META_PAGE_ACCESS_TOKEN', 'META_IG_USER_ID'],
  linkedin: ['LINKEDIN_ACCESS_TOKEN', 'LINKEDIN_ORG_URN'],
  google_business: [
    'GOOGLE_BUSINESS_CLIENT_ID',
    'GOOGLE_BUSINESS_CLIENT_SECRET',
    'GOOGLE_BUSINESS_REFRESH_TOKEN',
    'GOOGLE_BUSINESS_ACCOUNT_ID',
    'GOOGLE_BUSINESS_LOCATION_ID',
  ],
}

export function isPlatformConnected(platform: MarketingPlatform): boolean {
  return REQUIRED_ENV[platform].every((key) => !!process.env[key])
}

export function missingEnvFor(platform: MarketingPlatform): string[] {
  return REQUIRED_ENV[platform].filter((key) => !process.env[key])
}

export const ALL_PLATFORMS: MarketingPlatform[] = ['twitter', 'facebook', 'instagram', 'linkedin', 'google_business']
