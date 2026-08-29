import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

// One-off diagnostic (2026-08-21): the VPS's Anthropic key started
// returning "credit balance too low" right after the user says they topped
// up this morning — checking whether Vercel's own ANTHROPIC_API_KEY
// (victoria-app / Bario AI) belongs to the same organization/workspace as
// the VPS's key, without ever printing either raw key. Anthropic's API
// echoes organization-id/workspace-id response headers on every request.
export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] }),
    })
    const data = await res.json()
    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      organizationId: res.headers.get('anthropic-organization-id'),
      workspaceId: res.headers.get('anthropic-workspace-id'),
      errorMessage: data?.error?.message ?? null,
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}
