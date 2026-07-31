'use client'

// Static design mode (build-order step 5 of the approved Studio Ecosystem
// plan): social post/story templates, using the same @openvideo/core +
// engine-pixi Studio engine as the video editor, just with no
// timeline/playback — a fixed-size canvas exported as a single PNG via
// Studio.snapshot() (already proven working for live preview; much simpler
// than the video Compositor export path, which has a known Text-rendering
// limitation — snapshot() captures whatever Studio already renders live,
// so that limitation doesn't apply here).
//
// Business cards/brochures/signs and real print-ready (CMYK/bleed/PDF)
// export are a deliberately separate, later step — these presets are all
// screen/digital formats only.

import { useEffect, useRef, useState } from 'react'
import { Core } from '@openvideo/core'
import { Studio } from '@openvideo/engine-pixi'

const TEMPLATES = [
  { id: 'ig-post', label: 'Instagram Post', width: 1080, height: 1080 },
  { id: 'ig-story', label: 'Instagram/TikTok Story', width: 1080, height: 1920 },
  { id: 'fb-post', label: 'Facebook Post', width: 1200, height: 630 },
  { id: 'x-post', label: 'X (Twitter) Post', width: 1600, height: 900 },
] as const

type Template = (typeof TEMPLATES)[number]
type ClipSummary = { id: string; type: string; name: string }

// Owns one canvas + Core + Studio for exactly one template. Keyed by
// template.id at the call site so switching templates fully unmounts this
// (fresh <canvas> DOM node, fresh WebGL context) rather than recreating a
// PixiJS Application on a reused canvas element — the latter hung the
// entire tab in testing (real WebGL context-reuse bug, not just a UI glitch).
function DesignCanvasSession({ template }: { template: Template }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const coreRef = useRef<Core | null>(null)
  const studioRef = useRef<Studio | null>(null)
  const [ready, setReady] = useState(false)
  const [clips, setClips] = useState<ClipSummary[]>([])
  const [text, setText] = useState('')
  const [exportUrl, setExportUrl] = useState<string | null>(null)
  const [exportBusy, setExportBusy] = useState(false)

  useEffect(() => {
    if (!canvasRef.current) return
    const core = new Core({ settings: { width: template.width, height: template.height, fps: 30, duration: 0 } })
    coreRef.current = core

    const studio = new Studio({ width: template.width, height: template.height, canvas: canvasRef.current, core })
    studioRef.current = studio
    studio.ready.then(() => setReady(true))

    const unsubscribe = core.store.subscribe((state) => {
      setClips(Object.values(state.clips).map((c: any) => ({ id: c.id, type: c.type, name: c.name || c.type })))
    })

    return () => {
      unsubscribe()
      studio.destroy()
    }
  }, [template])

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    const core = coreRef.current
    if (!file || !core) return
    const objectUrl = URL.createObjectURL(file)
    await core.clip.add({ type: 'Image', src: objectUrl, name: file.name })
    e.target.value = ''
  }

  async function handleAddText() {
    const core = coreRef.current
    if (!core || !text.trim()) return
    await core.clip.add({
      type: 'Text',
      text: text.trim(),
      name: text.trim().slice(0, 40),
      style: { fontSize: 64, color: '#ffffff', align: 'center' },
    } as any)
    setText('')
  }

  function removeClip(id: string) {
    coreRef.current?.clip.remove([id])
  }

  async function handleExportPng() {
    const studio = studioRef.current
    if (!studio) return
    setExportBusy(true)
    try {
      const dataUrl = await studio.snapshot()
      setExportUrl(dataUrl)
    } finally {
      setExportBusy(false)
    }
  }

  return (
    <div className="grid md:grid-cols-[1fr_320px] gap-6">
      <div className="space-y-3">
        <canvas ref={canvasRef} className="w-full max-w-lg border border-slate-300 dark:border-zinc-700 rounded-lg bg-black" />

        <div className="rounded-lg border border-slate-300 dark:border-zinc-700 p-3">
          <p className="text-xs font-medium mb-2">Layers ({clips.length})</p>
          {clips.length === 0 && <p className="text-xs text-slate-400">No layers yet — add an image or text.</p>}
          <ul className="space-y-1">
            {clips.map((c) => (
              <li key={c.id} className="flex items-center justify-between text-xs">
                <span>{c.type}: {c.name}</span>
                <button onClick={() => removeClip(c.id)} className="text-red-500 hover:underline">Remove</button>
              </li>
            ))}
          </ul>
        </div>

        <button
          onClick={handleExportPng}
          disabled={!ready || clips.length === 0 || exportBusy}
          className="rounded-lg bg-slate-800 dark:bg-zinc-700 text-white text-sm px-4 py-2 disabled:opacity-50"
        >
          {exportBusy ? 'Exporting…' : 'Export PNG'}
        </button>
        {exportUrl && (
          <div className="space-y-1">
            <img src={exportUrl} alt="Export preview" className="w-full max-w-lg rounded-lg border border-slate-300 dark:border-zinc-700" />
            <a href={exportUrl} download={`bario-design-${template.id}.png`} className="text-xs text-amber-600 dark:text-[#f59e0b] underline">
              Download
            </a>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4 space-y-4">
        <div>
          <label className="text-sm font-medium block mb-1">Add image</label>
          <input type="file" accept="image/*" onChange={handleImageUpload} className="text-sm" />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Add text</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Your headline"
            rows={3}
            className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm"
          />
          <button
            onClick={handleAddText}
            disabled={!text.trim()}
            className="w-full mt-2 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2"
          >
            Add text
          </button>
        </div>
      </div>
    </div>
  )
}

export default function StudioDesignEditor() {
  const [template, setTemplate] = useState<Template>(TEMPLATES[0])

  return (
    <div>
      <div className="flex gap-2 flex-wrap mb-3">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            onClick={() => setTemplate(t)}
            className={`text-sm font-medium px-3 py-1.5 rounded-lg ${template.id === t.id ? 'bg-amber-500 text-white' : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300'}`}
          >
            {t.label} ({t.width}×{t.height})
          </button>
        ))}
      </div>
      <DesignCanvasSession key={template.id} template={template} />
    </div>
  )
}
