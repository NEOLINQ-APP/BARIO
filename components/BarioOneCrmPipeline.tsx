'use client'

import { useEffect, useState } from 'react'
import BarioOneCustomFieldInputs from './BarioOneCustomFieldInputs'

type Stage = { id: string; key: string; name: string; position: number }
type Pipeline = { id: string; name: string; is_default: boolean; stages: Stage[] }
type Deal = {
  id: string
  title: string
  stage: string
  value_cents: number
  expected_close_date: string | null
  contact_name: string
  company_name: string | null
  customFields: Record<string, unknown>
}
type CustomerOption = { id: string; contact_name: string; company_name: string | null }
type FieldDef = { id: string; name: string; field_type: 'text' | 'number' | 'date' | 'select' | 'checkbox'; options: string[] }
type View = 'kanban' | 'list' | 'calendar'

function AddDealForm({
  customers,
  dealFields,
  pipelineId,
  onAdded,
}: {
  customers: CustomerOption[]
  dealFields: FieldDef[]
  pipelineId: string | null
  onAdded: () => void
}) {
  const [open, setOpen] = useState(false)
  const [customerId, setCustomerId] = useState('')
  const [title, setTitle] = useState('')
  const [valueDollars, setValueDollars] = useState('')
  const [expectedCloseDate, setExpectedCloseDate] = useState('')
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/bario-one/crm/deals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          customerId,
          title,
          valueCents: Math.round(Number(valueDollars || 0) * 100),
          expectedCloseDate: expectedCloseDate || null,
          customFields,
          pipelineId,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      setTitle('')
      setValueDollars('')
      setExpectedCloseDate('')
      setCustomFields({})
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
        + Add deal
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4 space-y-3 mb-4 max-w-lg">
      <select required value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm">
        <option value="">Select customer…</option>
        {customers.map((c) => (
          <option key={c.id} value={c.id}>{c.contact_name}{c.company_name ? ` — ${c.company_name}` : ''}</option>
        ))}
      </select>
      <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Deal title" className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
      <div className="grid grid-cols-2 gap-3">
        <input value={valueDollars} onChange={(e) => setValueDollars(e.target.value)} placeholder="Value ($)" type="number" min="0" step="0.01" className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
        <input value={expectedCloseDate} onChange={(e) => setExpectedCloseDate(e.target.value)} type="date" className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
      </div>
      {dealFields.length > 0 && (
        <BarioOneCustomFieldInputs fields={dealFields} values={customFields} onChange={(id, value) => setCustomFields((prev) => ({ ...prev, [id]: value }))} />
      )}
      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2">
          {busy ? 'Saving…' : 'Save deal'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-slate-100 dark:bg-zinc-800 text-sm px-4 py-2">Cancel</button>
      </div>
    </form>
  )
}

function AddPipelineForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/bario-one/crm/pipelines', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      setName('')
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
      <button onClick={() => setOpen(true)} className="text-sm font-medium text-amber-600 dark:text-[#d4af37] hover:underline">
        + New pipeline
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        required
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Pipeline name"
        className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-2 py-1 text-sm"
      />
      <button type="submit" disabled={busy} className="text-xs rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-medium px-3 py-1.5">
        {busy ? 'Adding…' : 'Add'}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-500 dark:text-zinc-400 hover:underline">Cancel</button>
      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
    </form>
  )
}

