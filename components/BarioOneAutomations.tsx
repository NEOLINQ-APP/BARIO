'use client'

import { useEffect, useState } from 'react'

type Stage = { id: string; key: string; name: string }
type Pipeline = { id: string; name: string; is_default: boolean; stages: Stage[] }
type Automation = {
  id: string
  name: string
  trigger_event: string
  status: 'active' | 'paused'
  triggerFilter: { pipelineId?: string; stageKey?: string }
  actionConfig: Record<string, unknown>
  action_type: string
}
type Run = { id: string; success: boolean; error: string | null; created_at: string }

const TRIGGER_LABEL: Record<string, string> = {
  'deal.created': 'A deal is created',
  'deal.stage_changed': 'A deal moves to a stage',
  'customer.created': 'A customer is created',
  'invoice.paid': 'An invoice is paid',
}
const ACTION_LABEL: Record<string, string> = {
  create_task: 'Create a task',
  add_tag: 'Tag the customer',
  add_note: 'Add a note to the customer',
  send_email: 'Email the customer',
  send_sms: 'Text the customer',
}

function ActionConfigFields({
  actionType,
  config,
  onChange,
}: {
  actionType: string
  config: Record<string, string>
  onChange: (patch: Record<string, string>) => void
}) {
  const input = (key: string, placeholder: string, type = 'text') => (
    <input
      value={config[key] ?? ''}
      onChange={(e) => onChange({ [key]: e.target.value })}
      placeholder={placeholder}
      type={type}
      className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm"
    />
  )
  const textarea = (key: string, placeholder: string) => (
    <textarea
      value={config[key] ?? ''}
      onChange={(e) => onChange({ [key]: e.target.value })}
      placeholder={placeholder}
      rows={3}
      className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm"
    />
  )

  switch (actionType) {
    case 'create_task':
      return (
        <div className="space-y-2">
          {input('title', 'Task title (e.g. Send onboarding kit)')}
          {input('dueInDays', 'Due in how many days (optional)', 'number')}
        </div>
      )
    case 'add_tag':
      return input('tag', 'Tag (e.g. vip)')
    case 'add_note':
      return textarea('body', 'Note text')
    case 'send_email':
      return (
        <div className="space-y-2">
          {input('subject', 'Email subject')}
          {textarea('body', 'Email message')}
        </div>
      )
    case 'send_sms':
      return textarea('body', 'Text message')
    default:
      return null
  }
}

