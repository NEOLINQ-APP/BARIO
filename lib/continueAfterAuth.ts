'use client'

// After a successful login/signup, either resume an in-progress plan
// checkout (if the user arrived via a pricing button) or go to the dashboard.
export async function continueAfterAuth(plan: string | null) {
  if (plan) {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ plan }),
    })
    const data = await res.json()
    if (res.ok && data.url) {
      window.location.href = data.url
      return
    }
  }
  window.location.href = '/dashboard'
}
