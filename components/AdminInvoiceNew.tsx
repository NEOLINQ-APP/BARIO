'use client'

import { useRouter } from 'next/navigation'
import ThemeToggle from '@/components/ThemeToggle'
import AdminInvoiceForm, { type InvoiceFormValue } from '@/components/AdminInvoiceForm'

export default function AdminInvoiceNew() {
  const router = useRouter()

  async function handleSubmit(value: InvoiceFormValue) {
    const res = await fetch('/api/admin/invoices', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(value),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Could not create')
    router.push(`/admin/invoices/${data.id}`)
  }

  return (
    <main className="min-h-screen bg-white dark:bg-[#0b111c] text-slate-900 dark:text-zinc-100 antialiased px-6 py-16">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">New quote/invoice</h1>
            <a href="/admin/invoices" className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline">← Back to all</a>
          </div>
          <ThemeToggle />
        </div>
        <AdminInvoiceForm submitLabel="Create" onSubmit={handleSubmit} />
      </div>
    </main>
  )
}