function StageManager({ pipeline, onChanged }: { pipeline: Pipeline; onChanged: () => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function addStage(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await fetch(`/api/bario-one/crm/pipelines/${pipeline.id}/stages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      setName('')
      onChanged()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function removeStage(stageId: string) {
    const res = await fetch(`/api/bario-one/crm/pipelines/${pipeline.id}/stages/${stageId}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Something went wrong')
      return
    }
    onChanged()
  }

  return (
    <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4 space-y-3 mb-4 max-w-lg">
      <p className="text-sm font-semibold">Stages in &ldquo;{pipeline.name}&rdquo;</p>
      <div className="space-y-1">
        {pipeline.stages.map((s) => (
          <div key={s.id} className="flex items-center justify-between text-sm rounded-lg border border-slate-200 dark:border-zinc-800 px-3 py-1.5">
            <span>{s.name}</span>
            <button onClick={() => removeStage(s.id)} className="text-xs text-red-600 dark:text-red-400 hover:underline">Remove</button>
          </div>
        ))}
      </div>
      <form onSubmit={addStage} className="flex items-center gap-2">
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="New stage name" className="flex-1 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-2 py-1 text-sm" />
        <button type="submit" disabled={busy} className="text-xs rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-medium px-3 py-1.5">
          {busy ? 'Adding…' : '+ Add stage'}
        </button>
      </form>
      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
    </div>
  )
}

function DealCardBody({
  deal,
  stages,
  dealFields,
  expandedId,
  setExpandedId,
  onMoveStage,
  onDateChange,
  onCustomField,
}: {
  deal: Deal
  stages: Stage[]
  dealFields: FieldDef[]
  expandedId: string | null
  setExpandedId: (id: string | null) => void
  onMoveStage: (id: string, stage: string) => void
  onDateChange: (id: string, date: string) => void
  onCustomField: (id: string, fieldId: string, value: unknown) => void
}) {
  return (
    <>
      <p className="text-sm font-semibold">{deal.title}</p>
      <p className="text-xs text-slate-500 dark:text-zinc-400">{deal.contact_name}{deal.company_name ? ` — ${deal.company_name}` : ''}</p>
      {deal.value_cents > 0 && <p className="text-xs font-medium">${(deal.value_cents / 100).toLocaleString()}</p>}
      <select
        value={deal.stage}
        onChange={(e) => onMoveStage(deal.id, e.target.value)}
        className="w-full text-xs rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-2 py-1"
      >
        {stages.map((s) => (
          <option key={s.key} value={s.key}>{s.name}</option>
        ))}
      </select>
      <input
        type="date"
        value={deal.expected_close_date ? deal.expected_close_date.slice(0, 10) : ''}
        onChange={(e) => onDateChange(deal.id, e.target.value)}
        className="w-full text-xs rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-2 py-1"
      />
      {dealFields.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setExpandedId(expandedId === deal.id ? null : deal.id)}
            className="text-xs text-amber-600 dark:text-[#d4af37] hover:underline"
          >
            {expandedId === deal.id ? 'Hide fields' : 'Custom fields'}
          </button>
          {expandedId === deal.id && (
            <BarioOneCustomFieldInputs fields={dealFields} values={deal.customFields} onChange={(fieldId, value) => onCustomField(deal.id, fieldId, value)} />
          )}
        </>
      )}
    </>
  )
}

