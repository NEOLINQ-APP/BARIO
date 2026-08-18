'use client'

import { useEffect, useState } from 'react'

type Site = { id: string; name: string; subdomain: string | null; custom_domain: string | null; domain_status: string }
type Mailbox = { id: string; site_id: string; domain: string; local_part: string; full_address: string; status: string; created_at: string }
type ExternalAccount = { id: string; mailbox_id: string; label: string; email: string; created_at: string }

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

  const [externalAccounts, setExternalAccounts] = useState<ExternalAccount[] | null>(null)
  const [externalLimit, setExternalLimit] = useState(5)
  const [externalTrialEndsAt, setExternalTrialEndsAt] = useState<string | null>(null)

  function displayDomain(s: Site): string {
    return s.custom_domain && s.domain_status === 'verified' ? s.custom_domain : `${s.subdomain}.bario.ca`
  }

  async function load() {
    setError(null)
    try {
      const [sitesRes, mailboxesRes, externalRes] = await Promise.all([
        fetch('/api/sites'),
        fetch('/api/email/mailboxes'),
        fetch('/api/email/external-accounts'),
      ])
      const sitesData = await sitesRes.json()
      const mailboxesData = await mailboxesRes.json()
      const externalData = await externalRes.json()
      if (!sitesRes.ok) throw new Error(sitesData.error ?? 'Failed to load your sites')
      if (!mailboxesRes.ok) throw new Error(mailboxesData.error ?? 'Failed to load your mailboxes')

      // A site can host email on a verified custom domain, or on its own
      // *.bario.ca subdomain if it has one -- either is fine, only a site
      // with neither is ineligible.
      const eligible = (sitesData.sites as Site[]).filter((s) => (s.custom_domain && s.domain_status === 'verified') || s.subdomain)
      setSites(eligible)
      setMailboxes(mailboxesData.mailboxes)
      if (eligible[0] && !siteId) setSiteId(eligible[0].id)
      if (externalRes.ok) {
        setExternalAccounts(externalData.accounts)
        setExternalLimit(externalData.limit)
        setExternalTrialEndsAt(externalData.trialEndsAt)
      }
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
          Create a <a href="/dashboard/websites" className="underline">website</a> first — email can be hosted on its
          bario.ca subdomain right away, or on your own domain once it's connected and verified.
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
                <option key={s.id} value={s.id}>{displayDomain(s)}</option>
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
                  @{sites.find((s) => s.id === siteId) && displayDomain(sites.find((s) => s.id === siteId)!)}
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

      {mailboxes.length > 0 && (
        <ExternalAccountsSection
          mailboxes={mailboxes}
          accounts={externalAccounts}
          limit={externalLimit}
          trialEndsAt={externalTrialEndsAt}
          onChanged={load}
        />
      )}
    </div>
  )
}

function ExternalAccountsSection({
  mailboxes,
  accounts,
  limit,
  trialEndsAt,
  onChanged,
}: {
  mailboxes: Mailbox[]
  accounts: ExternalAccount[] | null
  limit: number
  trialEndsAt: string | null
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [mailboxId, setMailboxId] = useState(mailboxes[0]?.id ?? '')
  const [label, setLabel] = useState('')
  const [email, setEmail] = useState('')
  const [imapHost, setImapHost] = useState('')
  const [imapPort, setImapPort] = useState('993')
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState('465')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const count = accounts?.length ?? 0
  const atLimit = count >= limit
  const trialExpired = trialEndsAt ? Date.now() > new Date(trialEndsAt).getTime() : false

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/email/external-accounts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mailboxId,
          label,
          email,
          imapHost,
          imapPort: Number(imapPort),
          smtpHost,
          smtpPort: Number(smtpPort),
          password,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to connect this mailbox')
      setLabel('')
      setEmail('')
      setImapHost('')
      setSmtpHost('')
      setPassword('')
      setOpen(false)
      onChanged()
    } catch (err: any) {
      setError(err.message)
    }
    setBusy(false)
  }

  async function handleRemove(id: string) {
    if (!confirm("Disconnect this mailbox? It'll stop showing up in your webmail.")) return
    setError(null)
    try {
      const res = await fetch('/api/email/external-accounts', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to disconnect')
      onChanged()
    } catch (err: any) {
      setError(err.message)
    }
  }

  return (
    <div className="pt-6 border-t border-slate-200 dark:border-zinc-800">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-semibold text-sm">Connect an existing mailbox</h3>
          <p className="text-xs text-slate-500 dark:text-zinc-500 mt-0.5">
            Already have email elsewhere? Bring it into the same webmail — no migration needed.
            {trialEndsAt && (
              <> Free through {new Date(trialEndsAt).toLocaleDateString()}.</>
            )}
          </p>
        </div>
        {!atLimit && !trialExpired && (
          <button
            onClick={() => setOpen(!open)}
            className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-zinc-800 text-xs font-semibold"
          >
            {open ? 'Cancel' : '+ Connect a mailbox'}
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-500 dark:text-red-400 mt-2">{error}</p>}

      {trialExpired && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
          Your free year for connecting external mailboxes has ended. Already-connected accounts keep working.
        </p>
      )}
      {atLimit && !trialExpired && (
        <p className="text-xs text-slate-500 dark:text-zinc-500 mt-2">You've connected the maximum of {limit} mailboxes.</p>
      )}

      {open && (
        <form onSubmit={handleAdd} className="mt-3 space-y-3 rounded-xl border border-slate-200 dark:border-zinc-800 p-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-zinc-400 mb-1">Show mail in</label>
              <select
                value={mailboxId}
                onChange={(e) => setMailboxId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
              >
                {mailboxes.map((m) => (
                  <option key={m.id} value={m.id}>{m.full_address}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-zinc-400 mb-1">Label</label>
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Support inbox" className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-zinc-400 mb-1">Email address</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourbusiness.com" className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm" />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-500 dark:text-zinc-400 mb-1">Incoming (IMAP) server</label>
                <input value={imapHost} onChange={(e) => setImapHost(e.target.value)} placeholder="imap.yourprovider.com" className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm" />
              </div>
              <div className="w-20">
                <label className="block text-xs font-semibold text-slate-500 dark:text-zinc-400 mb-1">Port</label>
                <input value={imapPort} onChange={(e) => setImapPort(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm" />
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-500 dark:text-zinc-400 mb-1">Outgoing (SMTP) server</label>
                <input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.yourprovider.com" className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm" />
              </div>
              <div className="w-20">
                <label className="block text-xs font-semibold text-slate-500 dark:text-zinc-400 mb-1">Port</label>
                <input value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm" />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-zinc-400 mb-1">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm" />
          </div>
          <button
            type="submit"
            disabled={busy || !label.trim() || !email.trim() || !imapHost.trim() || !smtpHost.trim() || !password}
            className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-semibold text-sm"
          >
            {busy ? 'Connecting…' : 'Connect mailbox'}
          </button>
        </form>
      )}

      {accounts && accounts.length > 0 && (
        <div className="mt-3 space-y-2">
          {accounts.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-zinc-800 p-3 text-sm">
              <div>
                <span className="font-medium">{a.label}</span>
                <span className="text-xs text-slate-500 dark:text-zinc-500 ml-2">{a.email}</span>
              </div>
              <button onClick={() => handleRemove(a.id)} className="text-xs text-red-500 dark:text-red-400 underline">
                Disconnect
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
