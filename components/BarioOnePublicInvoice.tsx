'use client'

import { useEffect, useState } from 'react'
import { INVOICE_THEMES, type InvoiceThemeKey } from '@/lib/barioOneInvoiceThemes'

type Data = {
  invoice: {
    type: string
    number: string
    status: string
    currency: string
    taxLabel: string
    dueDate: string | null
    createdAt: string
    notes: string | null
  }
  items: { description: string; quantity: number; unitPriceCents: number }[]
  totals: { subtotalCents: number; discountCents: number; taxCents: number; totalCents: number }
  customer: { name: string; email: string | null; address: string | null } | null
  org: {
    name: string
    logoUrl: string | null
    primaryColor: string
    themeKey: string
    fieldToggles: { showTaxNumber: boolean; showDueDate: boolean; showNotes: boolean; showBusinessAddress: boolean }
    businessAddress: string | null
    businessPhone: string | null
    businessEmail: string | null
    taxNumber: string | null
  } | null
  canPayOnline: boolean
} | null

function money(cents: number, currency: string) {
  return `${(cents / 100).toFixed(2)} ${currency}`
}

export default function BarioOnePublicInvoice({ token }: { token: string }) {
  const [data, setData] = useState<Data>(undefined as any)
  const [error, setError] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  async function load() {
    const res = await fetch(`/api/bo-invoice/${token}`)
    const json = await res.json()
    if (json.error) throw new Error(json.error)
    setData(json)
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const sessionId = params.get('session_id')

    async function run() {
      try {
        if (sessionId) {
          setConfirming(true)
          await fetch(`/api/bo-invoice/${token}/confirm`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId }),
          })
          window.history.replaceState({}, '', window.location.pathname)
        }
        await load()
      } catch (err: any) {
        setError(err.message)
      } finally {
        setConfirming(false)
      }
    }
    run()
  }, [token])

  async function handlePay() {
    setPaying(true)
    setPayError(null)
    try {
      const res = await fetch(`/api/bo-invoice/${token}/pay`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not start payment')
      window.location.href = json.url
    } catch (err: any) {
      setPayError(err.message)
      setPaying(false)
    }
  }

  if (error) return <main className="min-h-screen flex items-center justify-center text-sm text-red-500">{error}</main>
  if (data === undefined || confirming) return <main className="min-h-screen flex items-center justify-center text-sm text-slate-500">Loading…</main>
  if (!data) return null

  const { invoice, items, totals, customer, org, canPayOnline } = data
  const canPay = canPayOnline && invoice.status !== 'paid' && invoice.status !== 'void'
  const theme = INVOICE_THEMES[(org?.themeKey as InvoiceThemeKey) ?? 'classic'] ?? INVOICE_THEMES.classic
  const accent = org?.primaryColor || '#d4af37'
  const isBand = theme.headerStyle === 'band'
  const isCentered = theme.headerStyle === 'centered'
  const toggles = org?.fieldToggles

  return (
    <main className="min-h-screen bg-white dark:bg-[#0b111c] text-slate-900 dark:text-zinc-100 antialiased px-6 py-16">
      <div className="max-w-xl mx-auto">
        <div
          className={`flex items-start justify-between mb-8 rounded-xl ${isBand ? 'p-4 -mx-4 sm:mx-0' : ''} ${isCentered ? 'flex-col items-center gap-2 text-center' : ''}`}
          style={isBand ? { backgroundColor: accent, color: '#fff' } : undefined}
        >
          <div className={`flex items-center gap-2 ${isCentered ? 'flex-col' : ''}`}>
            {org?.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={org.logoUrl} alt={org.name} className="h-8 w-8 object-contain" />
            )}
            <div>
              <p className="font-extrabold text-lg leading-tight" style={!isBand ? { color: accent } : undefined}>{org?.name ?? 'Business'}</p>
              {toggles?.showBusinessAddress && org?.businessAddress && (
                <p className={`text-xs whitespace-pre-line ${isBand ? 'text-white/80' : 'text-slate-500 dark:text-zinc-400'}`}>{org.businessAddress}</p>
              )}
              {org?.businessEmail && <p className={`text-xs ${isBand ? 'text-white/80' : 'text-slate-500 dark:text-zinc-400'}`}>{org.businessEmail}</p>}
              {org?.businessPhone && <p className={`text-xs ${isBand ? 'text-white/80' : 'text-slate-500 dark:text-zinc-400'}`}>{org.businessPhone}</p>}
              {toggles?.showTaxNumber && org?.taxNumber && <p className={`text-xs ${isBand ? 'text-white/80' : 'text-slate-500 dark:text-zinc-400'}`}>Tax #: {org.taxNumber}</p>}
            </div>
          </div>
          <div className={isCentered ? 'text-center' : 'text-right'}>
            <p className="text-lg font-bold uppercase">{invoice.type.replace('_', ' ')}</p>
            <p className={`text-sm ${isBand ? 'text-white/80' : 'text-slate-500 dark:text-zinc-500'}`}>{invoice.number}</p>
          </div>
        </div>

        {invoice.status === 'paid' && (
          <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-600 dark:text-emerald-400 font-semibold">
            ✓ Paid — thank you!
          </div>
        )}
        {invoice.status === 'void' && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-500 dark:text-red-400 font-semibold">
            This {invoice.type.replace('_', ' ')} has been voided.
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-6 space-y-6">
          <div className="flex justify-between text-sm">
            <div>
              <p className="text-xs text-slate-500 dark:text-zinc-500 mb-1">Bill to</p>
              <p className="font-semibold">{customer?.name}</p>
              {customer?.email && <p className="text-slate-500 dark:text-zinc-400">{customer.email}</p>}
              {customer?.address && <p className="text-slate-500 dark:text-zinc-400 whitespace-pre-line">{customer.address}</p>}
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500 dark:text-zinc-500">Date</p>
              <p>{new Date(invoice.createdAt).toLocaleDateString()}</p>
              {toggles?.showDueDate !== false && invoice.dueDate && (
                <>
                  <p className="text-xs text-slate-500 dark:text-zinc-500 mt-2">Due</p>
                  <p>{new Date(invoice.dueDate).toLocaleDateString()}</p>
                </>
              )}
            </div>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 dark:text-zinc-500 border-b border-slate-200 dark:border-zinc-800">
                <th className="pb-2 font-normal">Description</th>
                <th className="pb-2 font-normal text-right">Qty</th>
                <th className="pb-2 font-normal text-right">Price</th>
                <th className="pb-2 font-normal text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((li, idx) => (
                <tr key={idx} className="border-b border-slate-100 dark:border-zinc-900">
                  <td className="py-2">{li.description}</td>
                  <td className="py-2 text-right">{li.quantity}</td>
                  <td className="py-2 text-right">{money(li.unitPriceCents, invoice.currency)}</td>
                  <td className="py-2 text-right">{money(Math.round(li.quantity * li.unitPriceCents), invoice.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="space-y-1 text-sm max-w-xs ml-auto">
            <div className="flex justify-between"><span className="text-slate-500 dark:text-zinc-400">Subtotal</span><span>{money(totals.subtotalCents, invoice.currency)}</span></div>
            {totals.discountCents > 0 && (
              <div className="flex justify-between"><span className="text-slate-500 dark:text-zinc-400">Discount</span><span>-{money(totals.discountCents, invoice.currency)}</span></div>
            )}
            {totals.taxCents > 0 && (
              <div className="flex justify-between"><span className="text-slate-500 dark:text-zinc-400">{invoice.taxLabel}</span><span>{money(totals.taxCents, invoice.currency)}</span></div>
            )}
            <div className="flex justify-between font-bold text-base pt-1 border-t border-slate-200 dark:border-zinc-800" style={{ color: accent }}><span>Total</span><span>{money(totals.totalCents, invoice.currency)}</span></div>
          </div>

          {toggles?.showNotes !== false && invoice.notes && (
            <div className="text-sm border-t border-slate-200 dark:border-zinc-800 pt-4">
              <p className="text-xs text-slate-500 dark:text-zinc-500 mb-1">Notes</p>
              <p className="whitespace-pre-line">{invoice.notes}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-3 pt-2">
            {canPay && (
              <button
                onClick={handlePay}
                disabled={paying}
                className="px-5 py-2.5 rounded-lg bg-[#635bff] hover:opacity-90 disabled:opacity-50 text-white font-semibold text-sm"
              >
                {paying ? 'Redirecting…' : `Pay now — ${money(totals.totalCents, invoice.currency)}`}
              </button>
            )}
            <a href={`/api/bo-invoice/${token}/pdf`} target="_blank" rel="noreferrer" className="px-5 py-2.5 rounded-lg border border-slate-300 dark:border-zinc-700 text-sm">
              Download PDF
            </a>
          </div>
          {payError && <p className="text-sm text-red-500 dark:text-red-400">{payError}</p>}
        </div>
        <p className="text-center text-xs text-slate-400 mt-6">Powered by Bario One™</p>
      </div>
    </main>
  )
}
