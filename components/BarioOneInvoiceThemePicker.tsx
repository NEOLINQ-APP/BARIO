'use client'

import { useEffect, useState } from 'react'

const THEMES = [
  { key: 'classic', label: 'Classic', description: 'Traditional left-aligned letterhead, subtle accent color.' },
  { key: 'modern', label: 'Modern', description: 'Centered logo and business name, clean spacing.' },
  { key: 'bold', label: 'Bold', description: 'A solid color band across the header using your accent color.' },
  { key: 'minimal', label: 'Minimal', description: 'No accent color, just clean type.' },
] as const

type FieldToggles = { showTaxNumber: boolean; showDueDate: boolean; showNotes: boolean; showBusinessAddress: boolean }

export default function BarioOneInvoiceThemePicker() {
  const [themeKey, setThemeKey] = useState<string>('classic')
  const [primaryColor, setPrimaryColor] = useState('#d4af37')
  const [toggles, setToggles] = useState<FieldToggles>({ showTaxNumber: true, showDueDate: true, showNotes: true, showBusinessAddress: true })
  const [loading, setLoading] = useState(true)
  const [canEdit, setCanEdit] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/bario-one/organization')
      .then((r) => r.json())
      .then((data) => {
        if (data.org) {
          setThemeKey(data.org.invoiceThemeKey ?? 'classic')
          setPrimaryColor(data.org.brandingPrimaryColor ?? '#d4af37')
          setToggles({ ...toggles, ...(data.org.invoiceFieldToggles ?? {}) })
          setCanEdit(data.myRole === 'owner' || data.myRole === 'admin')
        }
        setLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function save(patch: { themeKey?: string; primaryColor?: string; fieldToggles?: Partial<FieldToggles> }) {
    setSaving(true)
    setSaved(false)
    try {
      await fetch('/api/bario-one/organization/theme', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      })
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  function pickTheme(key: string) {
    setThemeKey(key)
    save({ themeKey: key })
  }

  function pickColor(color: string) {
    setPrimaryColor(color)
    save({ primaryColor: color })
  }

  function toggleField(field: keyof FieldToggles) {
    const next = { ...toggles, [field]: !toggles[field] }
    setToggles(next)
    save({ fieldToggles: next })
  }

  if (loading) return <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold mb-2">Layout</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {THEMES.map((t) => (
            <button
              key={t.key}
              type="button"
              disabled={!canEdit}
              onClick={() => pickTheme(t.key)}
              className={`text-left rounded-xl border p-3 disabled:opacity-60 ${
                themeKey === t.key
                  ? 'border-amber-500 dark:border-[#d4af37] ring-1 ring-amber-500 dark:ring-[#d4af37]'
                  : 'border-slate-300 dark:border-zinc-700'
              }`}
            >
              <p className="text-sm font-semibold">{t.label}</p>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">{t.description}</p>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold mb-2">Accent color</p>
        <input
          type="color"
          disabled={!canEdit}
          value={primaryColor}
          onChange={(e) => pickColor(e.target.value)}
          className="h-10 w-16 rounded border border-slate-300 dark:border-zinc-700 disabled:opacity-60"
        />
      </div>

      <div>
        <p className="text-sm font-semibold mb-2">Show on documents</p>
        <div className="space-y-2">
          {([
            ['showBusinessAddress', 'Business address'],
            ['showTaxNumber', 'Tax number'],
            ['showDueDate', 'Due date'],
            ['showNotes', 'Notes'],
          ] as const).map(([field, label]) => (
            <label key={field} className="flex items-center gap-2 text-sm">
              <input type="checkbox" disabled={!canEdit} checked={toggles[field]} onChange={() => toggleField(field)} className="w-4 h-4" />
              {label}
            </label>
          ))}
        </div>
      </div>

      {saving && <p className="text-xs text-slate-500 dark:text-zinc-400">Saving…</p>}
      {!saving && saved && <p className="text-xs text-emerald-600 dark:text-emerald-400">Saved</p>}
    </div>
  )
}
