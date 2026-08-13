'use client'

import { useEffect, useState } from 'react'

type Findings = {
  url: string
  isWordPress: boolean
  pluginsDetected: string[]
  pagesFound: number
  pagesFoundIsExact: boolean
  seo: {
    title: { present: boolean; length: number; text: string; issue: string | null }
    metaDescription: { present: boolean; length: number; text: string; issue: string | null }
    h1: { count: number; text: string[]; issue: string | null }
    headingOrderIssues: boolean
    altText: { totalImages: number; missingAlt: number; coveragePct: number }
    viewportPresent: boolean
    https: boolean
    canonicalPresent: boolean
    openGraphPresent: boolean
    sitemapPresent: boolean
    robotsTxtPresent: boolean
    isBarioHosted: boolean
  }
  performance: {
    homepageLoadMs: number
    totalPageSizeBytes: number
    imageCount: number
    inlineStyleOrScriptBytes: number
  }
}

type Issue = { severity: 'critical' | 'warning' | 'info'; category: string; title: string; finding: string; why: string; fix: string }
type Report = { summary: string; score: number; issues: Issue[]; quickWins: string[] }

const SEVERITY_STYLE: Record<string, string> = {
  critical: 'border-red-400 bg-red-50 dark:bg-red-500/5 dark:border-red-500/40',
  warning: 'border-amber-400 bg-amber-50 dark:bg-amber-500/5 dark:border-amber-500/40',
  info: 'border-slate-300 bg-slate-50 dark:bg-slate-800/40 dark:border-slate-700',
}
const SEVERITY_LABEL: Record<string, string> = { critical: '🔴 Critical', warning: '🟡 Warning', info: '🔵 Info' }

