'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

type SearchResult = {
  domain: string
  available: boolean
  isPremium: boolean
  premiumRegistrationPrice: number
  icannFee: number
  pricing: { registrationPrice: number; additionalCost: number; currency: string } | null
}

type Order = {
  id: string
  domain: string
  years: number
  status: string
  charged_amount: string | null
  retail_price_cents: number | null
  environment: string
  connected_to_site: boolean
  created_at: string
}

type Site = { id: string; name: string; custom_domain: string | null }

const STATUS_LABEL: Record<string, string> = {
  pending_payment: '⚪ Awaiting payment',
  registered: '🟢 Registered',
  failed: '🔴 Failed — contact support',
}

export default function DomainRegistration() {
  const searchParams = useSearchParams()

  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [redirecting, setRedirecting] = useState<string | null>(null)
  const [showForm, setShowForm] = useState<SearchResult | null>(null)
  const [contact, setContact] = useState({
    firstName: '', lastName: '', organizationName: '', address1: '', city: '', stateProvince: '', postalCode: '', country: 'CA', phone: '', emailAddress: '',
  })

  const [sites, setSites] = useState<Site[]>([])
  const [siteId, setSiteId] = useState('')

  const [orders, setOrders] = useState<Order[] | null>(null)

  async function loadOrders() {
    try {
      const res = await fetch('/api/domains/register')
      const data = await res.json()
      if (res.ok) setOrders(data.orders)
    } catch {
      // Non-fatal — order history is secondary to the search/register flow.
    }
  }

  async function loadSites() {
    try {
      const res = await fetch('/api/sites')
      const data = await res.json()
      if (res.ok) setSites(data.sites)
    } catch {
      // Non-fatal — connecting to a site is optional at purchase time.
    }
  }

  useEffect(() => {
    loadOrders()
    loadSites()
  }, [])

  // Returning from Stripe Checkout — the webhook does the actual
  // registration asynchronously, so poll briefly rather than assuming it's
  // done the instant the customer is redirected back.
  useEffect(() => {
    if (searchParams.get('purchased') !== '1') return
    let attempts = 0
    const interval = setInterval(() => {
      attempts += 1
      loadOrders()
      if (attempts >= 8) clearInterval(interval)
    }, 1500)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const clean = query.trim().toLowerCase()
    if (!clean) return
    const candidate = clean.includes('.') ? clean : `${clean}.com`
    setSearching(true)
    setError(null)
    setResults(null)
    try {
      const res = await fetch('/api/domains/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ domains: [candidate] }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Search failed')
      setResults(data.results)
    } catch (err: any) {
      setError(err.message)
    }
    setSearching(false)
  }

  function openRegisterForm(r: SearchResult) {
    setShowForm(r)
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    if (!showForm) return
    setRedirecting(showForm.domain)
    setError(null)
    try {
      const res = await fetch('/api/domains/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ domain: showForm.domain, years: 1, contact, siteId: siteId || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not start checkout')
      window.location.href = data.url
    } catch (err: any) {
      setError(err.message)
      setRedirecting(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-xs font-medium text-amber-700 dark:text-amber-400">
        🧪 Sandbox mode — domain registration runs against Namecheap's sandbox. Real Stripe payment is required to proceed, but no real domain has been purchased yet.
      </div>

      {searchParams.get('purchased') === '1' && (
        <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4 text-sm text-cyan-700 dark:text-cyan-400">
          Payment received — your domain is being registered now. This can take a few seconds; check "Your domain orders" below.
        </div>
      )}

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a domain, e.g. myrestaurant.com"
          className="flex-1 px-3 py-2.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
        />
        <button
          type="submit"
          disabled={searching || !query.trim()}
          className="px-4 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-semibold text-sm"
        >
          {searching ? 'Searching…' : 'Search'}
        </button>
      </form>

      {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}

      {results && (
        <div className="space-y-2">
          {results.map((r) => (
            <div key={r.domain} className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-zinc-800 p-4">
              <div>
                <span className="font-semibold">{r.domain}</span>
                <span className={`block text-xs mt-0.5 ${r.available ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-zinc-500'}`}>
                  {r.available ? 'Available' : 'Already registered'}
                </span>
              </div>
              {r.available && (
                <div className="flex items-center gap-3">
                  {r.isPremium ? (
                    <span className="text-xs text-slate-500 dark:text-zinc-500">Premium domain (${r.premiumRegistrationPrice}/yr)</span>
                  ) : r.pricing ? (
                    <span className="text-sm font-semibold tabular-nums">
                      ${(r.pricing.registrationPrice + r.pricing.additionalCost).toFixed(2)} {r.pricing.currency}/yr
                    </span>
                  ) : null}
                  <button
                    onClick={() => openRegisterForm(r)}
                    disabled={r.isPremium}
                    className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-semibold text-xs"
                  >
                    Register
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleRegister} className="space-y-3 rounded-xl border border-slate-300 dark:border-zinc-700 p-4">
          <p className="text-sm font-semibold">Register {showForm.domain} — registrant details</p>
          <div className="grid grid-cols-2 gap-2">
            <input required placeholder="First name" value={contact.firstName} onChange={(e) => setContact({ ...contact, firstName: e.target.value })} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm" />
            <input required placeholder="Last name" value={contact.lastName} onChange={(e) => setContact({ ...contact, lastName: e.target.value })} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm" />
            <input placeholder="Company / organization (optional)" value={contact.organizationName} onChange={(e) => setContact({ ...contact, organizationName: e.target.value })} className="col-span-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm" />
            <input required placeholder="Address" value={contact.address1} onChange={(e) => setContact({ ...contact, address1: e.target.value })} className="col-span-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm" />
            <input required placeholder="City" value={contact.city} onChange={(e) => setContact({ ...contact, city: e.target.value })} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm" />
            <input required placeholder="Province/State" value={contact.stateProvince} onChange={(e) => setContact({ ...contact, stateProvince: e.target.value })} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm" />
            <input required placeholder="Postal/ZIP code" value={contact.postalCode} onChange={(e) => setContact({ ...contact, postalCode: e.target.value })} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm" />
            <input required placeholder="Country (e.g. CA)" value={contact.country} onChange={(e) => setContact({ ...contact, country: e.target.value })} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm" />
            <input required placeholder="Phone, e.g. +1.7801234567" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm" />
            <input required type="email" placeholder="Email" value={contact.emailAddress} onChange={(e) => setContact({ ...contact, emailAddress: e.target.value })} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm" />
          </div>

          {sites.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-zinc-400 mb-1">
                Connect to a site automatically (optional)
              </label>
              <select
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
              >
                <option value="">Don't connect yet</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id} disabled={!!s.custom_domain}>
                    {s.name}{s.custom_domain ? ` (already has ${s.custom_domain})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-2">
            <button type="button" onClick={() => setShowForm(null)} className="flex-1 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 text-sm font-semibold">Cancel</button>
            <button type="submit" disabled={redirecting === showForm.domain} className="flex-1 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-semibold text-sm">
              {redirecting === showForm.domain ? 'Redirecting to payment…' : 'Continue to payment'}
            </button>
          </div>
        </form>
      )}

      {orders && orders.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 dark:text-zinc-500 mb-2">Your domain orders</p>
          <div className="space-y-1">
            {orders.map((o) => (
              <div key={o.id} className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-zinc-800 px-3 py-2 text-sm">
                <span>
                  {o.domain}{' '}
                  <span className="text-xs text-slate-500 dark:text-zinc-500">
                    ({o.years}yr{o.environment === 'sandbox' ? ', sandbox' : ''}{o.connected_to_site ? ', connected to a site' : ''})
                  </span>
                </span>
                <span className="text-xs">{STATUS_LABEL[o.status] ?? o.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
