'use client'

import { useEffect, useState } from 'react'

type QuickLink = {
  id: string
  label: string
  url: string
}

export default function QuickLinks() {
  const [links, setLinks] = useState<QuickLink[] | null>(null)

  useEffect(() => {
    fetch('/api/dashboard/quick-links')
      .then((res) => res.json())
      .then((data) => setLinks(data.links || []))
      .catch(() => setLinks([]))
  }, [])

  if (!links || links.length === 0) return null

  return (
    <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] shadow-sm dark:shadow-none p-6 mb-8">
      <h2 className="font-bold text-lg mb-1">Quick access</h2>
      <p className="text-sm text-slate-500 dark:text-zinc-400 mb-4">One-click links to your other tools.</p>
      <div className="flex flex-wrap gap-3">
        {links.map((link) => (
          <a
            key={link.id}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold px-4 py-2"
          >
            {link.label} ↗
          </a>
        ))}
      </div>
    </div>
  )
}
