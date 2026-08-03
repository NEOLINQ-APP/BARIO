import type { db as dbFn, MarketingPlatform } from '@/lib/db'
import { isConnected } from '@/lib/marketing/connections'
import { PLATFORM_LABELS } from '@/lib/marketing/platforms'
import { postTweet } from '@/lib/marketing/twitter'
import { postToFacebook, postToInstagram } from '@/lib/marketing/meta'
import { postToLinkedIn } from '@/lib/marketing/linkedin'
import { postToGoogleBusiness } from '@/lib/marketing/googleBusiness'

type Sql = Awaited<ReturnType<typeof dbFn>>

export async function publishPost(sql: Sql, platform: MarketingPlatform, content: string): Promise<string> {
  if (!(await isConnected(sql, platform))) {
    throw new Error(`${PLATFORM_LABELS[platform]} isn't connected yet — connect it first from the Marketing page.`)
  }

  switch (platform) {
    case 'twitter':
      return postTweet(sql, content)
    case 'facebook':
      return postToFacebook(sql, content)
    case 'instagram':
      return postToInstagram(sql, content)
    case 'linkedin':
      return postToLinkedIn(sql, content)
    case 'google_business':
      return postToGoogleBusiness(sql, content)
  }
}
