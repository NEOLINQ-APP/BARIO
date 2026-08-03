'use client'

import { useEffect, useState } from 'react'

type LineItem = { description: string; quantity: number; unitPriceCents: number }
type InvoiceData = {
  type: 'invoice' | 'quote'
  number: string
  status: string
  clientName: string
  clientEmail: string | null
  clientAddress: string | null
  currency: string
  notes: string | null
  dueDate: string | null
  createdAt: string
  taxPercent: number
  discountType: 'none' | 'percent' | 'fixed'
  discountValue: number
}
type Totals = { subtotalCents: number; discountCents: number; taxCents: number; totalCents: number }

function money(cents: number, currency: string) {
  return `${(cents / 100).toFixed(2)} ${currency}`
}

export default function PublicInvoice({ token }: { token: string }) {
  const [invoice, setInvoice] = useState<InvoiceData | null>(null)
  const [lineItems, setLineItems] = useState<LineItem[]>([])
  const [totals, setTotals] = useState<Totals | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/invoices/${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error ?? 'Not found')
        setInvoice(data.invoice)
        setLineItems(data.lineItems)
        setTotals(data.totals)
      })
      .catch((err) => setError(err.message))
  }, [token])

  async function handlePay() {
    setPaying(true)
    setPayError(null)
    try {
      const res = await fetch(`/api/invoices/${token}/pay`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not start payment')
      window.location.href = data.url
    } catch (err: any) {
      setPayError(err.message)
      setPaying(false)
    }
  }

  if (error) return <main className="min-h-screen flex items-center justify-center text-sm text-red-500">{error}</main>
  if (!invoice || !totals) return <main className="min-h-screen flex items-center justify-center text-sm text-slate-500">Loading…</main>

  const canPay = invoice.type === 'invoice' && invoice.status !== 'paid' && invoice.status !== 'void'

  return (
    <main className="min-h-screen bg-white dark:bg-[#0b111c] text-slate-900 dark:text-zinc-100 antialiased px-6 py-16">
      <div className="max-w-xl mx-auto">
        <div className="flex items-start justify-between mb-8">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/bario-icon-64.png" alt="Bario" className="h-8 w-8" />
            <div>
              <p className="font-extrabold text-lg leading-tight">bario<span className="text-cyan-500">.ca</span></p>
              <p className="text-xs text-slate-500 dark:text-zinc-500">bario.ca</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold uppercase">{invoice.type}</p>
            <p className="text-sm text-slate-500 dark:text-zinc-500">{invoice.number}</p>
          </div>
        </div>

        {invoice.status === 'paid' && (
          <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-600 dark:text-emerald-400 font-semibold">
            ✓ Paid — thank you!
          </div>
        )}
        {invoice.status === 'void' && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-500 dark:text-red-400 font-semibold">
            This {invoice.type} has been voided.
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-6 space-y-6">
          <div className="flex justify-between text-sm">
            <div>
              <p className="text-xs text-slate-500 dark:text-zinc-500 mb-1">Bill to</p>
              <p className="font-semibold">{invoice.clientName}</p>
              {invoice.clientEmail && <p className="text-slate-500 dark:text-zinc-400">{invoice.clientEmail}</p>}
              {invoice.clientAddress && <p className="text-slate-500 dark:text-zinc-400 whitespace-pre-line">{invoice.clientAddress}</p>}
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500 dark:text-zinc-500">Date</p>
              <p>{new Date(invoice.createdAt).toLocaleDateString()}</p>
              {invoice.dueDate && (
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
              {lineItems.map((li, idx) => (
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
              <div className="flex justify-between"><span className="text-slate-500 dark:text-zinc-400">Tax</span><span>{money(totals.taxCents, invoice.currency)}</span></div>
            )}
            <div className="flex justify-between font-bold text-base pt-1 border-t border-slate-200 dark:border-zinc-800"><span>Total</span><span>{money(totals.totalCents, invoice.currency)}</span></div>
          </div>

          {invoice.notes && (
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
                className="px-5 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-semibold text-sm"
              >
                {paying ? 'Redirecting…' : `Pay now — ${money(totals.totalCents, invoice.currency)}`}
              </button>
            )}
            <a href={`/api/invoices/${token}/pdf`} target="_blank" rel="noreferrer" className="px-5 py-2.5 rounded-lg border border-slate-300 dark:border-zinc-700 text-sm">
              Download PDF
            </a>
          </div>
          {payError && <p className="text-sm text-red-500 dark:text-red-400">{payError}</p>}
        </div>
      </div>
    </main>
  )
}
