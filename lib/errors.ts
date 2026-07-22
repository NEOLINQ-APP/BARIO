import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'

// Logs the real error server-side (console + Sentry) but returns a generic
// message to the client so DB/Stripe/OpenAI internals never leak to users.
export function errorResponse(err: unknown, status = 500, fallback = 'Something went wrong. Please try again.') {
  console.error(err)
  Sentry.captureException(err)
  return NextResponse.json({ error: fallback }, { status })
}