function AddAutomationForm({ pipelines, onAdded }: { pipelines: Pipeline[]; onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [triggerEvent, setTriggerEvent] = useState('deal.stage_changed')
  const [pipelineId, setPipelineId] = useState(pipelines.find((p) => p.is_default)?.id ?? pipelines[0]?.id ?? '')
  const [stageKey, setStageKey] = useState('')
  const [actionType, setActionType] = useState('create_task')
  const [config, setConfig] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedPipeline = pipelines.find((p) => p.id === pipelineId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const actionConfig: Record<string, unknown> = { ...config }
      if (typeof actionConfig.dueInDays === 'string') {
        actionConfig.dueInDays = actionConfig.dueInDays ? Number(actionConfig.dueInDays) : undefined
      }
      const res = await fetch('/api/bario-one/crm/automations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          triggerEvent,
          triggerFilter: triggerEvent === 'deal.stage_changed' ? { pipelineId, stageKey } : {},
          actionType,
          actionConfig,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      setName('')
      setConfig({})
      setOpen(false)
      onAdded()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-4 py-2 mb-4">
        + Add automation
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4 space-y-3 mb-4">
      <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this automation" className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />

      <div>
        <p className="text-xs text-slate-500 dark:text-zinc-400 mb-1">When…</p>
        <select value={triggerEvent} onChange={(e) => setTriggerEvent(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm">
          {Object.entries(TRIGGER_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      {triggerEvent === 'deal.stage_changed' && (
        <div className="grid grid-cols-2 gap-2">
          <select value={pipelineId} onChange={(e) => { setPipelineId(e.target.value); setStageKey('') }} className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm">
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select required value={stageKey} onChange={(e) => setStageKey(e.target.value)} className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm">
            <option value="">Select stage…</option>
            {selectedPipeline?.stages.map((s) => (
              <option key={s.key} value={s.key}>{s.name}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <p className="text-xs text-slate-500 dark:text-zinc-400 mb-1">Do…</p>
        <select value={actionType} onChange={(e) => setActionType(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm">
          {Object.entries(ACTION_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      <ActionConfigFields actionType={actionType} config={config} onChange={(patch) => setConfig((prev) => ({ ...prev, ...patch }))} />

      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2">
          {busy ? 'Saving…' : 'Save automation'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-slate-100 dark:bg-zinc-800 text-sm px-4 py-2">Cancel</button>
      </div>
    </form>
  )
}

function AutomationRow({ automation, pipelines, onChanged }: { automation: Automation; pipelines: Pipeline[]; onChanged: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [runs, setRuns] = useState<Run[] | null>(null)

  async function toggleExpand() {
    setExpanded((e) => !e)
    if (!runs) {
      const res = await fetch(`/api/bario-one/crm/automations/${automation.id}/runs`)
      const data = await res.json()
      setRuns(data.runs ?? [])
    }
  }

  async function toggleStatus() {
    await fetch(`/api/bario-one/crm/automations/${automation.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: automation.status === 'active' ? 'paused' : 'active' }),
    })
    onChanged()
  }

  async function remove() {
    await fetch(`/api/bario-one/crm/automations/${automation.id}`, { method: 'DELETE' })
    onChanged()
  }

  const pipeline = pipelines.find((p) => p.id === automation.triggerFilter?.pipelineId)
  const stage = pipeline?.stages.find((s) => s.key === automation.triggerFilter?.stageKey)
  const triggerSummary =
    automation.trigger_event === 'deal.stage_changed' && pipeline && stage
      ? `A deal in "${pipeline.name}" moves to "${stage.name}"`
      : TRIGGER_LABEL[automation.trigger_event] ?? automation.trigger_event

  return (
    <div className="border border-slate-200 dark:border-zinc-800 rounded-lg p-3 text-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">{automation.name}</p>
          <p className="text-xs text-slate-500 dark:text-zinc-400">
            When {triggerSummary.charAt(0).toLowerCase() + triggerSummary.slice(1)} → {ACTION_LABEL[automation.action_type] ?? automation.action_type}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button onClick={toggleStatus} className={`text-xs px-2 py-1 rounded-full ${automation.status === 'active' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400'}`}>
            {automation.status === 'active' ? 'Active' : 'Paused'}
          </button>
          <button onClick={toggleExpand} className="text-xs text-amber-600 dark:text-[#d4af37] hover:underline">
            {expanded ? 'Hide log' : 'View log'}
          </button>
          <button onClick={remove} className="text-xs text-red-600 dark:text-red-400 hover:underline">Remove</button>
        </div>
      </div>
      {expanded && (
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-zinc-900 space-y-1">
          {runs === null && <p className="text-xs text-slate-400">Loading…</p>}
          {runs?.length === 0 && <p className="text-xs text-slate-400">No runs yet.</p>}
          {runs?.map((r) => (
            <div key={r.id} className="text-xs flex items-center justify-between">
              <span className={r.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}>
                {r.success ? '✓ Ran successfully' : `✗ ${r.error ?? 'Failed'}`}
              </span>
              <span className="text-slate-400">{new Date(r.created_at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function BarioOneAutomations() {
  const [automations, setAutomations] = useState<Automation[] | null>(null)
  const [pipelines, setPipelines] = useState<Pipeline[]>([])

  async function load() {
    const res = await fetch('/api/bario-one/crm/automations')
    const data = await res.json()
    setAutomations(data.automations ?? [])
  }

  async function loadPipelines() {
    const res = await fetch('/api/bario-one/crm/pipelines')
    const data = await res.json()
    setPipelines(data.pipelines ?? [])
  }

  useEffect(() => {
    load()
    loadPipelines()
  }, [])

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-slate-500 dark:text-zinc-400">
        Automate repetitive CRM work — when something happens, Bario One does the next step for you.
      </p>
      {pipelines.length > 0 && <AddAutomationForm pipelines={pipelines} onAdded={load} />}
      {automations === null ? (
        <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>
      ) : automations.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-zinc-400">No automations yet.</p>
      ) : (
        <div className="space-y-2">
          {automations.map((a) => (
            <AutomationRow key={a.id} automation={a} pipelines={pipelines} onChanged={load} />
          ))}
        </div>
      )}
    </div>
  )
}
