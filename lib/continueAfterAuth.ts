'use client'

// A relative in-app path only ("/foo", never "//foo" or "https://...") —
// guards against an open redirect via a crafted ?next= value.
function safeNext(next: string | null | undefined): string | null {
  if (!next) return null
  if (!next.startsWith('/') || next.startsWith('//')) return null
  return next
}

// After a successful login/signup: resume an in-progress plan checkout (if
// the user arrived via a pricing button) first, else go back to wherever
// they were trying to reach (?next=), else the dashboard.
export async function continueAfterAuth(plan: string | null, promoCode?: string | null, next?: string | null) {
  if (plan) {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ plan, promoCode: promoCode ?? undefined }),
    })
    const data = await res.json()
    if (res.ok && data.url) {
      window.location.href = data.url
      return
    }
  }
  window.location.href = safeNext(next) ?? '/dashboard'
}
