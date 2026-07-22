// Fixed-window counter backed by Postgres so limits hold across serverless
// instances. Returns true if the request is allowed, false if it should be blocked.
export async function rateLimit(sql: any, key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const windowMs = windowSeconds * 1000
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs).toISOString()

  const rows = (await sql`
    INSERT INTO rate_limits (key, window_start, count)
    VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
    RETURNING count
  `) as unknown as { count: number }[]

  // Opportunistic cleanup so the table doesn't grow forever — cheap enough to
  // run inline rather than standing up a cron job for it.
  if (Math.random() < 0.01) {
    await sql`DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'`
  }

  const count = rows[0]?.count ?? 1
  return count <= limit
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  return fwd ? fwd.split(',')[0].trim() : 'unknown'
}

export function rateLimitResponse() {
  return Response.json({ error: 'Too many requests — please wait a bit and try again.' }, { status: 429 })
}
