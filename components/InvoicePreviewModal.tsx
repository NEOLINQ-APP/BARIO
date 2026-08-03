'use client'

type LineItem = { description: string; quantity: number; unitPriceCents: number }

function money(cents: number, currency: string) {
  return `${(cents / 100).toFixed(2)} ${currency}`
}

export default function InvoicePreviewModal({
  type,
  number,
  clientName,
  clientEmail,
  clientAddress,
  currency,
  dueDate,
  notes,
  lineItems,
  subtotalCents,
  discountCents,
  taxCents,
  totalCents,
  onClose,
}: {
  type: 'invoice' | 'quote'
  number?: string
  clientName: string
  clientEmail: string
  clientAddress: string
  currency: string
  dueDate: string
  notes: string
  lineItems: LineItem[]
  subtotalCents: number
  discountCents: number
  taxCents: number
  totalCents: number
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-6" onClick={onClose}>
      <div
        className="bg-white dark:bg-[#0b111c] text-slate-900 dark:text-zinc-100 rounded-2xl max-w-xl w-full my-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-zinc-800">
          <p className="text-sm font-semibold text-slate-500 dark:text-zinc-400">Preview — this is what the client will see</p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 text-lg leading-none">✕</button>
        </div>

        <div className="p-6">
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
              <p className="text-lg font-bold uppercase">{type}</p>
              <p className="text-sm text-slate-500 dark:text-zinc-500">{number ?? 'DRAFT — not yet created'}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-6 space-y-6">
            <div className="flex justify-between text-sm">
              <div>
                <p className="text-xs text-slate-500 dark:text-zinc-500 mb-1">Bill to</p>
                <p className="font-semibold">{clientName || '—'}</p>
                {clientEmail && <p className="text-slate-500 dark:text-zinc-400">{clientEmail}</p>}
                {clientAddress && <p className="text-slate-500 dark:text-zinc-400 whitespace-pre-line">{clientAddress}</p>}
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500 dark:text-zinc-500">Date</p>
                <p>{new Date().toLocaleDateString()}</p>
                {dueDate && (
                  <>
                    <p className="text-xs text-slate-500 dark:text-zinc-500 mt-2">Due</p>
                    <p>{new Date(dueDate).toLocaleDateString()}</p>
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
                    <td className="py-2">{li.description || '—'}</td>
                    <td className="py-2 text-right">{li.quantity}</td>
                    <td className="py-2 text-right">{money(li.unitPriceCents, currency)}</td>
                    <td className="py-2 text-right">{money(Math.round(li.quantity * li.unitPriceCents), currency)}</td>
                  </tr>
                ))}
                {lineItems.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-slate-500 dark:text-zinc-500">No line items yet</td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="space-y-1 text-sm max-w-xs ml-auto">
              <div className="flex justify-between"><span className="text-slate-500 dark:text-zinc-400">Subtotal</span><span>{money(subtotalCents, currency)}</span></div>
              {discountCents > 0 && (
                <div className="flex justify-between"><span className="text-slate-500 dark:text-zinc-400">Discount</span><span>-{money(discountCents, currency)}</span></div>
              )}
              {taxCents > 0 && (
                <div className="flex justify-between"><span className="text-slate-500 dark:text-zinc-400">Tax</span><span>{money(taxCents, currency)}</span></div>
              )}
              <div className="flex justify-between font-bold text-base pt-1 border-t border-slate-200 dark:border-zinc-800"><span>Total</span><span>{money(totalCents, currency)}</span></div>
            </div>

            {notes && (
              <div className="text-sm border-t border-slate-200 dark:border-zinc-800 pt-4">
                <p className="text-xs text-slate-500 dark:text-zinc-500 mb-1">Notes</p>
                <p className="whitespace-pre-line">{notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
