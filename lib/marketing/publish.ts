import type { MarketingPlatform } from '@/lib/db'
import { isPlatformConnected, missingEnvFor, PLATFORM_LABELS } from '@/lib/marketing/platforms'
import { postTweet } from '@/lib/marketing/twitter'
import { postToFacebook, postToInstagram } from '@/lib/marketing/meta'
import { postToLinkedIn } from '@/lib/marketing/linkedin'
import { postToGoogleBusiness } from '@/lib/marketing/googleBusiness'

export async function publishPost(platform: MarketingPlatform, content: string): Promise<string> {
  if (!isPlatformConnected(platform)) {
    throw new Error(
      `${PLATFORM_LABELS[platform]} isn't connected yet — missing: ${missingEnvFor(platform).join(', ')}`
    )
  }

  switch (platform) {
    case 'twitter':
      return postTweet(content)
    case 'facebook':
      return postToFacebook(content)
    case 'instagram':
      return postToInstagram(content)
    case 'linkedin':
      return postToLinkedIn(content)
    case 'google_business':
      return postToGoogleBusiness(content)
  }
}