function CheckRow({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <div>
        <span className={`text-sm font-medium ${ok ? 'text-slate-900 dark:text-white' : 'text-slate-900 dark:text-white'}`}>{label}</span>
        {detail && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{detail}</p>}
      </div>
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${ok ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400'}`}>
        {ok ? 'Pass' : 'Needs work'}
      </span>
    </div>
  )
}

export default function SiteAudit({ initialCredits, deepAuditCost }: { initialCredits: number; deepAuditCost: number }) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [auditId, setAuditId] = useState<string | null>(null)
  const [findings, setFindings] = useState<Findings | null>(null)

  const [deepBusy, setDeepBusy] = useState(false)
  const [deepError, setDeepError] = useState<string | null>(null)
  const [report, setReport] = useState<Report | null>(null)

  const [credits, setCredits] = useState(initialCredits)
  const unlimitedCredits = credits === -1
  const canAffordDeep = unlimitedCredits || credits >= deepAuditCost

  async function handleAudit(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim() || busy) return
    setBusy(true)
    setError(null)
    setFindings(null)
    setReport(null)
    setAuditId(null)
    try {
      const res = await fetch('/api/site-audit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Audit failed')
      setFindings(data.findings)
      setAuditId(data.auditId)
    } catch (err: any) {
      setError(err.message)
    }
    setBusy(false)
  }

  async function handleUnlock() {
    if (!auditId || deepBusy) return
    setDeepBusy(true)
    setDeepError(null)
    try {
      const res = await fetch('/api/site-audit/deep', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ auditId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not generate the report')
      setReport(data.report)
      if (typeof data.creditsRemaining === 'number' && data.creditsRemaining !== -1) setCredits(data.creditsRemaining)
    } catch (err: any) {
      setDeepError(err.message)
    }
    setDeepBusy(false)
  }

  const s = findings?.seo

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-end mb-3">
        <span className={`text-xs px-2 py-1 rounded-full border ${!unlimitedCredits && credits <= deepAuditCost ? 'border-red-400 text-red-600 dark:border-red-500/40 dark:text-red-400' : 'border-slate-300 text-slate-500 dark:border-zinc-700 dark:text-zinc-400'}`}>
          {unlimitedCredits ? '∞ credits (admin)' : `${credits} credit${credits === 1 ? '' : 's'} left`}
        </span>
      </div>

      <form onSubmit={handleAudit} className="flex flex-col sm:flex-row items-center gap-3">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="yourwebsite.com"
          disabled={busy}
          className="w-full sm:flex-1 px-4 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 outline-none focus:border-cyan-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || !url.trim()}
          className="w-full sm:w-auto px-6 py-3 rounded-xl font-semibold bg-cyan-500 text-slate-950 disabled:opacity-50 whitespace-nowrap"
        >
          {busy ? 'Auditing…' : 'Run Audit'}
        </button>
      </form>

      {busy && <p className="text-sm text-slate-500 mt-3 text-center">Crawling your site — this can take up to 30 seconds.</p>}
      {error && <p className="text-sm text-red-500 dark:text-red-400 mt-3 text-center">{error}</p>}

      {findings && s && (
        <div className="mt-8 space-y-6">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-6">
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Platform</div>
                <div className="font-semibold text-slate-900 dark:text-white">{findings.isWordPress ? 'WordPress' : 'Not WordPress'}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Pages found</div>
                <div className="font-semibold text-slate-900 dark:text-white">{findings.pagesFoundIsExact ? findings.pagesFound : `${findings.pagesFound}+`}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Homepage load time</div>
                <div className="font-semibold text-slate-900 dark:text-white">{(findings.performance.homepageLoadMs / 1000).toFixed(2)}s</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Image alt-text coverage</div>
                <div className="font-semibold text-slate-900 dark:text-white">{s.altText.coveragePct}% ({s.altText.totalImages - s.altText.missingAlt}/{s.altText.totalImages})</div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
              <p className="text-xs uppercase tracking-wide text-slate-500 mb-1 mt-3">SEO &amp; technical checks</p>
              <CheckRow ok={s.title.present && !s.title.issue} label="Title tag" detail={s.title.present ? `"${s.title.text}" (${s.title.length} chars)` : 'Missing'} />
              <CheckRow ok={s.metaDescription.present && !s.metaDescription.issue} label="Meta description" detail={s.metaDescription.present ? `${s.metaDescription.length} chars` : 'Missing'} />
              <CheckRow ok={!s.h1.issue} label="Heading structure (H1)" detail={s.h1.issue === 'missing' ? 'No H1 found' : s.h1.issue === 'multiple' ? `${s.h1.count} H1s found (should be 1)` : s.h1.text[0]} />
              <CheckRow ok={!s.headingOrderIssues} label="Heading order" detail={s.headingOrderIssues ? 'A heading level is skipped (e.g. H1 → H3 with no H2)' : undefined} />
              <CheckRow ok={s.viewportPresent} label="Mobile viewport tag" />
              <CheckRow ok={s.https} label="HTTPS" />
              <CheckRow ok={s.canonicalPresent} label="Canonical tag" />
              <CheckRow ok={s.openGraphPresent} label="Open Graph / social share tags" />
              <CheckRow ok={s.sitemapPresent} label="sitemap.xml" detail={!s.sitemapPresent && s.isBarioHosted ? 'Not yet auto-generated for Bario-hosted sites' : undefined} />
              <CheckRow ok={s.robotsTxtPresent} label="robots.txt" detail={!s.robotsTxtPresent && s.isBarioHosted ? 'Not yet auto-generated for Bario-hosted sites' : undefined} />
            </div>

            {findings.pluginsDetected.length > 0 && (
              <div className="pt-3 mt-3 border-t border-slate-200 dark:border-slate-800">
                <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">Plugins detected ({findings.pluginsDetected.length})</p>
                <div className="flex flex-wrap gap-2">
                  {findings.pluginsDetected.map((p) => (
                    <span key={p} className="text-xs px-2.5 py-1 rounded-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300">{p}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {!report && (
            <div className="relative rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 overflow-hidden">
              <div aria-hidden className="space-y-3 blur-sm select-none pointer-events-none opacity-60">
                <div className="h-4 w-3/4 rounded bg-slate-200 dark:bg-slate-700" />
                <div className="h-3 w-full rounded bg-slate-200 dark:bg-slate-700" />
                <div className="h-3 w-5/6 rounded bg-slate-200 dark:bg-slate-700" />
                <div className="h-16 w-full rounded bg-slate-200 dark:bg-slate-700" />
              </div>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 bg-white/85 dark:bg-slate-900/85">
                <p className="font-semibold text-slate-900 dark:text-white mb-1">Get the full AI-powered report</p>
                <p className="text-sm text-slate-600 dark:text-slate-400 max-w-sm mb-4">
                  A prioritized action plan, specific rewrite suggestions, and a full breakdown — grounded in your real
                  content, not generic advice. This is the analysis a generic chatbot can't produce, because it can't
                  crawl your site itself.
                </p>
                {deepError && <p className="text-sm text-red-500 dark:text-red-400 mb-3">{deepError}</p>}
                {canAffordDeep ? (
                  <button
                    onClick={handleUnlock}
                    disabled={deepBusy}
                    className="px-5 py-2.5 rounded-xl font-semibold bg-cyan-500 text-slate-950 disabled:opacity-50"
                  >
                    {deepBusy ? 'Generating…' : `Unlock Full Report — ${deepAuditCost} credits`}
                  </button>
                ) : (
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Out of credits for this billing period. <a href="/#pricing" className="underline">Upgrade your plan</a> for more.
                  </p>
                )}
              </div>
            </div>
          )}

          {report && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Site health score</p>
                  <p className="text-4xl font-extrabold text-slate-900 dark:text-white">{report.score}<span className="text-lg text-slate-400">/100</span></p>
                </div>
              </div>
              <p className="text-slate-700 dark:text-slate-300">{report.summary}</p>

              {report.quickWins.length > 0 && (
                <div className="rounded-xl bg-cyan-50 dark:bg-cyan-500/5 border border-cyan-200 dark:border-cyan-500/20 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-400 mb-2">Quick wins</p>
                  <ul className="space-y-1 text-sm text-slate-700 dark:text-slate-300 list-disc list-inside">
                    {report.quickWins.map((q, i) => <li key={i}>{q}</li>)}
                  </ul>
                </div>
              )}

              <div className="space-y-3">
                {report.issues.map((issue, i) => (
                  <div key={i} className={`rounded-xl border p-4 ${SEVERITY_STYLE[issue.severity]}`}>
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <span className="text-xs font-semibold">{SEVERITY_LABEL[issue.severity]}</span>
                      <span className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{issue.category}</span>
                    </div>
                    <p className="font-semibold text-slate-900 dark:text-white text-sm mb-1">{issue.title}</p>
                    <p className="text-sm text-slate-700 dark:text-slate-300 mb-1">{issue.finding}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">{issue.why}</p>
                    <p className="text-xs font-medium text-slate-900 dark:text-white bg-white/60 dark:bg-black/20 rounded-lg px-3 py-2">Fix: {issue.fix}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
