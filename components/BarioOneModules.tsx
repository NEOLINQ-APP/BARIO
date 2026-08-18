'use client'

import { useEffect, useState } from 'react'
import { BO_MODULE_KEYS, BO_MODULES, resolveModuleDependencies, type BoModuleKey } from '@/lib/barioOneModules'

type OrgInfo = { enabledModules: string[]; hasLiveBilling: boolean } | null

export default function BarioOneModules() {
  const [org, setOrg] = useState<OrgInfo>(undefined as any)
  const [selected, setSelected] = useState<BoModuleKey[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function load() {
    const res = await fetch('/api/bario-one/organization')
    const data = await res.json()
    setOrg(data.org)
    if (data.org) setSelected(data.org.enabledModules)
  }

  useEffect(() => {
    load()
  }, [])

  if (org === undefined) return <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>
  if (org === null) return <p className="text-sm text-red-500 dark:text-red-400">Set up Bario One for your business first.</p>

  const resolvedSelected = resolveModuleDependencies(selected)
  const totalCents = resolvedSelected.reduce((sum, key) => sum + BO_MODULES[key].priceCentsCad, 0)
  const currentEnabled = org.enabledModules as BoModuleKey[]
  const hasChanges = JSON.stringify([...resolvedSelected].sort()) !== JSON.stringify([...currentEnabled].sort())

  function toggle(key: BoModuleKey) {
    setSuccess(null)
    setSelected((prev) => {
      const isOn = resolveModuleDependencies(prev).includes(key)
      if (isOn) {
        // Turning off a module also turns off anything that depends on it.
        const withoutIt = prev.filter((k) => k !== key)
        return withoutIt.filter((k) => !BO_MODULES[k].requires.includes(key))
      }
      return [...prev, key]
    })
  }

  async function save() {
    if (!org) return
    setError(null)
    setSuccess(null)
    setBusy(true)
    try {
      if (resolvedSelected.length === 0) {
        throw new Error('Select at least one module')
      }
      const path = org.hasLiveBilling ? '/api/bario-one/modules/update' : '/api/bario-one/modules/checkout'
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ moduleKeys: resolvedSelected }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      if (data.url) {
        window.location.href = data.url
        return
      }
      setSuccess('Your modules have been updated.')
      await load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-slate-500 dark:text-zinc-400">
        Turn on exactly what your business needs — pricing is per module, and you can add or remove any time.
        {!org.hasLiveBilling && ' Adding a card here extends your free trial to 30 days total before your first real charge.'}
      </p>

      <div className="space-y-2">
        {BO_MODULE_KEYS.map((key) => {
          const module = BO_MODULES[key]
          const isOn = resolvedSelected.includes(key)
          const isAutoIncluded = isOn && !selected.includes(key)
          const wasAlreadyEnabled = currentEnabled.includes(key)
          return (
            <label
              key={key}
              className={`flex items-center justify-between gap-4 rounded-2xl border p-4 cursor-pointer transition-colors ${
                isOn
                  ? 'border-amber-500 dark:border-[#d4af37] bg-amber-500/5 dark:bg-[#d4af37]/5'
                  : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#131b2a]'
              }`}
            >
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={isOn}
                  disabled={isAutoIncluded}
                  onChange={() => toggle(key)}
                  className="h-4 w-4"
                />
                <div>
                  <p className="font-semibold text-sm">
                    {module.name}
                    {wasAlreadyEnabled && <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Active</span>}
                    {isAutoIncluded && <span className="ml-2 text-[10px] text-slate-400">required by another module</span>}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">{module.description}</p>
                </div>
              </div>
              <p className="text-sm font-semibold whitespace-nowrap">${(module.priceCentsCad / 100).toFixed(0)}/mo</p>
            </label>
          )
        })}
      </div>

      <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm text-slate-500 dark:text-zinc-400">Total</p>
          <p className="text-2xl font-extrabold">${(totalCents / 100).toFixed(0)}<span className="text-sm font-medium text-slate-400">/mo CAD</span></p>
        </div>
        {error && <p className="text-xs text-red-500 dark:text-red-400 w-full">{error}</p>}
        {success && <p className="text-xs text-emerald-600 dark:text-emerald-400 w-full">{success}</p>}
        <button
          onClick={save}
          disabled={busy || !hasChanges}
          className="rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white font-semibold text-sm px-5 py-2.5"
        >
          {busy ? 'Saving…' : org.hasLiveBilling ? 'Save changes' : 'Start billing'}
        </button>
      </div>
    </div>
  )
}
