'use client'

import { useEffect, useState } from 'react'

type FieldDef = { id: string; name: string; field_type: string; options: string[] }
type Entity = 'customer' | 'deal'

const TYPE_LABEL: Record<string, string> = { text: 'Text', number: 'Number', date: 'Date', select: 'Dropdown', checkbox: 'Checkbox' }

function EntitySection({ entityType, label }: { entityType: Entity; label: string }) {
  const [fields, setFields] = useState<FieldDef[] | null>(null)
  const [name, setName] = useState('')
  const [fieldType, setFieldType] = useState('text')
  const [optionsText, setOptionsText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const res = await fetch(`/api/bario-one/crm/custom-fields?entityType=${entityType}`)
    const data = await res.json()
    setFields(data.fields ?? [])
  }

  useEffect(() => {
    load()
  }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const options = optionsText.split(',').map((o) => o.trim()).filter(Boolean)
      const res = await fetch('/api/bario-one/crm/custom-fields', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entityType, name, fieldType, options }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      setName('')
      setFieldType('text')
      setOptionsText('')
      load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    await fetch(`/api/bario-one/crm/custom-fields/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4 space-y-4">
      <h2 className="font-bold">{label} fields</h2>

      {fields === null ? (
        <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>
      ) : fields.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-zinc-400">No custom fields yet.</p>
      ) : (
        <div className="space-y-2">
          {fields.map((f) => (
            <div key={f.id} className="flex items-center justify-between text-sm rounded-lg border border-slate-200 dark:border-zinc-800 px-3 py-2">
              <div>
                <span className="font-medium">{f.name}</span>
                <span className="text-xs text-slate-500 dark:text-zinc-400 ml-2">
                  {TYPE_LABEL[f.field_type] ?? f.field_type}
                  {f.field_type === 'select' && f.options.length > 0 ? ` (${f.options.join(', ')})` : ''}
                </span>
              </div>
              <button onClick={() => remove(f.id)} className="text-xs text-red-600 dark:text-red-400 hover:underline">Remove</button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleAdd} className="space-y-2 pt-2 border-t border-slate-100 dark:border-zinc-900">
        <div className="flex flex-wrap gap-2">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Field name (e.g. Industry)"
            className="flex-1 min-w-[160px] rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm"
          />
          <select
            value={fieldType}
            onChange={(e) => setFieldType(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm"
          >
            {Object.entries(TYPE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        {fieldType === 'select' && (
          <input
            value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)}
            placeholder="Options, comma-separated (e.g. Small, Medium, Large)"
            className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm"
          />
        )}
        {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
        <button type="submit" disabled={busy} className="rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2">
          {busy ? 'Adding…' : `+ Add ${label.toLowerCase()} field`}
        </button>
      </form>
    </div>
  )
}

export default function BarioOneCustomFields() {
  return (
    <div className="max-w-2xl space-y-6">
      <p className="text-sm text-slate-500 dark:text-zinc-400">
        Add your own fields to track whatever matters for your business — shows up on every customer or deal.
      </p>
      <EntitySection entityType="customer" label="Customer" />
      <EntitySection entityType="deal" label="Deal" />
    </div>
  )
}
