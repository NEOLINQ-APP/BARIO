import { NextResponse } from 'next/server'
import { requireFloApiKey } from '@/lib/flo/auth'

// Serves social_leads directly (Social Dispatcher's Lead Ads capture) —
// doesn't go through Twenty at all, so it works regardless of whether this
// workspace has been linked yet (see twentyClient.ts's TwentyNotLinkedError).
export async function GET(req: Request) {
  const auth = await requireFloApiKey(req)
  if (auth instanceof NextResponse) return auth
  const { sql, apiKey } = auth

  const leads = await sql`
    SELECT id, platform, full_name, email, phone, created_at
    FROM social_leads WHERE user_id = ${apiKey.user_id} ORDER BY created_at DESC LIMIT 100
  `
  return NextResponse.json({ leads })
}
