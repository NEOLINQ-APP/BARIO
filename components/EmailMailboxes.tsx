'use client'

import { useEffect, useState } from 'react'

type Site = { id: string; name: string; custom_domain: string | null; domain_status: string }
type Mailbox = { id: string; site_id: string; domain: string; local_part: string; full_address: string; status: string; created_at: string }

const WEBMAIL_URL = 'https://reseller.bario.ca/SOGo'

export default function EmailMailboxes() {
  const [sites, setSites] = useState<Site[] | null>(null)
  const [mailboxes, setMailboxes] = useState<Mailbox[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [siteId, setSiteId] = useState('')
  const [localPart, setLocalPart] = useState('')
  const [password, setPassword] = useState('')
  const [creating, setCreating] = useState(false)
  const [justCreated, setJustCreated] = useState<{ fullAddress: string; dnsAutoConfigured: boolean } | null>(null)

  async function load() {
    setError(null)
    try {
      const [sitesRes, mailboxesRes] = await Promise.all([
        fetch('/api/sites'),
        fetch('/api/email/mailboxes'),
      ])
      const sitesData = await sitesRes.json()
      const mailboxesData = await mailboxesRes.json()
      if (!sitesRes.ok) throw new Error(sitesData.error ?? 'Failed to load your sites')
      if (!mailboxesRes.ok) throw new Error(mailboxesData.error ?? 'Failed to load your mailboxes')

      const eligible = (sitesData.sites as Site[]).filter((s) => s.custom_domain && s.domain_status === 'verified')
      setSites(eligible)
      setMailboxes(mailboxesData.mailboxes)
      if (eligible[0] && !siteId) setSiteId(eligible[0].id)
    } catch (err: any) {
      setError(err.message)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!siteId || !localPart.trim() || password.length < 8) return
    setCreating(true)
    setError(null)
    setJustCreated(null)
    try {
      const res = await fetch('/api/email/mailboxes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ siteId, localPart: localPart.trim().toLowerCase(), password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create mailbox')
      setJustCreated({ fullAddress: data.fullAddress, dnsAutoConfigured: data.dnsAutoConfigured })
      setLocalPart('')
      setPassword('')
      await load()
    } catch (err: any) {
      setError(err.message)
    }
    setCreating(false)
  }

  async function handleDelete(id: string, fullAddress: string) {
    if (!confirm(`Delete ${fullAddress}? This can't be undone.`)) return
    setError(null)
    try {
      const res = await fetch('/api/email/mailboxes', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to delete mailbox')
      await load()
    } catch (err: any) {
      setError(err.message)
    }
  }

  if (!sites || !mailboxes) return <p className="text-sm text-slate-500 dark:text-zinc-500">Loading your mailboxes…</p>

  return (
    <div className="space-y-6">
      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}

      {sites.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-zinc-500">
          Connect and verify a custom domain on one of your <a href="/dashboard/websites" className="underline">websites</a> before
          setting up email.
        </p>
      ) : (
        <form onSubmit={handleCreate} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-zinc-400 mb-1">Domain</label>
            <select
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.custom_domain}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 items-end flex-wrap">
            <div className="flex-1 min-w-[10rem]">
              <label className="block text-xs font-semibold text-slate-500 dark:text-zinc-400 mb-1">Mailbox</label>
              <div className="flex items-center gap-1">
                <input
                  value={localPart}
                  onChange={(e) => setLocalPart(e.target.value)}
                  placeholder="info"
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
                />
                <span className="text-sm text-slate-500 dark:text-zinc-400 whitespace-nowrap">
                  @{sites.find((s) => s.id === siteId)?.custom_domain}
                </span>
              </div>
            </div>
            <div className="flex-1 min-w-[10rem]">
              <label className="block text-xs font-semibold text-slate-500 dark:text-zinc-400 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={creating || !localPart.trim() || password.length < 8}
              className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-semibold text-sm"
            >
              {creating ? 'Creating…' : 'Create mailbox'}
            </button>
          </div>
        </form>
      )}

      {justCreated && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
          <p className="font-semibold text-emerald-600 dark:text-emerald-400">🎉 {justCreated.fullAddress} is ready.</p>
          <p className="text-slate-600 dark:text-zinc-400 mt-1">
            Check your email anytime from the list below — click <strong>Open Webmail</strong> next to {justCreated.fullAddress}.
          </p>
          {!justCreated.dnsAutoConfigured && (
            <p className="text-amber-600 dark:text-amber-400 mt-2">
              We couldn't auto-configure DNS for this domain — add MX/SPF/DKIM records manually so mail actually routes here.
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        {mailboxes.length === 0 && <p className="text-sm text-slate-500 dark:text-zinc-500">No mailboxes yet.</p>}
        {mailboxes.map((m) => (
          <div
            key={m.id}
            className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-transparent p-4"
          >
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <span className="font-semibold">{m.full_address}</span>
                <span className="block text-xs text-slate-500 dark:text-zinc-500 mt-0.5">
                  Created {new Date(m.created_at).toLocaleDateString()}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={WEBMAIL_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs"
                >
                  Open Webmail
                </a>
                <button
                  onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}
                  className="text-xs text-slate-500 dark:text-zinc-400 underline"
                >
                  {expandedId === m.id ? 'Hide settings' : 'Connection settings'}
                </button>
                <button
                  onClick={() => handleDelete(m.id, m.full_address)}
                  className="text-xs text-red-500 dark:text-red-400 underline"
                >
                  Delete
                </button>
              </div>
            </div>

            {expandedId === m.id && (
              <div className="mt-3 pt-3 border-t border-slate-200 dark:border-zinc-800 text-xs text-slate-600 dark:text-zinc-400 space-y-1">
                <p>
                  Webmail: <a href={WEBMAIL_URL} target="_blank" rel="noreferrer" className="underline">reseller.bario.ca/SOGo</a> — log in with {m.full_address} and your mailbox password.
                </p>
                <p>To use this address in an app like Outlook or your phone's Mail app instead, add a new account with:</p>
                <p>Incoming (IMAP): reseller.bario.ca, port 993, SSL/TLS</p>
                <p>Outgoing (SMTP): reseller.bario.ca, port 587, STARTTLS</p>
                <p>Username: {m.full_address} — Password: whatever you set when creating this mailbox.</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
