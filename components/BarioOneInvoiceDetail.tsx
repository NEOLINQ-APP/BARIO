'use client'

import { useEffect, useState } from 'react'

type Data = {
  invoice: {
    id: string
    type: 'estimate' | 'quote' | 'invoice' | 'work_order'
    number: string
    status: string
    currency: string
    public_token: string
    due_date: string | null
    converted_to_invoice_id: string | null
  }
  items: { description: string; quantity: number; unit_price_cents: number }[]
  customer: { contact_name: string; company_name: string | null; email: string | null } | null
  totals: { subtotalCents: number; discountCents: number; taxCents: number; totalCents: number }
} | null

function money(cents: number, currency: string) {
  return `${(cents / 100).toFixed(2)} ${currency}`
}

export default function BarioOneInvoiceDetail({ invoiceId }: { invoiceId: string }) {
  const [data, setData] = useState<Data>(undefined as any)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  async function load() {
    const res = await fetch(`/api/bario-one/crm/invoices/${invoiceId}`)
    if (!res.ok) {
      setData(null)
      return
    }
    setData(await res.json())
  }

  useEffect(() => {
    load()
  }, [invoiceId])

  async function runAction(path: string, label: string) {
    setBusy(true)
    setNotice(null)
    try {
      const res = await fetch(path, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Something went wrong')
      setNotice(label)
      await load()
    } catch (err: any) {
      setNotice(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleConvert() {
    setBusy(true)
    setNotice(null)
    try {
      const res = await fetch(`/api/bario-one/crm/invoices/${invoiceId}/convert`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Something went wrong')
      window.location.href = `/dashboard/bario-one/crm/invoices/${json.id}`
    } catch (err: any) {
      setNotice(err.message)
      setBusy(false)
    }
  }

  if (data === undefined) return <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>
  if (!data) return <p className="text-sm text-red-500 dark:text-red-400">Not found.</p>

  const { invoice, items, customer, totals } = data
  const publicUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/bo-invoice/${invoice.public_token}`

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">{invoice.number}</h2>
          <p className="text-sm text-slate-500 dark:text-zinc-400 capitalize">{invoice.type} — {invoice.status}</p>
        </div>
        <span className="text-lg font-bold">{money(totals.totalCents, invoice.currency)}</span>
      </div>

      <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4">
        <p className="text-sm text-slate-500 dark:text-zinc-400 mb-2">Bill to: {customer?.company_name || customer?.contact_name}</p>
        <table className="w-full text-sm">
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-b border-slate-100 dark:border-zinc-900">
                <td className="py-1">{it.description}</td>
                <td className="py-1 text-right">{it.quantity}</td>
                <td className="py-1 text-right">{money(it.unit_price_cents, invoice.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 space-y-1 text-sm max-w-xs ml-auto">
          <div className="flex justify-between"><span className="text-slate-500 dark:text-zinc-400">Subtotal</span><span>{money(totals.subtotalCents, invoice.currency)}</span></div>
          {totals.discountCents > 0 && <div className="flex justify-between"><span className="text-slate-500 dark:text-zinc-400">Discount</span><span>-{money(totals.discountCents, invoice.currency)}</span></div>}
          {totals.taxCents > 0 && <div className="flex justify-between"><span className="text-slate-500 dark:text-zinc-400">Tax</span><span>{money(totals.taxCents, invoice.currency)}</span></div>}
          <div className="flex justify-between font-bold border-t border-slate-200 dark:border-zinc-800 pt-1"><span>Total</span><span>{money(totals.totalCents, invoice.currency)}</span></div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(invoice.type === 'estimate' || invoice.type === 'quote') && !invoice.converted_to_invoice_id && invoice.status !== 'void' && (
          <button disabled={busy} onClick={handleConvert} className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2">
            Convert to invoice
          </button>
        )}
        {invoice.converted_to_invoice_id && (
          <a href={`/dashboard/bario-one/crm/invoices/${invoice.converted_to_invoice_id}`} className="rounded-lg border border-emerald-500/40 text-emerald-600 dark:text-emerald-400 text-sm font-medium px-4 py-2">
            View converted invoice →
          </a>
        )}
        {invoice.status === 'draft' && (
          <button disabled={busy} onClick={() => runAction(`/api/bario-one/crm/invoices/${invoiceId}/send`, 'Sent to customer')} className="rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2">
            Send to customer
          </button>
        )}
        {invoice.type === 'invoice' && invoice.status !== 'paid' && invoice.status !== 'void' && (
          <button disabled={busy} onClick={() => runAction(`/api/bario-one/crm/invoices/${invoiceId}/mark-paid`, 'Marked as paid')} className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2">
            Mark as paid
          </button>
        )}
        {invoice.status !== 'void' && (
          <button disabled={busy} onClick={() => runAction(`/api/bario-one/crm/invoices/${invoiceId}/void`, 'Voided')} className="rounded-lg bg-slate-200 dark:bg-zinc-800 disabled:opacity-50 text-sm font-medium px-4 py-2">
            Void
          </button>
        )}
        <a href={`/api/bario-one/crm/invoices/${invoiceId}/pdf`} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-300 dark:border-zinc-700 text-sm font-medium px-4 py-2">
          Download PDF
        </a>
        <a href={publicUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-300 dark:border-zinc-700 text-sm font-medium px-4 py-2">
          Customer view →
        </a>
      </div>
      {notice && <p className="text-xs text-slate-500 dark:text-zinc-400">{notice}</p>}
    </div>
  )
}
