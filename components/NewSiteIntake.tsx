'use client'

import { useState } from 'react'
import { uploadFile } from '@/lib/clientUpload'
import { STYLE_PRESETS, STYLE_PRESET_KEYS, type StylePresetKey } from '@/lib/stylePresets'

type Attachment = { url: string; kind: 'image' | 'video' | 'audio'; name: string }

// Shown once, in place of the bare prompt box, when a site is genuinely
// blank (no sections yet) — fills in the business context / style /
// logo the generation pipeline already knows how to use (see
// lib/builderPrompt.ts), instead of Sky having to guess everything from
// one free-text message. Purely additive: "Skip" reproduces the exact
// prior one-box experience.
export default function NewSiteIntake({
  businessName, setBusinessName,
  businessCategory, setBusinessCategory,
  businessLocation, setBusinessLocation,
  businessHours, setBusinessHours,
  onBuild,
  onSkip,
}: {
  businessName: string
  setBusinessName: (v: string) => void
  businessCategory: string
  setBusinessCategory: (v: string) => void
  businessLocation: string
  setBusinessLocation: (v: string) => void
  businessHours: string
  setBusinessHours: (v: string) => void
  onBuild: (prompt: string, styleKey: StylePresetKey | null, logo: Attachment | null) => void
  onSkip: () => void
}) {
  const [prompt, setPrompt] = useState('')
  const [styleKey, setStyleKey] = useState<StylePresetKey | null>(null)
  const [logo, setLogo] = useState<Attachment | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  async function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setUploadError('Logo must be an image file')
      return
    }
    setUploading(true)
    setUploadError(null)
    try {
      const blob = await uploadFile(file)
      setLogo({ url: blob.url, kind: 'image', name: file.name })
    } catch (err: any) {
      setUploadError(err.message ?? 'Upload failed')
    }
    setUploading(false)
  }

  const canBuild = prompt.trim().length > 0

  return (
    <div className="flex-1 flex items-center justify-center p-6 overflow-y-auto">
      <div className="w-full max-w-lg">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Let's build your site</h2>
        <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 mb-4">
          A few quick details help Sky get your first draft much closer to right — all optional except the description.
        </p>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 dark:text-zinc-400 mb-1">Business name</label>
              <input
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. Riverside Coffee Roasters"
                className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 dark:bg-[#0b111c] dark:border-zinc-700 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-zinc-400 mb-1">Category</label>
              <input
                value={businessCategory}
                onChange={(e) => setBusinessCategory(e.target.value)}
                placeholder="e.g. Coffee shop & roastery"
                className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 dark:bg-[#0b111c] dark:border-zinc-700 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-zinc-400 mb-1">Location</label>
              <input
                value={businessLocation}
                onChange={(e) => setBusinessLocation(e.target.value)}
                placeholder="e.g. Edmonton, AB"
                className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 dark:bg-[#0b111c] dark:border-zinc-700 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-zinc-400 mb-1">Hours</label>
              <input
                value={businessHours}
                onChange={(e) => setBusinessHours(e.target.value)}
                placeholder="e.g. Mon–Fri 7am–5pm"
                className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 dark:bg-[#0b111c] dark:border-zinc-700 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-500 dark:text-zinc-400 mb-1">Style</label>
            <div className="grid grid-cols-5 gap-1.5">
              {STYLE_PRESET_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStyleKey(styleKey === key ? null : key)}
                  title={STYLE_PRESETS[key].vibe}
                  className={`px-2 py-2 rounded-lg border text-[11px] font-semibold text-center ${
                    styleKey === key
                      ? 'border-[#1a56db] bg-[#1a56db]/10 text-[#1a56db]'
                      : 'border-slate-300 dark:border-zinc-700 text-slate-600 dark:text-zinc-400'
                  }`}
                >
                  {STYLE_PRESETS[key].label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-1">Leave unselected and Sky will pick a fit automatically.</p>
          </div>

          <div>
            <label className="block text-xs text-slate-500 dark:text-zinc-400 mb-1">Logo (optional)</label>
            {logo ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 dark:bg-[#0b111c] dark:border-zinc-700 text-sm">
                <span>🖼️</span>
                <span className="truncate flex-1 text-slate-700 dark:text-zinc-300">{logo.name}</span>
                <button onClick={() => setLogo(null)} className="text-slate-400 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-300">✕</button>
              </div>
            ) : (
              <label className="flex items-center justify-center px-3 py-2 rounded-lg border border-dashed border-slate-300 dark:border-zinc-700 text-xs text-slate-500 dark:text-zinc-400 cursor-pointer">
                {uploading ? 'Uploading…' : 'Upload a logo image'}
                <input type="file" accept="image/*" className="hidden" onChange={handleLogoFile} disabled={uploading} />
              </label>
            )}
            {uploadError && <p className="text-[11px] text-red-500 dark:text-red-400 mt-1">{uploadError}</p>}
          </div>

          <div>
            <label className="block text-xs text-slate-500 dark:text-zinc-400 mb-1">Describe your business</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="What does your business do, and what should the site include?"
              rows={3}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 dark:bg-[#0b111c] dark:border-zinc-700 text-sm resize-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-between mt-5">
          <button onClick={onSkip} className="text-xs text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300 underline">
            Skip, just let me type
          </button>
          <button
            onClick={() => canBuild && onBuild(prompt, styleKey, logo)}
            disabled={!canBuild || uploading}
            className="px-4 py-2 rounded-xl bg-[#1a56db] text-white text-sm font-semibold disabled:opacity-50"
          >
            Build my site
          </button>
        </div>
      </div>
    </div>
  )
}
