'use client'

import { useEffect, useState } from 'react'
import ThemeToggle from '@/components/ThemeToggle'

type Card = { id: string; brand: string; last4: string; exp_month: number; exp_year: number; nickname: string | null }
type Bill = {
  id: string
  vendor: string
  service_name: string
  plan_or_model: string | null
  amount_cents: number
  currency: string
  billing_cycle: string
  due_date: string | null
  status: 'active' | 'suspended' | 'warning'
  notes: string | null
  card_id: string | null
  card_brand: string | null
  card_last4: string | null
  last_paid_at: string | null
  display: { color: 'red' | 'yellow' | 'orange' | 'green'; flashing: boolean }
}

const DOT_COLOR: Record<Bill['display']['color'], string> = {
  red: 'bg-red-500',
  yellow: 'bg-yellow-400',
  orange: 'bg-orange-500',
  green: 'bg-emerald-500',
}

function money(cents: number, currency: string) {
  return `$${(cents / 100).toFixed(2)} ${currency}`
}

function BillForm({ onSaved, cards }: { onSaved: () => void; cards: Card[] }) {
  const [open, setOpen] = useState(false)
  const [vendor, setVendor] = useState('')
  const [serviceName, setServiceName] = useState('')
  const [planOrModel, setPlanOrModel] = useState('')
  const [amount, setAmount] = useState('')
  const [billingCycle, setBillingCycle] = useState('monthly')
  const [dueDate, setDueDate] = useState('')
  const [status, setStatus] = useState('active')
  const [cardId, setCardId] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await fetch('/api/admin/bario-pay/bills', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          vendor, serviceName, planOrModel: planOrModel || undefined,
          amountCents: Math.round(parseFloat(amount || '0') * 100),
          billingCycle, dueDate: dueDate || undefined, status, cardId: cardId || undefined,
        }),
      })
      setVendor(''); setServiceName(''); setPlanOrModel(''); setAmount(''); setDueDate(''); setStatus('active'); setCardId('')
      setOpen(false)
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-4 py-2 mb-4">
        + Add bill
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4 space-y-2 mb-4">
      <div className="grid grid-cols-2 gap-2">
        <input required value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Vendor (e.g. Hostinger)" className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
        <input required value={serviceName} onChange={(e) => setServiceName(e.target.value)} placeholder="Service (e.g. Main VPS)" className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
      </div>
      <input value={planOrModel} onChange={(e) => setPlanOrModel(e.target.value)} placeholder="Plan / model # (e.g. KVM 2)" className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
      <div className="grid grid-cols-3 gap-2">
        <input required value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0" step="0.01" placeholder="Amount $" className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
        <select value={billingCycle} onChange={(e) => setBillingCycle(e.target.value)} className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm">
          <option value="monthly">Monthly</option>
          <option value="annual">Annual</option>
          <option value="biennial">Every 2 years</option>
          <option value="one_time">One-time</option>
        </select>
        <input value={dueDate} onChange={(e) => setDueDate(e.target.value)} type="date" className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm">
          <option value="active">Active</option>
          <option value="warning">Warning — needs a look</option>
          <option value="suspended">Suspended / down for non-payment</option>
        </select>
        <select value={cardId} onChange={(e) => setCardId(e.target.value)} className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm">
          <option value="">No card assigned</option>
          {cards.map((c) => (
            <option key={c.id} value={c.id}>{c.brand} •••• {c.last4}{c.nickname ? ` (${c.nickname})` : ''}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={busy} className="rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2">
          {busy ? 'Saving…' : 'Save bill'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg text-sm font-medium px-4 py-2 text-slate-500 dark:text-zinc-400">Cancel</button>
      </div>
    </form>
  )
}

export default function AdminBarioPay() {
  const [bills, setBills] = useState<Bill[] | null>(null)
  const [cards, setCards] = useState<Card[] | null>(null)
  const [addingCard, setAddingCard] = useState(false)

  async function loadBills() {
    const res = await fetch('/api/admin/bario-pay/bills')
    const data = await res.json()
    setBills(data.bills ?? [])
  }
  async function loadCards() {
    const res = await fetch('/api/admin/bario-pay/cards')
    const data = await res.json()
    setCards(data.cards ?? [])
  }

  useEffect(() => {
    loadBills()
    loadCards()
    const params = new URLSearchParams(window.location.search)
    const sessionId = params.get('added_card_session')
    if (sessionId) {
      fetch('/api/admin/bario-pay/cards', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ checkoutSessionId: sessionId }),
      }).finally(() => {
        loadCards()
        window.history.replaceState(null, '', window.location.pathname)
      })
    }
  }, [])

  async function addCard() {
    setAddingCard(true)
    try {
      const res = await fetch('/api/admin/bario-pay/add-card-session', { method: 'POST' })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } finally {
      setAddingCard(false)
    }
  }

  async function deleteCard(id: string) {
    await fetch(`/api/admin/bario-pay/cards/${id}`, { method: 'DELETE' })
    loadCards()
    loadBills()
  }

  async function updateBill(id: string, patch: Record<string, unknown>) {
    await fetch(`/api/admin/bario-pay/bills/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    })
    loadBills()
  }

  async function deleteBill(id: string) {
    await fetch(`/api/admin/bario-pay/bills/${id}`, { method: 'DELETE' })
    loadBills()
  }

  const totalMonthly = (bills ?? [])
    .filter((b) => b.billing_cycle === 'monthly' && b.status !== 'suspended')
    .reduce((sum, b) => sum + b.amount_cents, 0)

  return (
    <main className="min-h-screen bg-white dark:bg-[#0b111c] text-slate-900 dark:text-zinc-100 antialiased px-6 py-16">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Bario Pay</h1>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
              Every real bill Bario pays each month, what it costs, and which card pays it.
              {bills && <> Active monthly total: <span className="font-semibold text-slate-700 dark:text-zinc-200">{money(totalMonthly, 'CAD')}</span>.</>}
            </p>
          </div>
          <ThemeToggle />
        </div>

        {/* Cards */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400 mb-3">Cards on file</h2>
          <div className="flex flex-wrap gap-3 mb-3">
            {cards?.map((c) => (
              <div key={c.id} className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] px-4 py-3 flex items-center gap-3">
                <span className="text-sm font-medium">{c.brand.toUpperCase()} •••• {c.last4}</span>
                <span className="text-xs text-slate-500 dark:text-zinc-500">exp {c.exp_month}/{c.exp_year}</span>
                <button onClick={() => deleteCard(c.id)} className="text-xs text-red-500 hover:text-red-600">Remove</button>
              </div>
            ))}
          </div>
          <button onClick={addCard} disabled={addingCard} className="rounded-lg border border-slate-300 dark:border-zinc-700 text-sm font-medium px-4 py-2 hover:bg-slate-50 dark:hover:bg-zinc-900 disabled:opacity-50">
            {addingCard ? 'Redirecting…' : '+ Add a card (via Stripe, secure)'}
          </button>
        </section>

        {/* Bills */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400 mb-3">Bills</h2>
          <BillForm onSaved={loadBills} cards={cards ?? []} />

          {bills === null ? (
            <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>
          ) : bills.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-zinc-400">No bills yet.</p>
          ) : (
            <div className="space-y-2">
              {bills.map((b) => (
                <div key={b.id} className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4 flex items-center gap-4">
                  <span className={`h-3 w-3 rounded-full shrink-0 ${DOT_COLOR[b.display.color]} ${b.display.flashing ? 'animate-pulse' : ''}`} title={b.display.flashing ? 'Due within 7 days' : b.display.color} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-semibold">{b.vendor}</span>
                      <span className="text-sm text-slate-500 dark:text-zinc-400">{b.service_name}</span>
                      {b.plan_or_model && <span className="text-xs text-slate-400 dark:text-zinc-500">({b.plan_or_model})</span>}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5 flex gap-3 flex-wrap">
                      <span>{money(b.amount_cents, b.currency)}/{b.billing_cycle === 'monthly' ? 'mo' : b.billing_cycle}</span>
                      {b.due_date && <span>Due {new Date(b.due_date).toLocaleDateString()}</span>}
                      {b.card_brand && <span>💳 {b.card_brand} •••• {b.card_last4}</span>}
                      {b.last_paid_at && <span>Last paid {new Date(b.last_paid_at).toLocaleDateString()}</span>}
                    </div>
                  </div>
                  <select
                    value={b.status}
                    onChange={(e) => updateBill(b.id, { status: e.target.value })}
                    className="text-xs rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-2 py-1"
                  >
                    <option value="active">Active</option>
                    <option value="warning">Warning</option>
                    <option value="suspended">Suspended</option>
                  </select>
                  <button onClick={() => updateBill(b.id, { markPaid: true })} className="text-xs rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5">Mark paid</button>
                  <button onClick={() => deleteBill(b.id)} className="text-xs text-red-500 hover:text-red-600">Delete</button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
