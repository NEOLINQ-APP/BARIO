import { randomUUID } from 'node:crypto'
import type { db as dbFn, SocialPlatform, SocialPlatformResult } from '@/lib/db'
import { isSocialConnected } from '@/lib/social/connections'
import { SOCIAL_PLATFORM_LABELS } from '@/lib/social/platforms'
import { postFacebookVideo, postFacebookFeed, postInstagramReel, postInstagramImage } from '@/lib/social/meta'
import { publishTikTokVideo } from '@/lib/social/tiktok'
import { postToLinkedIn } from '@/lib/social/linkedin'

type Sql = Awaited<ReturnType<typeof dbFn>>

export type DispatchInput = {
  caption: string
  mediaUrl: string | null
  mediaType: 'video' | 'image'
  platforms: SocialPlatform[]
  isAdCampaign: boolean
  targetBudgetCents: number | null
}

async function dispatchOne(sql: Sql, userId: string, platform: SocialPlatform, input: DispatchInput): Promise<SocialPlatformResult> {
  try {
    if (!(await isSocialConnected(sql, userId, platform))) {
      throw new Error(`${SOCIAL_PLATFORM_LABELS[platform]} isn't connected yet`)
    }

    let externalId: string
    switch (platform) {
      case 'facebook':
        externalId = input.mediaUrl && input.mediaType === 'video'
          ? await postFacebookVideo(sql, userId, { videoUrl: input.mediaUrl, caption: input.caption })
          : await postFacebookFeed(sql, userId, input.caption)
        break
      case 'instagram':
        if (!input.mediaUrl) throw new Error('Instagram requires a photo or video — text-only posts are not supported by their API')
        externalId = input.mediaType === 'video'
          ? await postInstagramReel(sql, userId, { videoUrl: input.mediaUrl, caption: input.caption })
          : await postInstagramImage(sql, userId, { imageUrl: input.mediaUrl, caption: input.caption })
        break
      case 'tiktok': {
        if (!input.mediaUrl) throw new Error('TikTok requires a video')
        const result = await publishTikTokVideo(sql, userId, { videoUrl: input.mediaUrl, caption: input.caption })
        externalId = result.landedInInbox
          ? `${result.publishId} (sent to your TikTok inbox for manual approval — Bario's TikTok app isn't audited for direct posting yet)`
          : result.publishId
        break
      }
      case 'linkedin':
        externalId = await postToLinkedIn(sql, userId, { caption: input.caption, videoUrl: input.mediaUrl ?? undefined })
        break
    }
    return { status: 'posted', externalId }
  } catch (err: any) {
    return { status: 'failed', error: err.message || 'Unknown error' }
  }
}

// Fires every selected platform concurrently and records a result per
// platform regardless of whether others failed — the whole point of
// Promise.allSettled here is that one expired LinkedIn token doesn't take
// down the Facebook/Instagram/TikTok legs that would otherwise have
// succeeded. Persists the row itself (rather than leaving that to the
// caller) so a post's real status survives even if the request times out
// mid-dispatch on a slow platform.
export async function dispatchSocialBlast(sql: Sql, userId: string, input: DispatchInput): Promise<{ id: string; results: Record<string, SocialPlatformResult> }> {
  if (input.isAdCampaign) {
    // Paid ad campaigns are a genuinely different API surface (Marketing
    // API: Campaign -> AdSet -> AdCreative -> Ad, each subject to Meta's ad
    // review, needs a funded, permission-granted ad account, and real spend
    // safeguards this dashboard doesn't have yet) — refusing loudly here
    // beats silently downgrading an "ad" to a free organic post, which
    // would misrepresent what actually happened with the customer's budget.
    throw new Error('Paid ad campaigns aren\'t enabled yet — this posts organically only. Contact support to enable ad campaigns for your account.')
  }

  const id = randomUUID()
  await sql`
    INSERT INTO social_posts (id, user_id, caption, media_url, media_type, platforms_json, is_ad_campaign, target_budget_cents, status_json, created_at, dispatched_at)
    VALUES (${id}, ${userId}, ${input.caption}, ${input.mediaUrl}, ${input.mediaType}, ${JSON.stringify(input.platforms)}, ${input.isAdCampaign}, ${input.targetBudgetCents}, '{}', now(), now())
  `

  const settled = await Promise.allSettled(input.platforms.map((p) => dispatchOne(sql, userId, p, input)))
  const results: Record<string, SocialPlatformResult> = {}
  input.platforms.forEach((platform, i) => {
    const outcome = settled[i]
    results[platform] = outcome.status === 'fulfilled' ? outcome.value : { status: 'failed', error: outcome.reason?.message || 'Unknown error' }
  })

  await sql`UPDATE social_posts SET status_json = ${JSON.stringify(results)} WHERE id = ${id}`

  return { id, results }
}