function CalendarView({ deals }: { deals: Deal[] }) {
  const [monthOffset, setMonthOffset] = useState(0)
  const now = new Date()
  const viewDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstWeekday = new Date(year, month, 1).getDay()
  const monthLabel = viewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  const byDay = new Map<number, Deal[]>()
  const unscheduled: Deal[] = []
  for (const d of deals) {
    if (!d.expected_close_date) {
      unscheduled.push(d)
      continue
    }
    const dt = new Date(d.expected_close_date)
    if (dt.getFullYear() === year && dt.getMonth() === month) {
      const day = dt.getDate()
      byDay.set(day, [...(byDay.get(day) ?? []), d])
    }
  }

  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => setMonthOffset((m) => m - 1)} className="text-sm px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800">← Prev</button>
        <p className="font-semibold">{monthLabel}</p>
        <button onClick={() => setMonthOffset((m) => m + 1)} className="text-sm px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800">Next →</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-500 dark:text-zinc-400">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => (
          <div key={i} className={`min-h-[70px] rounded-lg border p-1 text-xs ${day ? 'border-slate-200 dark:border-zinc-800' : 'border-transparent'}`}>
            {day && (
              <>
                <p className="text-slate-400 mb-1">{day}</p>
                {(byDay.get(day) ?? []).map((d) => (
                  <div key={d.id} className="rounded bg-amber-500/10 text-amber-700 dark:text-[#d4af37] px-1 py-0.5 mb-0.5 truncate" title={d.title}>
                    {d.title}
                  </div>
                ))}
              </>
            )}
          </div>
        ))}
      </div>
      {unscheduled.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400 mb-2">Unscheduled ({unscheduled.length})</p>
          <div className="flex flex-wrap gap-2">
            {unscheduled.map((d) => (
              <span key={d.id} className="text-xs rounded-full bg-slate-100 dark:bg-zinc-800 px-2 py-1">{d.title}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function BarioOneCrmPipeline() {
  const [pipelines, setPipelines] = useState<Pipeline[] | null>(null)
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null)
  const [deals, setDeals] = useState<Deal[] | null>(null)
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [dealFields, setDealFields] = useState<FieldDef[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [view, setView] = useState<View>('kanban')
  const [showStageManager, setShowStageManager] = useState(false)

  async function loadPipelines(preferId?: string) {
    const res = await fetch('/api/bario-one/crm/pipelines')
    const data = await res.json()
    const list: Pipeline[] = data.pipelines ?? []
    setPipelines(list)
    if (list.length > 0) {
      const preferred = preferId ?? selectedPipelineId
      const stillExists = preferred && list.some((p) => p.id === preferred)
      setSelectedPipelineId(stillExists ? preferred! : (list.find((p) => p.is_default) ?? list[0]).id)
    }
  }

  async function loadDeals(pipelineId: string) {
    const res = await fetch(`/api/bario-one/crm/deals?pipelineId=${pipelineId}`)
    const data = await res.json()
    setDeals(data.deals ?? [])
  }

  async function loadCustomers() {
    const res = await fetch('/api/bario-one/crm/customers')
    const data = await res.json()
    setCustomers(data.customers ?? [])
  }

  async function loadDealFields() {
    const res = await fetch('/api/bario-one/crm/custom-fields?entityType=deal')
    const data = await res.json()
    setDealFields(data.fields ?? [])
  }

  useEffect(() => {
    loadPipelines()
    loadCustomers()
    loadDealFields()
  }, [])

  useEffect(() => {
    if (selectedPipelineId) loadDeals(selectedPipelineId)
  }, [selectedPipelineId])

  async function moveStage(id: string, stage: string) {
    setDeals((prev) => prev?.map((d) => (d.id === id ? { ...d, stage } : d)) ?? null)
    await fetch(`/api/bario-one/crm/deals/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stage }),
    })
  }

  async function changeDate(id: string, date: string) {
    setDeals((prev) => prev?.map((d) => (d.id === id ? { ...d, expected_close_date: date || null } : d)) ?? null)
    await fetch(`/api/bario-one/crm/deals/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expectedCloseDate: date || null }),
    })
  }

  async function saveDealCustomField(id: string, fieldId: string, value: unknown) {
    setDeals((prev) => prev?.map((d) => (d.id === id ? { ...d, customFields: { ...d.customFields, [fieldId]: value } } : d)) ?? null)
    await fetch(`/api/bario-one/crm/deals/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ customFields: { [fieldId]: value } }),
    })
  }

  if (pipelines === null || deals === null) return <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>

  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId) ?? pipelines[0]
  const stages = selectedPipeline?.stages ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <select
            value={selectedPipelineId ?? ''}
            onChange={(e) => setSelectedPipelineId(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm font-medium"
          >
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <AddPipelineForm onAdded={() => loadPipelines()} />
          <button onClick={() => setShowStageManager((s) => !s)} className="text-sm font-medium text-amber-600 dark:text-[#d4af37] hover:underline">
            {showStageManager ? 'Hide stages' : 'Manage stages'}
          </button>
        </div>
        <div className="flex gap-1 rounded-lg border border-slate-300 dark:border-zinc-700 p-1">
          {(['kanban', 'list', 'calendar'] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`text-xs font-medium px-3 py-1.5 rounded-md capitalize ${view === v ? 'bg-amber-500 text-white' : 'text-slate-500 dark:text-zinc-400'}`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {showStageManager && selectedPipeline && <StageManager pipeline={selectedPipeline} onChanged={() => loadPipelines(selectedPipelineId ?? undefined)} />}

      <AddDealForm customers={customers} dealFields={dealFields} pipelineId={selectedPipelineId} onAdded={() => selectedPipelineId && loadDeals(selectedPipelineId)} />

      {view === 'kanban' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {stages.map((stage) => (
            <div key={stage.id} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">
                {stage.name} ({deals.filter((d) => d.stage === stage.key).length})
              </p>
              <div className="space-y-2 min-h-[80px]">
                {deals
                  .filter((d) => d.stage === stage.key)
                  .map((d) => (
                    <div key={d.id} className="rounded-xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-3 space-y-2">
                      <DealCardBody
                        deal={d}
                        stages={stages}
                        dealFields={dealFields}
                        expandedId={expandedId}
                        setExpandedId={setExpandedId}
                        onMoveStage={moveStage}
                        onDateChange={changeDate}
                        onCustomField={saveDealCustomField}
                      />
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {view === 'list' && (
        <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] divide-y divide-slate-200 dark:divide-zinc-800">
          {deals.length === 0 && <p className="text-sm text-slate-500 dark:text-zinc-400 p-4">No deals in this pipeline yet.</p>}
          {deals.map((d) => (
            <div key={d.id} className="p-4 space-y-2">
              <DealCardBody
                deal={d}
                stages={stages}
                dealFields={dealFields}
                expandedId={expandedId}
                setExpandedId={setExpandedId}
                onMoveStage={moveStage}
                onDateChange={changeDate}
                onCustomField={saveDealCustomField}
              />
            </div>
          ))}
        </div>
      )}

      {view === 'calendar' && <CalendarView deals={deals} />}
    </div>
  )
}
