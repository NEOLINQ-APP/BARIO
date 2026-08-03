'use client'

import { useEffect, useState } from 'react'
import ThemeToggle from '@/components/ThemeToggle'
import AdminInvoiceForm, { type InvoiceFormValue } from '@/components/AdminInvoiceForm'
import ShareInvoiceModal from '@/components/ShareInvoiceModal'
import type { Invoice, InvoiceLineItem } from '@/lib/db'

export default function AdminInvoiceDetail({ id }: { id: string }) {
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sharing, setSharing] = useState(false)

  async function load() {
    const res = await fetch(`/api/admin/invoices/${id}`)
    const data = await res.json()
    if (!res.ok) return setError(data.error ?? 'Not found')
    setInvoice(data.invoice)
    setLineItems(data.lineItems)
  }

  useEffect(() => {
    load()
  }, [id])

  async function runAction(path: string) {
    setActionError(null)
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/invoices/${id}${path}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Action failed')
      await load()
    } catch (err: any) {
      setActionError(err.message)
    }
    setBusy(false)
  }

  async function handleDelete() {
    if (!confirm('Delete this quote/invoice? This cannot be undone.')) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/invoices/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Delete failed')
      window.location.href = '/admin/invoices'
    } catch (err: any) {
      setActionError(err.message)
      setBusy(false)
    }
  }

  async function handleSave(value: InvoiceFormValue) {
    const res = await fetch(`/api/admin/invoices/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(value),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Could not save')
    await load()
  }

  if (error) return <p className="p-6 text-sm text-red-500 dark:text-red-400">{error}</p>
  if (!invoice) return <p className="p-6 text-sm text-slate-500 dark:text-zinc-400">Loading…</p>

  const publicUrl = typeof window !== 'undefined' ? `${window.location.origin}/invoice/${invoice.public_token}` : `/invoice/${invoice.public_token}`
  const isPaid = invoice.status === 'paid'

  // Same totals math as lib/invoices.ts's computeTotals, duplicated rather
  // than imported since that file also pulls in pdf-lib/stripe, which
  // aren't safe to bundle into a client component.
  const subtotalCents = lineItems.reduce((sum, li) => sum + Number(li.quantity) * li.unit_price_cents, 0)
  const discountValue = Number(invoice.discount_value)
  const discountCents =
    invoice.discount_type === 'percent' ? Math.round((subtotalCents * discountValue) / 100) : invoice.discount_type === 'fixed' ? Math.round(discountValue) : 0
  const discountedSubtotalCents = Math.max(subtotalCents - discountCents, 0)
  const taxCents = Math.round((discountedSubtotalCents * Number(invoice.tax_percent)) / 100)
  const totalCents = discountedSubtotalCents + taxCents
  const totalDisplay = `${(totalCents / 100).toFixed(2)} ${invoice.currency}`

  return (
    <main className="min-h-screen bg-white dark:bg-[#0b111c] text-slate-900 dark:text-zinc-100 antialiased px-6 py-16">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{invoice.number}</h1>
            <a href="/admin/invoices" className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline">← Back to all</a>
          </div>
          <ThemeToggle />
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-5 space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSharing(true)}
              className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs"
            >
              Share
            </button>
            <a href={`/api/admin/invoices/${id}/pdf`} className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 text-xs">
              Download PDF
            </a>
            {!isPaid && invoice.status !== 'void' && (
              <button onClick={() => runAction('/mark-paid')} disabled={busy} className="px-3 py-1.5 rounded-lg border border-emerald-400 text-emerald-600 dark:text-emerald-400 text-xs disabled:opacity-50">
                Mark as paid
              </button>
            )}
            {!isPaid && (
              <button onClick={handleDelete} disabled={busy} className="px-3 py-1.5 rounded-lg border border-red-400 text-red-500 dark:text-red-400 text-xs disabled:opacity-50">
                Delete
              </button>
            )}
          </div>
          {actionError && <p className="text-xs text-red-500 dark:text-red-400">{actionError}</p>}
          <p className="text-xs text-slate-500 dark:text-zinc-500 break-all">{publicUrl}</p>
        </div>

        {isPaid ? (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">✓ Paid{invoice.paid_at ? ` on ${new Date(invoice.paid_at).toLocaleDateString()}` : ''} — locked from further edits.</p>
        ) : (
          <AdminInvoiceForm
            submitLabel="Save changes"
            onSubmit={handleSave}
            existingNumber={invoice.number}
            initial={{
              type: invoice.type,
              clientName: invoice.client_name,
              clientEmail: invoice.client_email ?? '',
              clientPhone: invoice.client_phone ?? '',
              clientAddress: invoice.client_address ?? '',
              currency: invoice.currency,
              taxPercent: Number(invoice.tax_percent),
              discountType: invoice.discount_type,
              discountValue: Number(invoice.discount_value),
              notes: invoice.notes ?? '',
              dueDate: invoice.due_date ?? '',
              lineItems: lineItems.map((li) => ({ description: li.description, quantity: Number(li.quantity), unitPriceCents: li.unit_price_cents })),
            }}
          />
        )}
      </div>

      {sharing && (
        <ShareInvoiceModal
          invoiceId={id}
          invoiceNumber={invoice.number}
          publicUrl={publicUrl}
          totalDisplay={totalDisplay}
          clientEmail={invoice.client_email}
          clientPhone={invoice.client_phone}
          onSent={() => {
            setSharing(false)
            load()
          }}
          onClose={() => setSharing(false)}
        />
      )}
    </main>
  )
}
