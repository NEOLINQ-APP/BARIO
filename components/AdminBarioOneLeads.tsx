'use client'

import { useEffect, useState } from 'react'

type Org = { id: string; name: string; enabledModules: string[]; crmMailboxEmail: string | null }
type Lead = {
  id: string
  company_name: string | null
  contact_name: string
  email: string | null
  phone: string | null
  tags_json: string
  email_count: number
  created_at: string
}
type ThreadEntry = {
  id: string
  direction: 'outbound' | 'inbound' | null
  from_email: string | null
  body: string
  campaign_id: string | null
  created_at: string
}
type Campaign = {
  id: string
  name: string
  subject: string
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed'
  scheduled_at: string | null
  sent_at: string | null
  recipient_count: number
  sent_count: number
  failed_count: number
  created_via: 'admin' | 'ai_assistant'
  created_at: string
}

function fmt(dt: string | null) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString()
}

export default function AdminBarioOneLeads() {
  const [orgs, setOrgs] = useState<Org[] | null>(null)
  const [orgId, setOrgId] = useState<string>('')
  const [leads, setLeads] = useState<Lead[] | null>(null)
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [thread, setThread] = useState<ThreadEntry[] | null>(null)
  const [replySubject, setReplySubject] = useState('')
  const [replyBody, setReplyBody] = useState('')
  const [sendingReply, setSendingReply] = useState(false)

  const [showCampaignForm, setShowCampaignForm] = useState(false)
  const [campaignName, setCampaignName] = useState('')
  const [campaignSubject, setCampaignSubject] = useState('')
  const [campaignBody, setCampaignBody] = useState('')
  const [scheduleMode, setScheduleMode] = useState<'now' | 'later'>('now')
  const [scheduledAt, setScheduledAt] = useState('')
  const [personalize, setPersonalize] = useState(false)
  const [sendingCampaign, setSendingCampaign] = useState(false)
  const [draftingReply, setDraftingReply] = useState(false)

  useEffect(() => {
    fetch('/api/admin/bario-one/organizations')
      .then((r) => r.json())
      .then((data) => {
        if (data.orgs) {
          setOrgs(data.orgs)
          if (data.orgs.length > 0) setOrgId(data.orgs[0].id)
        }
      })
  }, [])

  useEffect(() => {
    if (!orgId) return
    setSelectedLead(null)
    setThread(null)
    loadLeads()
    loadCampaigns()
  }, [orgId])

  async function loadLeads() {
    setLeads(null)
    const res = await fetch(`/api/admin/bario-one/organizations/${orgId}/leads`)
    const data = await res.json()
    if (res.ok) setLeads(data.customers)
  }

  async function loadCampaigns() {
    const res = await fetch(`/api/admin/bario-one/organizations/${orgId}/campaigns`)
    const data = await res.json()
    if (res.ok) setCampaigns(data.campaigns)
  }

  async function openLead(lead: Lead) {
    setSelectedLead(lead)
    setThread(null)
    setReplySubject('')
    setReplyBody('')
    const res = await fetch(`/api/admin/bario-one/organizations/${orgId}/leads/${lead.id}/thread`)
    const data = await res.json()
    if (res.ok) setThread(data.thread)
  }

  async function sendReply() {
    if (!selectedLead || !replySubject.trim() || !replyBody.trim()) return
    setSendingReply(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/bario-one/organizations/${orgId}/leads/${selectedLead.id}/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subject: replySubject, body: replyBody }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not send email')
      setReplySubject('')
      setReplyBody('')
      await openLead(selectedLead)
      await loadLeads()
    } catch (err: any) {
      setError(err.message)
    }
    setSendingReply(false)
  }

  async function suggestReply() {
    if (!selectedLead) return
    setDraftingReply(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/bario-one/organizations/${orgId}/leads/${selectedLead.id}/draft-reply`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not draft a reply')
      setReplySubject(data.subject)
      setReplyBody(data.body)
    } catch (err: any) {
      setError(err.message)
    }
    setDraftingReply(false)
  }

  const leadsWithEmail = leads?.filter((l) => l.email) ?? []

  async function cancelCampaign(campaignId: string) {
    setError(null)
    try {
      const res = await fetch(`/api/admin/bario-one/organizations/${orgId}/campaigns/${campaignId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not cancel campaign')
      await loadCampaigns()
    } catch (err: any) {
      setError(err.message)
    }
  }

  async function submitCampaign() {
    if (!campaignName.trim() || !campaignSubject.trim() || !campaignBody.trim()) {
      setError('Name, subject, and body are all required.')
      return
    }
    if (scheduleMode === 'later' && !scheduledAt) {
      setError('Pick a date/time to schedule for, or switch to "Send now".')
      return
    }
    setSendingCampaign(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/bario-one/organizations/${orgId}/campaigns`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: campaignName,
          subject: campaignSubject,
          body: campaignBody,
          scheduledAt: scheduleMode === 'later' ? new Date(scheduledAt).toISOString() : null,
          personalize,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not create campaign')
      setShowCampaignForm(false)
      setCampaignName('')
      setCampaignSubject('')
      setCampaignBody('')
      setScheduleMode('now')
      setScheduledAt('')
      setPersonalize(false)
      await loadCampaigns()
      await loadLeads()
    } catch (err: any) {
      setError(err.message)
    }
    setSendingCampaign(false)
  }

  const statusColor: Record<Campaign['status'], string> = {
    draft: 'bg-slate-500/10 border-slate-500/30 text-slate-500 dark:text-zinc-400',
    scheduled: 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400',
    sending: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-600 dark:text-cyan-400',
    sent: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400',
    failed: 'bg-red-500/10 border-red-500/30 text-red-500 dark:text-red-400',
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 dark:text-zinc-500">Organization</label>
        <select
          value={orgId}
          onChange={(e) => setOrgId(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
        >
          {orgs?.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
        {orgs?.find((o) => o.id === orgId) && !orgs.find((o) => o.id === orgId)!.crmMailboxEmail && (
          <span className="text-xs text-amber-500">No CRM mailbox connected — sends will be one-way (see /admin/bario-one-mailboxes)</span>
        )}
      </div>

      {/* Campaigns */}
      <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-sm">Email campaigns</p>
          <button
            onClick={() => setShowCampaignForm((v) => !v)}
            className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs whitespace-nowrap"
          >
            {showCampaignForm ? 'Cancel' : 'New campaign'}
          </button>
        </div>

        {showCampaignForm && (
          <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-zinc-800">
            <p className="text-xs text-slate-400 dark:text-zinc-500">
              Will send to {leadsWithEmail.length} lead{leadsWithEmail.length === 1 ? '' : 's'} with an email on file
              {leads && leads.length > leadsWithEmail.length ? ` (${leads.length - leadsWithEmail.length} skipped, no email)` : ''}.
            </p>
            <input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder="Campaign name (internal)" className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm" />
            <input value={campaignSubject} onChange={(e) => setCampaignSubject(e.target.value)} placeholder="Subject line" className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm" />
            <textarea value={campaignBody} onChange={(e) => setCampaignBody(e.target.value)} placeholder="Email body…" rows={6} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm" />
            <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-zinc-400">
              <input type="checkbox" checked={personalize} onChange={(e) => setPersonalize(e.target.checked)} />
              Personalize each email with AI (rewrites the body per recipient, referencing their company — better reply rates, slower to send)
            </label>
            <div className="flex items-center gap-3 text-xs">
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={scheduleMode === 'now'} onChange={() => setScheduleMode('now')} /> Send now
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={scheduleMode === 'later'} onChange={() => setScheduleMode('later')} /> Schedule for
              </label>
              {scheduleMode === 'later' && (
                <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="px-2 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900" />
              )}
            </div>
            <button
              onClick={submitCampaign}
              disabled={sendingCampaign}
              className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-semibold text-sm"
            >
              {sendingCampaign ? 'Working…' : scheduleMode === 'later' ? 'Schedule campaign' : 'Send now'}
            </button>
          </div>
        )}

        {campaigns && campaigns.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 dark:text-zinc-500">
                  <th className="py-1 pr-3">Name</th>
                  <th className="py-1 pr-3">Status</th>
                  <th className="py-1 pr-3">Scheduled / Sent</th>
                  <th className="py-1 pr-3">Sent</th>
                  <th className="py-1 pr-3">Via</th>
                  <th className="py-1 pr-3"></th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100 dark:border-zinc-800">
                    <td className="py-1.5 pr-3 font-medium">{c.name}</td>
                    <td className="py-1.5 pr-3"><span className={`px-2 py-0.5 rounded border text-[11px] ${statusColor[c.status]}`}>{c.status}</span></td>
                    <td className="py-1.5 pr-3 text-slate-500 dark:text-zinc-400">{c.status === 'scheduled' ? fmt(c.scheduled_at) : fmt(c.sent_at)}</td>
                    <td className="py-1.5 pr-3 text-slate-500 dark:text-zinc-400">{c.sent_count}/{c.recipient_count}{c.failed_count ? ` (${c.failed_count} failed)` : ''}</td>
                    <td className="py-1.5 pr-3 text-slate-500 dark:text-zinc-400">{c.created_via === 'ai_assistant' ? 'Miko' : 'Admin'}</td>
                    <td className="py-1.5">
                      {c.status === 'scheduled' && (
                        <button onClick={() => cancelCampaign(c.id)} className="text-red-500 hover:text-red-400 text-[11px]">Cancel</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {campaigns && campaigns.length === 0 && <p className="text-xs text-slate-400 dark:text-zinc-500">No campaigns sent yet.</p>}
      </div>

      {/* Leads + thread */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 p-4">
          <p className="font-semibold text-sm mb-2">Leads {leads ? `(${leads.length})` : ''}</p>
          {leads === null && <p className="text-xs text-slate-400 dark:text-zinc-500">Loading…</p>}
          {leads?.length === 0 && <p className="text-xs text-slate-400 dark:text-zinc-500">No leads yet.</p>}
          <div className="space-y-1 max-h-[28rem] overflow-y-auto">
            {leads?.map((l) => (
              <button
                key={l.id}
                onClick={() => openLead(l)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs border ${selectedLead?.id === l.id ? 'border-cyan-500 bg-cyan-500/5' : 'border-transparent hover:border-slate-200 dark:hover:border-zinc-800'}`}
              >
                <p className="font-medium">{l.company_name || l.contact_name}</p>
                <p className="text-slate-400 dark:text-zinc-500">{l.email || 'no email on file'}{l.email_count ? ` · ${l.email_count} email${l.email_count === 1 ? '' : 's'}` : ''}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 p-4">
          {!selectedLead && <p className="text-xs text-slate-400 dark:text-zinc-500">Select a lead to view its email thread and reply.</p>}
          {selectedLead && (
            <div className="space-y-3">
              <p className="font-semibold text-sm">{selectedLead.company_name || selectedLead.contact_name}</p>
              {!selectedLead.email && <p className="text-xs text-amber-500">No email on file for this lead.</p>}

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {thread === null && <p className="text-xs text-slate-400 dark:text-zinc-500">Loading thread…</p>}
                {thread?.length === 0 && <p className="text-xs text-slate-400 dark:text-zinc-500">No emails yet.</p>}
                {thread?.map((t) => (
                  <div key={t.id} className={`text-xs rounded-lg px-3 py-2 ${t.direction === 'inbound' ? 'bg-emerald-500/5 border border-emerald-500/20' : 'bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800'}`}>
                    <p className="text-slate-400 dark:text-zinc-500 mb-1">{t.direction === 'inbound' ? 'Received' : 'Sent'} · {fmt(t.created_at)}{t.campaign_id ? ' · campaign' : ''}</p>
                    <p className="whitespace-pre-wrap">{t.body}</p>
                  </div>
                ))}
              </div>

              {selectedLead.email && (
                <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-zinc-800">
                  <input value={replySubject} onChange={(e) => setReplySubject(e.target.value)} placeholder="Subject" className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs" />
                  <textarea value={replyBody} onChange={(e) => setReplyBody(e.target.value)} placeholder="Write a reply…" rows={4} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs" />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={sendReply}
                      disabled={sendingReply}
                      className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-semibold text-xs"
                    >
                      {sendingReply ? 'Sending…' : 'Send'}
                    </button>
                    {thread && thread.length > 0 && (
                      <button
                        onClick={suggestReply}
                        disabled={draftingReply}
                        className="px-3 py-1.5 rounded-lg border border-cyan-500 text-cyan-600 dark:text-cyan-400 disabled:opacity-50 font-semibold text-xs"
                      >
                        {draftingReply ? 'Drafting…' : '✨ Suggest reply (AI)'}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
