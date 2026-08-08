'use client'

type FieldDef = { id: string; name: string; field_type: 'text' | 'number' | 'date' | 'select' | 'checkbox'; options: string[] }

export default function BarioOneCustomFieldInputs({
  fields,
  values,
  onChange,
}: {
  fields: FieldDef[]
  values: Record<string, unknown>
  onChange: (fieldId: string, value: unknown) => void
}) {
  if (fields.length === 0) return null

  return (
    <div className="space-y-2">
      {fields.map((f) => {
        const value = values[f.id]
        return (
          <div key={f.id} className="flex items-center justify-between gap-3 text-sm">
            <label className="text-slate-500 dark:text-zinc-400 shrink-0">{f.name}</label>
            {f.field_type === 'checkbox' ? (
              <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(f.id, e.target.checked)} className="h-4 w-4" />
            ) : f.field_type === 'select' ? (
              <select
                value={typeof value === 'string' ? value : ''}
                onChange={(e) => onChange(f.id, e.target.value)}
                className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-2 py-1 text-sm"
              >
                <option value="">—</option>
                {f.options.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            ) : (
              <input
                type={f.field_type === 'number' ? 'number' : f.field_type === 'date' ? 'date' : 'text'}
                value={value === null || value === undefined ? '' : String(value)}
                onChange={(e) => onChange(f.id, e.target.value)}
                className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-2 py-1 text-sm text-right"
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
