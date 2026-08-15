'use client'

import { useEffect, useRef, useState } from 'react'

type OrgInfo = {
  brandingLogoUrl: string | null
  businessAddress: string | null
  businessPhone: string | null
  businessEmail: string | null
  taxNumber: string | null
}

export default function BarioOneCompanySettings() {
  const [org, setOrg] = useState<OrgInfo | null>(null)
  const [myRole, setMyRole] = useState<string>('employee')
  const [loading, setLoading] = useState(true)

  const [businessAddress, setBusinessAddress] = useState('')
  const [businessPhone, setBusinessPhone] = useState('')
  const [businessEmail, setBusinessEmail] = useState('')
  const [taxNumber, setTaxNumber] = useState('')

  const [savingInfo, setSavingInfo] = useState(false)
  const [infoSaved, setInfoSaved] = useState(false)
  const [infoError, setInfoError] = useState<string | null>(null)

  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [logoError, setLogoError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/bario-one/organization')
      .then((r) => r.json())
      .then((data) => {
        if (data.org) {
          setOrg(data.org)
          setMyRole(data.myRole ?? 'employee')
          setBusinessAddress(data.org.businessAddress ?? '')
          setBusinessPhone(data.org.businessPhone ?? '')
          setBusinessEmail(data.org.businessEmail ?? '')
          setTaxNumber(data.org.taxNumber ?? '')
        }
        setLoading(false)
      })
  }, [])

  const canEdit = myRole === 'owner' || myRole === 'admin'

  async function handleSaveInfo(e: React.FormEvent) {
    e.preventDefault()
    setInfoError(null)
    setInfoSaved(false)
    setSavingInfo(true)
    try {
      const res = await fetch('/api/bario-one/organization/branding', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ businessAddress, businessPhone, businessEmail, taxNumber }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      setInfoSaved(true)
    } catch (err: any) {
      setInfoError(err.message)
    } finally {
      setSavingInfo(false)
    }
  }

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoError(null)
    setUploadingLogo(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/bario-one/organization/logo', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      setOrg((prev) => (prev ? { ...prev, brandingLogoUrl: data.url } : prev))
    } catch (err: any) {
      setLogoError(err.message)
    } finally {
      setUploadingLogo(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  if (loading) return <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>
  if (!org) return <p className="text-sm text-slate-500 dark:text-zinc-400">Set up Bario One first.</p>

  const inputClass =
    'w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm disabled:opacity-60'

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-bold">Logo</h2>
        <p className="text-sm text-slate-500 dark:text-zinc-400">
          Shown on every estimate, quote, invoice, and work order you send.
        </p>
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-xl border border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-[#0b111c] flex items-center justify-center overflow-hidden">
            {org.brandingLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={org.brandingLogoUrl} alt="Company logo" className="max-w-full max-h-full object-contain" />
            ) : (
              <span className="text-xs text-slate-400 dark:text-zinc-600">No logo</span>
            )}
          </div>
          {canEdit && (
            <div>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoChange} disabled={uploadingLogo} className="text-sm" />
              {uploadingLogo && <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">Uploading…</p>}
              {logoError && <p className="text-xs text-red-500 mt-1">{logoError}</p>}
            </div>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Business info</h2>
        <p className="text-sm text-slate-500 dark:text-zinc-400">
          Appears in the "From" section of every document you send.
        </p>
        <form onSubmit={handleSaveInfo} className="space-y-3 max-w-md">
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-zinc-400">Business address</label>
            <textarea
              disabled={!canEdit}
              value={businessAddress}
              onChange={(e) => setBusinessAddress(e.target.value)}
              rows={2}
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-zinc-400">Business phone</label>
            <input disabled={!canEdit} value={businessPhone} onChange={(e) => setBusinessPhone(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-zinc-400">Business email</label>
            <input
              type="email"
              disabled={!canEdit}
              value={businessEmail}
              onChange={(e) => setBusinessEmail(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-zinc-400">Tax number (GST/HST etc.)</label>
            <input disabled={!canEdit} value={taxNumber} onChange={(e) => setTaxNumber(e.target.value)} className={inputClass} />
          </div>
          {canEdit && (
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={savingInfo}
                className="rounded-lg bg-amber-600 dark:bg-[#d4af37] hover:opacity-90 disabled:opacity-50 text-white dark:text-black font-semibold text-sm px-4 py-2.5"
              >
                {savingInfo ? 'Saving…' : 'Save'}
              </button>
              {infoSaved && <span className="text-xs text-emerald-600 dark:text-emerald-400">Saved</span>}
              {infoError && <span className="text-xs text-red-500">{infoError}</span>}
            </div>
          )}
        </form>
      </section>
    </div>
  )
}
