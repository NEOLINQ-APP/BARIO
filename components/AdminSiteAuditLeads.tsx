'use client'

import { useEffect, useState } from 'react'

type RecommendedService = { service: string; reason: string }

type LeadRow = {
  id: string
  url: string
  status: string
  credits_charged: number
  created_at: string
  unlocked: boolean
  score: number | null
  opportunity_score: number | null
  recommended_services: RecommendedService[] | null
  user_id: string
  email: string
  plan: string | null
  email_verified: boolean
  is_admin: boolean
  user_created_at: string
}

const SERVICE_LABEL: Record<string, string> = {
  ai_website_builder: 'AI Website Builder',
  wordpress_hosting: 'WordPress Hosting',
  vps_hosting: 'VPS Hosting',
  bario_one_crm: 'Bario One CRM',
  domain_registration: 'Domain Registration',
  email_hosting: 'Email Hosting',
  voice_ai_receptionist: 'Voice AI Receptionist',
}

type Summary = { unique_leads: number; total_audits: number; unlocked_count: number }

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function AdminSiteAuditLeads() {
  const [leads, setLeads] = useState<LeadRow[] | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [sortByOpportunity, setSortByOpportunity] = useState(false)

  useEffect(() => {
    fetch(`/api/admin/site-audit-leads?page=${page}${sortByOpportunity ? '&sort=opportunity' : ''}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) {
          setLeads(data.leads)
          setSummary(data.summary)
          setTotal(data.total)
        }
      })
  }, [page, sortByOpportunity])

  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-4">
          <div className="text-2xl font-bold">{summary?.unique_leads ?? '—'}</div>
          <div className="text-xs text-slate-500 dark:text-zinc-400 mt-1">Unique leads captured</div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-4">
          <div className="text-2xl font-bold">{summary?.total_audits ?? '—'}</div>
          <div className="text-xs text-slate-500 dark:text-zinc-400 mt-1">Total audits run</div>
        </div>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="text-2xl font-bold text-amber-600 dark:text-[#d4af37]">{summary?.unlocked_count ?? '—'}</div>
          <div className="text-xs text-slate-500 dark:text-zinc-400 mt-1">Unlocked the deep report — hottest prospects</div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 dark:text-zinc-400">
          Every free account created through the site-audit funnel is a real business owner who cared enough to hand
          over an email and the URL they want fixed — work this list.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setSortByOpportunity((v) => !v)}
            className={`text-xs rounded-lg border px-3 py-1.5 whitespace-nowrap ${
              sortByOpportunity
                ? 'border-amber-500 dark:border-[#d4af37] bg-amber-500/10 text-amber-700 dark:text-[#d4af37]'
                : 'border-slate-300 dark:border-zinc-700'
            }`}
          >
            {sortByOpportunity ? '✓ ' : ''}Sort by opportunity
          </button>
          <a
            href="/api/admin/site-audit-leads/export"
            className="text-xs rounded-lg border border-slate-300 dark:border-zinc-700 px-3 py-1.5 hover:border-amber-500 dark:hover:border-[#d4af37] whitespace-nowrap"
          >
            Export CSV
          </a>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-[#131b2a] text-left text-xs text-slate-500 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Site audited</th>
              <th className="px-4 py-2 font-medium">Score</th>
              <th className="px-4 py-2 font-medium">Opportunity</th>
              <th className="px-4 py-2 font-medium">Deep report</th>
              <th className="px-4 py-2 font-medium">Plan</th>
              <th className="px-4 py-2 font-medium">Verified</th>
              <th className="px-4 py-2 font-medium">When</th>
            </tr>
          </thead>
          <tbody>
            {leads === null && (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-500 dark:text-zinc-400">Loading…</td></tr>
            )}
            {leads?.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-500 dark:text-zinc-400">No audits yet.</td></tr>
            )}
            {leads?.map((lead) => (
              <tr key={lead.id} className="border-t border-slate-200 dark:border-zinc-800">
                <td className="px-4 py-2">
                  <a href={`mailto:${lead.email}`} className="text-amber-600 dark:text-[#d4af37] hover:underline">
                    {lead.email}
                  </a>
                  {lead.is_admin && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400">admin</span>}
                </td>
                <td className="px-4 py-2 max-w-[220px] truncate">
                  <a href={lead.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{lead.url}</a>
                </td>
                <td className="px-4 py-2">
                  {lead.score === null
                    ? <span className="text-slate-400 dark:text-zinc-500">—</span>
                    : <span className={lead.score < 60 ? 'text-red-500 font-semibold' : lead.score < 80 ? 'text-amber-500 font-semibold' : 'text-emerald-500 font-semibold'}>{lead.score}/100</span>}
                </td>
                <td className="px-4 py-2">
                  {lead.opportunity_score === null ? (
                    <span className="text-slate-400 dark:text-zinc-500">—</span>
                  ) : (
                    <div>
                      <span
                        className={
                          lead.opportunity_score >= 70
                            ? 'text-emerald-500 font-semibold'
                            : lead.opportunity_score >= 40
                              ? 'text-amber-500 font-semibold'
                              : 'text-slate-400 dark:text-zinc-500'
                        }
                      >
                        {lead.opportunity_score}/100
                      </span>
                      {lead.recommended_services && lead.recommended_services.length > 0 && (
                        <div className="text-[10px] text-slate-500 dark:text-zinc-400 mt-0.5" title={lead.recommended_services.map((s) => s.reason).join(' · ')}>
                          {lead.recommended_services.map((s) => SERVICE_LABEL[s.service] ?? s.service).join(', ')}
                        </div>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2">
                  {lead.unlocked
                    ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/30">Unlocked</span>
                    : <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-200 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400">Free only</span>}
                </td>
                <td className="px-4 py-2 text-slate-500 dark:text-zinc-400">{lead.plan ?? 'free'}</td>
                <td className="px-4 py-2">
                  {lead.email_verified
                    ? <span className="text-emerald-500">✓</span>
                    : <span className="text-slate-400 dark:text-zinc-500">unverified</span>}
                </td>
                <td className="px-4 py-2 text-slate-500 dark:text-zinc-400 whitespace-nowrap">{timeAgo(lead.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > 100 && (
        <div className="flex items-center gap-3 text-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="text-slate-500 dark:text-zinc-400">Page {page} of {Math.ceil(total / 100)}</span>
          <button
            type="button"
            disabled={page * 100 >= total}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}
