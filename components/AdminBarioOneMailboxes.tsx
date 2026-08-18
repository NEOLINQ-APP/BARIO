'use client'

import { useEffect, useState } from 'react'

type Org = {
  id: string
  name: string
  slug: string
  ownerEmail: string
  plan: string
  subscriptionStatus: string
  enabledModules: string[]
  crmMailboxEmail: string | null
  createdAt: string
}

export default function AdminBarioOneMailboxes() {
  const [orgs, setOrgs] = useState<Org[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [mode, setMode] = useState<Record<string, 'auto' | 'manual'>>({})
  const [domainInputs, setDomainInputs] = useState<Record<string, string>>({})
  const [manualInputs, setManualInputs] = useState<Record<string, { email: string; imapHost: string; imapPort: string; smtpHost: string; smtpPort: string; password: string }>>({})

  async function load() {
    const res = await fetch('/api/admin/bario-one/organizations')
    const data = await res.json()
    if (res.ok) setOrgs(data.orgs)
  }

  useEffect(() => {
    load()
  }, [])

  function manualFor(id: string) {
    return manualInputs[id] ?? { email: '', imapHost: '', imapPort: '993', smtpHost: '', smtpPort: '587', password: '' }
  }

  async function provisionAuto(orgId: string) {
    const domain = (domainInputs[orgId] ?? '').trim()
    if (!domain) {
      setError('Enter a domain the mailbox should live on (e.g. their own domain, or a Bario-hosted one).')
      return
    }
    setBusyId(orgId)
    setError(null)
    try {
      const res = await fetch(`/api/admin/bario-one/organizations/${orgId}/crm-mailbox`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ autoProvision: true, domain }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not provision mailbox')
      setOpenId(null)
      await load()
    } catch (err: any) {
      setError(err.message)
    }
    setBusyId(null)
  }

  async function connectManual(orgId: string) {
    const m = manualFor(orgId)
    if (!m.email || !m.imapHost || !m.smtpHost || !m.password) {
      setError('Email, IMAP host, SMTP host, and password are all required.')
      return
    }
    setBusyId(orgId)
    setError(null)
    try {
      const res = await fetch(`/api/admin/bario-one/organizations/${orgId}/crm-mailbox`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: m.email,
          imapHost: m.imapHost,
          imapPort: Number(m.imapPort) || 993,
          smtpHost: m.smtpHost,
          smtpPort: Number(m.smtpPort) || 587,
          password: m.password,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not connect mailbox')
      setOpenId(null)
      await load()
    } catch (err: any) {
      setError(err.message)
    }
    setBusyId(null)
  }

  if (orgs === null) return <p className="text-sm text-slate-500 dark:text-zinc-500">Loading…</p>

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</p>}
      {!orgs.length && <p className="text-sm text-slate-400 dark:text-zinc-500">No Bario One organizations yet.</p>}

      {orgs.map((o) => {
        const hasCrm = o.enabledModules.includes('crm')
        const m = manualFor(o.id)
        return (
          <div key={o.id} className="rounded-2xl border border-slate-200 dark:border-zinc-800 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-sm">{o.name}</p>
                <p className="text-xs text-slate-400 dark:text-zinc-500">{o.ownerEmail} · {o.plan} · {o.subscriptionStatus}</p>
                {!hasCrm && <p className="text-xs text-amber-500 mt-1">CRM module not enabled — mailbox won't be used until it is.</p>}
              </div>
              {o.crmMailboxEmail ? (
                <span className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-semibold text-xs whitespace-nowrap">
                  ✓ {o.crmMailboxEmail}
                </span>
              ) : (
                <button
                  onClick={() => setOpenId(openId === o.id ? null : o.id)}
                  className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs whitespace-nowrap"
                >
                  {openId === o.id ? 'Cancel' : 'Set up mailbox'}
                </button>
              )}
            </div>

            {openId === o.id && !o.crmMailboxEmail && (
              <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-zinc-800">
                <div className="flex gap-2 text-xs">
                  <button
                    onClick={() => setMode((p) => ({ ...p, [o.id]: 'auto' }))}
                    className={`px-2.5 py-1 rounded-lg border ${(mode[o.id] ?? 'auto') === 'auto' ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400' : 'border-slate-300 dark:border-zinc-700 text-slate-500 dark:text-zinc-400'}`}
                  >
                    Auto-provision on Bario
                  </button>
                  <button
                    onClick={() => setMode((p) => ({ ...p, [o.id]: 'manual' }))}
                    className={`px-2.5 py-1 rounded-lg border ${mode[o.id] === 'manual' ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400' : 'border-slate-300 dark:border-zinc-700 text-slate-500 dark:text-zinc-400'}`}
                  >
                    Connect their own
                  </button>
                </div>

                {(mode[o.id] ?? 'auto') === 'auto' ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 dark:text-zinc-500 whitespace-nowrap">crm@</span>
                    <input
                      value={domainInputs[o.id] ?? ''}
                      onChange={(e) => setDomainInputs((prev) => ({ ...prev, [o.id]: e.target.value }))}
                      placeholder="theirdomain.com"
                      className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs"
                    />
                    <button
                      onClick={() => provisionAuto(o.id)}
                      disabled={busyId === o.id}
                      className="px-3 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-semibold text-xs whitespace-nowrap"
                    >
                      {busyId === o.id ? 'Provisioning…' : 'Create mailbox'}
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <input value={m.email} onChange={(e) => setManualInputs((p) => ({ ...p, [o.id]: { ...m, email: e.target.value } }))} placeholder="crm@theirdomain.com" className="col-span-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs" />
                    <input value={m.imapHost} onChange={(e) => setManualInputs((p) => ({ ...p, [o.id]: { ...m, imapHost: e.target.value } }))} placeholder="IMAP host" className="px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs" />
                    <input value={m.imapPort} onChange={(e) => setManualInputs((p) => ({ ...p, [o.id]: { ...m, imapPort: e.target.value } }))} placeholder="IMAP port (993)" className="px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs" />
                    <input value={m.smtpHost} onChange={(e) => setManualInputs((p) => ({ ...p, [o.id]: { ...m, smtpHost: e.target.value } }))} placeholder="SMTP host" className="px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs" />
                    <input value={m.smtpPort} onChange={(e) => setManualInputs((p) => ({ ...p, [o.id]: { ...m, smtpPort: e.target.value } }))} placeholder="SMTP port (587)" className="px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs" />
                    <input type="password" value={m.password} onChange={(e) => setManualInputs((p) => ({ ...p, [o.id]: { ...m, password: e.target.value } }))} placeholder="Password" className="col-span-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs" />
                    <button
                      onClick={() => connectManual(o.id)}
                      disabled={busyId === o.id}
                      className="col-span-2 px-3 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-semibold text-xs"
                    >
                      {busyId === o.id ? 'Connecting…' : 'Connect mailbox'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
