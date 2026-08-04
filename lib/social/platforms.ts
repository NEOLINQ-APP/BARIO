import type { SocialPlatform } from '@/lib/db'

export const ALL_SOCIAL_PLATFORMS: SocialPlatform[] = ['facebook', 'instagram', 'tiktok', 'linkedin']

export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
}

// Same "Bario's own developer app credentials, set once as env vars" split
// as lib/marketing/platforms.ts — the per-user access token lives in
// social_connections, obtained dynamically, never in an env var.
const REQUIRED_APP_ENV: Record<SocialPlatform, string[]> = {
  facebook: ['META_APP_ID', 'META_APP_SECRET'],
  instagram: ['META_APP_ID', 'META_APP_SECRET'],
  tiktok: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
  linkedin: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
}

export function isSocialAppConfigured(platform: SocialPlatform): boolean {
  return REQUIRED_APP_ENV[platform].every((key) => !!process.env[key])
}

export function missingSocialAppEnvFor(platform: SocialPlatform): string[] {
  return REQUIRED_APP_ENV[platform].filter((key) => !process.env[key])
}

export function isSocialPlatform(v: unknown): v is SocialPlatform {
  return typeof v === 'string' && (ALL_SOCIAL_PLATFORMS as string[]).includes(v)
}
