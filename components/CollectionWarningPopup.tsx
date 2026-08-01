'use client'

import { useState } from 'react'

// Strike 2 of the payment-collection escalation (see
// app/api/admin/users/collection-status) — shown whenever any of the
// account's sites is in 'warning_shown' status. Dismissing only hides it for
// this page view; it reappears on the next visit until an admin clears the
// status, which is the point — a real block only an admin resolving the
// underlying issue removes for good.
export default function CollectionWarningPopup({ siteNames }: { siteNames: string[] }) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed || siteNames.length === 0) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="max-w-sm w-full rounded-2xl bg-white dark:bg-[#131b2a] border border-slate-300 dark:border-zinc-700 p-6 shadow-xl">
        <h2 className="text-lg font-semibold">Action needed on your account</h2>
        <p className="text-sm text-slate-600 dark:text-zinc-300 mt-2">
          Please contact <a href="mailto:support@bario.ca" className="text-amber-600 dark:text-[#f59e0b] underline">support@bario.ca</a> regarding access to{' '}
          {siteNames.length === 1 ? `your site "${siteNames[0]}"` : `your sites (${siteNames.join(', ')})`}.
        </p>
        <button
          onClick={() => setDismissed(true)}
          className="mt-5 w-full rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 text-sm font-medium py-2"
        >
          Dismiss for now
        </button>
      </div>
    </div>
  )
}
