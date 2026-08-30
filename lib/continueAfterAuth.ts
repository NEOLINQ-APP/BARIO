'use client'

// A relative in-app path only ("/foo", never "//foo" or "https://...") —
// guards against an open redirect via a crafted ?next= value.
function safeNext(next: string | null | undefined): string | null {
  if (!next) return null
  if (!next.startsWith('/') || next.startsWith('//')) return null
  return next
}

// After a successful login/signup: for a brand-new signup only, offer the
// Backup Protection add-on first (once — existing accounts logging in
// never see this here, even though they also have a null
// backup_addon_status, since the column is new; this is only wired from
// SignupForm/GoogleSignInButton's signup path, never LoginForm). Then
// resume an in-progress plan checkout (if the user arrived via a pricing
// button), else go back to wherever they were trying to reach (?next=),
// else the dashboard.
export async function continueAfterAuth(plan: string | null, promoCode?: string | null, next?: string | null, isNewSignup?: boolean) {
  if (isNewSignup) {
    const params = new URLSearchParams()
    if (plan) params.set('plan', plan)
    if (promoCode) params.set('promo', promoCode)
    const resumeNext = safeNext(next) ?? (plan ? null : null)
    if (resumeNext) params.set('next', resumeNext)
    window.location.href = `/onboarding/backup${params.toString() ? `?${params}` : ''}`
    return
  }
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
