'use client'

import { useState } from 'react'

export default function StaffTd1Form({ token, staffName, province }: { token: string; staffName: string; province: string }) {
  const [federalFile, setFederalFile] = useState<File | null>(null)
  const [provincialFile, setProvincialFile] = useState<File | null>(null)
  const [federalTotal, setFederalTotal] = useState('')
  const [provincialTotal, setProvincialTotal] = useState('')
  const [signatureName, setSignatureName] = useState('')
  const [certified, setCertified] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!federalFile || !provincialFile) {
      setError('Please upload both completed and signed PDFs.')
      return
    }
    if (!signatureName.trim() || !certified) {
      setError('Please type your full legal name and check the certification box.')
      return
    }

    setSubmitting(true)
    try {
      const form = new FormData()
      form.append('federalPdf', federalFile)
      form.append('provincialPdf', provincialFile)
      form.append('federalTotalClaimDollars', federalTotal)
      form.append('provincialTotalClaimDollars', provincialTotal)
      form.append('signatureName', signatureName.trim())

      const res = await fetch(`/api/staff-td1/${token}/submit`, { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong submitting your forms')
      setDone(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white dark:bg-[#0b111c] text-slate-900 dark:text-zinc-100 px-6 text-center">
        <div>
          <p className="text-2xl mb-2">✅</p>
          <p className="font-semibold">Thanks, {staffName || 'you'}!</p>
          <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">Your tax forms have been received and are on file.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-white dark:bg-[#0b111c] text-slate-900 dark:text-zinc-100 px-6 py-16">
      <div className="max-w-xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Your tax forms (TD1)</h1>
          <p className="text-sm text-slate-500 dark:text-zinc-400 mt-2">
            Canadian payroll law requires a completed and signed federal and {province} Personal Tax Credits Return (TD1) on file
            before your first paycheque. This takes about 5 minutes.
          </p>
        </div>

        <ol className="space-y-4 text-sm">
          <li className="rounded-2xl border border-slate-200 dark:border-zinc-800 p-4">
            <p className="font-semibold mb-1">1. Download both forms</p>
            <p className="text-slate-500 dark:text-zinc-400 mb-3">Open each in a PDF reader (Adobe Reader or your browser's built-in viewer works fine), fill in your information, and save your typed signature and date on page 2.</p>
            <div className="flex flex-col gap-2">
              <a href="/td1/TD1-federal-2026.pdf" target="_blank" rel="noopener noreferrer" className="text-cyan-600 dark:text-cyan-400 hover:underline">📄 Federal TD1 (2026) →</a>
              <a href="/td1/TD1AB-alberta-2026.pdf" target="_blank" rel="noopener noreferrer" className="text-cyan-600 dark:text-cyan-400 hover:underline">📄 Alberta TD1AB (2026) →</a>
            </div>
          </li>
          <li className="rounded-2xl border border-slate-200 dark:border-zinc-800 p-4">
            <p className="font-semibold mb-1">2. Upload your completed, signed copies</p>
            <form onSubmit={submit} className="space-y-4 mt-3">
              <div>
                <label className="block text-xs text-slate-500 dark:text-zinc-400 mb-1">Signed federal TD1 (PDF)</label>
                <input required type="file" accept="application/pdf" onChange={(e) => setFederalFile(e.target.files?.[0] ?? null)} className="w-full text-sm" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-zinc-400 mb-1">Federal Total Claim Amount (Line 13, bottom of page 1)</label>
                <input required type="number" step="0.01" min="0" placeholder="$" value={federalTotal} onChange={(e) => setFederalTotal(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-zinc-400 mb-1">Signed Alberta TD1AB (PDF)</label>
                <input required type="file" accept="application/pdf" onChange={(e) => setProvincialFile(e.target.files?.[0] ?? null)} className="w-full text-sm" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-zinc-400 mb-1">Alberta Total Claim Amount (Line 11, bottom of page 1)</label>
                <input required type="number" step="0.01" min="0" placeholder="$" value={provincialTotal} onChange={(e) => setProvincialTotal(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm" />
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-zinc-800">
                <label className="block text-xs text-slate-500 dark:text-zinc-400 mb-1">Type your full legal name to sign this submission</label>
                <input required value={signatureName} onChange={(e) => setSignatureName(e.target.value)} placeholder="Full legal name" className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm" />
                <label className="flex items-start gap-2 mt-3 text-xs text-slate-500 dark:text-zinc-400">
                  <input type="checkbox" checked={certified} onChange={(e) => setCertified(e.target.checked)} className="mt-0.5" />
                  I certify that the attached forms and the amounts above are accurate, and that typing my name above constitutes my electronic signature on this submission.
                </label>
              </div>

              {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
              <button type="submit" disabled={submitting} className="w-full px-4 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-semibold text-sm">
                {submitting ? 'Submitting…' : 'Submit my tax forms'}
              </button>
            </form>
          </li>
        </ol>
      </div>
    </main>
  )
}
