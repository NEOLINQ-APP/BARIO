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
import { uploadFile } from '@/lib/clientUpload'
import { Core } from '@openvideo/core'
import { Studio } from '@openvideo/engine-pixi'

// Print dimensions include a standard 0.125in bleed on each side (content
// can extend to the trimmed edge with no visible white sliver) — this is
// the actual canvas size; there's no separate crop-mark overlay in this
// v1, callers should keep key content away from the outer ~0.125in.
// Signs use 100 DPI rather than 300 — real print-industry practice for
// large-format output viewed from a distance, not a corner cut; a 300 DPI
// canvas at true poster size would also be far too large for a browser
// canvas/WebGL texture to handle well.
const BLEED_IN = 0.125
function printSize(widthIn: number, heightIn: number, dpi: number) {
  const w = widthIn + BLEED_IN * 2
  const h = heightIn + BLEED_IN * 2
  return { width: Math.round(w * dpi), height: Math.round(h * dpi), widthIn: w, heightIn: h, dpi }
}

const TEMPLATES = [
  { id: 'ig-post', label: 'Instagram Post', width: 1080, height: 1080, category: 'social' as const },
  { id: 'ig-story', label: 'Instagram/TikTok Story', width: 1080, height: 1920, category: 'social' as const },
  { id: 'fb-post', label: 'Facebook Post', width: 1200, height: 630, category: 'social' as const },
  { id: 'x-post', label: 'X (Twitter) Post', width: 1600, height: 900, category: 'social' as const },
  { id: 'business-card', label: 'Business Card (3.5×2in)', ...printSize(3.5, 2, 300), category: 'print' as const },
  { id: 'flyer', label: 'Flyer / Brochure (Letter)', ...printSize(8.5, 11, 300), category: 'print' as const },
  { id: 'sign', label: 'Yard Sign (18×24in)', ...printSize(18, 24, 100), category: 'print' as const },
] as const

type Template = (typeof TEMPLATES)[number]
type ClipSummary = { id: string; type: string; name: string }
type ChatMessage = { role: 'user' | 'assistant'; content: string }

function DesignCopilotPanel({
  clips,
  addTextClip,
  addImageFromUrl,
}: {
  clips: ClipSummary[]
  addTextClip: (text: string) => Promise<void>
  addImageFromUrl: (url: string, name: string) => Promise<void>
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: 'Tell me what to add — a headline, or a photo to search for.' },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)

  async function runTool(name: string, args: any): Promise<string> {
    if (name === 'add_text_overlay') {
      await addTextClip(String(args.text || ''))
      return 'Added the text layer.'
    }
    if (name === 'search_stock_image') {
      const res = await fetch('/api/studio/stock-image', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: args.query }),
      })
      const data = await res.json()
      if (!res.ok) return `Couldn't find a photo for "${args.query}": ${data.error}`
      await addImageFromUrl(data.url, String(args.query || 'stock photo').slice(0, 40))
      return 'Added a matching photo.'
    }
    return `Unknown tool: ${name}`
  }

  async function handleSend() {
    const text = input.trim()
    if (!text || busy) return
    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: text }]
    setMessages(nextMessages)
    setInput('')
    setBusy(true)
    try {
      const clipsSummary = clips.length === 0 ? 'empty canvas' : clips.map((c) => `${c.type}: ${c.name}`).join('; ')
      const res = await fetch('/api/studio/copilot', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages, clipsSummary, mode: 'design' }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessages((m) => [...m, { role: 'assistant', content: data.error || 'Something went wrong.' }])
        return
      }
      for (const call of data.toolCalls || []) {
        const resultText = await runTool(call.name, call.args)
        setMessages((m) => [...m, { role: 'assistant', content: resultText }])
      }
      if (data.reply) setMessages((m) => [...m, { role: 'assistant', content: data.reply }])
    } catch (err: any) {
      setMessages((m) => [...m, { role: 'assistant', content: `Something went wrong: ${err.message}` }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col h-[420px]">
      <div className="flex-1 overflow-y-auto space-y-2 mb-3 pr-1">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`text-sm rounded-lg px-3 py-2 max-w-[90%] ${
              m.role === 'user' ? 'ml-auto bg-amber-500 text-white' : 'bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200'
            }`}
          >
            {m.content}
          </div>
        ))}
        {busy && <div className="text-xs text-slate-400 animate-pulse">Working…</div>}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="e.g. Add a photo of a cozy coffee shop"
          disabled={busy}
          className="flex-1 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm"
        />
        <button
          onClick={handleSend}
          disabled={busy || !input.trim()}
          className="rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2"
        >
          Send
        </button>
      </div>
    </div>
  )
}

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
  const [pdfExportUrl, setPdfExportUrl] = useState<string | null>(null)
  const [pdfExportBusy, setPdfExportBusy] = useState(false)
  const [sidebarTab, setSidebarTab] = useState<'assistant' | 'manual'>('assistant')
  const [uploadBusy, setUploadBusy] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)

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

  // Direct-to-Blob (same pattern as TemplateBuilder.tsx and StudioEditor.tsx)
  // — real persisted URL rather than an object URL that vanishes on refresh.
  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    const core = coreRef.current
    if (!file || !core) return
    setUploadError(null)
    setUploadBusy(true)
    try {
      const blob = await uploadFile(file)
      await core.clip.add({ type: 'Image', src: blob.url, name: file.name })
    } catch (err: any) {
      setUploadError(err.message)
    } finally {
      setUploadBusy(false)
      e.target.value = ''
    }
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

  async function addTextClipFor(text: string) {
    const core = coreRef.current
    if (!core) return
    await core.clip.add({
      type: 'Text',
      text,
      name: text.slice(0, 40),
      style: { fontSize: 64, color: '#ffffff', align: 'center' },
    } as any)
  }

  async function addImageFromUrl(url: string, name: string) {
    const core = coreRef.current
    if (!core) return
    await core.clip.add({ type: 'Image', src: url, name })
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

  // Print-ready PDF: pdf-lib pages are sized in points (1/72in) at the
  // template's true physical size (including bleed) — the embedded PNG's
  // own pixel resolution (300/100 DPI per printSize()) is what determines
  // sharpness, not the page's point-dimensions, so this comes out correctly
  // sized regardless. Honest caveat, not hidden: this embeds the canvas's
  // native RGB output, not a real CMYK-converted file — most online print
  // services accept and correctly convert high-res RGB themselves, but this
  // isn't a full press-ready color-managed pipeline.
  async function handleExportPdf() {
    const studio = studioRef.current
    if (!studio || template.category !== 'print') return
    setPdfExportBusy(true)
    try {
      const dataUrl = await studio.snapshot()
      const base64 = dataUrl.split(',')[1]
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
      const { PDFDocument } = await import('pdf-lib')
      const pdfDoc = await PDFDocument.create()
      const pngImage = await pdfDoc.embedPng(bytes)
      const pageWidthPt = template.widthIn * 72
      const pageHeightPt = template.heightIn * 72
      const page = pdfDoc.addPage([pageWidthPt, pageHeightPt])
      page.drawImage(pngImage, { x: 0, y: 0, width: pageWidthPt, height: pageHeightPt })
      const pdfBytes = await pdfDoc.save()
      const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' })
      setPdfExportUrl(URL.createObjectURL(blob))
    } finally {
      setPdfExportBusy(false)
    }
  }

  return (
    <div className="grid md:grid-cols-[1fr_320px] gap-6">
      <div className="space-y-3">
        <div className="max-h-[70vh] flex items-center justify-center border border-slate-300 dark:border-zinc-700 rounded-lg bg-black overflow-hidden">
          <canvas ref={canvasRef} className="max-w-full max-h-[70vh] w-auto h-auto" />
        </div>

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

        {template.category === 'print' && (
          <p className="text-xs text-slate-500 dark:text-zinc-400">
            {template.widthIn.toFixed(3)}×{template.heightIn.toFixed(3)}in at {template.dpi} DPI, includes {BLEED_IN}in bleed. PDF export embeds high-res RGB — not a full CMYK color-managed file.
          </p>
        )}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleExportPng}
            disabled={!ready || clips.length === 0 || exportBusy}
            className="rounded-lg bg-slate-800 dark:bg-zinc-700 text-white text-sm px-4 py-2 disabled:opacity-50"
          >
            {exportBusy ? 'Exporting…' : 'Export PNG'}
          </button>
          {template.category === 'print' && (
            <button
              onClick={handleExportPdf}
              disabled={!ready || clips.length === 0 || pdfExportBusy}
              className="rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm px-4 py-2 disabled:opacity-50"
            >
              {pdfExportBusy ? 'Exporting…' : 'Export PDF (print-ready)'}
            </button>
          )}
        </div>
        {exportUrl && (
          <div className="space-y-1">
            <img src={exportUrl} alt="Export preview" className="w-full max-w-lg rounded-lg border border-slate-300 dark:border-zinc-700" />
            <a href={exportUrl} download={`bario-design-${template.id}.png`} className="text-xs text-amber-600 dark:text-[#f59e0b] underline">
              Download PNG
            </a>
          </div>
        )}
        {pdfExportUrl && (
          <div className="space-y-1">
            <a href={pdfExportUrl} download={`bario-design-${template.id}.pdf`} className="text-xs text-amber-600 dark:text-[#f59e0b] underline">
              Download PDF
            </a>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4">
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setSidebarTab('assistant')}
            className={`text-sm font-medium px-3 py-1.5 rounded-lg ${sidebarTab === 'assistant' ? 'bg-amber-500 text-white' : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300'}`}
          >
            Assistant
          </button>
          <button
            onClick={() => setSidebarTab('manual')}
            className={`text-sm font-medium px-3 py-1.5 rounded-lg ${sidebarTab === 'manual' ? 'bg-amber-500 text-white' : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300'}`}
          >
            Manual
          </button>
        </div>

        {sidebarTab === 'assistant' ? (
          <DesignCopilotPanel clips={clips} addTextClip={addTextClipFor} addImageFromUrl={addImageFromUrl} />
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium block mb-1">Add image</label>
              <button
                onClick={() => uploadInputRef.current?.click()}
                disabled={uploadBusy}
                className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 dark:border-zinc-700 hover:border-amber-500 dark:hover:border-amber-500 transition-colors py-4 disabled:opacity-50"
              >
                <span className="w-7 h-7 rounded-full bg-amber-500 text-white text-lg leading-none flex items-center justify-center">+</span>
                <span className="text-sm font-medium">{uploadBusy ? 'Uploading…' : 'Upload an image'}</span>
              </button>
              <input
                ref={uploadInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                disabled={uploadBusy}
                className="hidden"
              />
              {uploadError && <p className="text-xs text-red-500 dark:text-red-400 mt-1">{uploadError}</p>}
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
        )}
      </div>
    </div>
  )
}

export default function StudioDesignEditor({ initialTemplateId }: { initialTemplateId?: string }) {
  const [template, setTemplate] = useState<Template>(
    TEMPLATES.find((t) => t.id === initialTemplateId) ?? TEMPLATES[0]
  )

  const socialTemplates = TEMPLATES.filter((t) => t.category === 'social')
  const printTemplates = TEMPLATES.filter((t) => t.category === 'print')

  return (
    <div>
      <div className="mb-3">
        <p className="text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1.5">Social</p>
        <div className="flex gap-2 flex-wrap mb-3">
          {socialTemplates.map((t) => (
            <button
              key={t.id}
              onClick={() => setTemplate(t)}
              className={`text-sm font-medium px-3 py-1.5 rounded-lg ${template.id === t.id ? 'bg-amber-500 text-white' : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1.5">Print</p>
        <div className="flex gap-2 flex-wrap">
          {printTemplates.map((t) => (
            <button
              key={t.id}
              onClick={() => setTemplate(t)}
              className={`text-sm font-medium px-3 py-1.5 rounded-lg ${template.id === t.id ? 'bg-amber-500 text-white' : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <DesignCanvasSession key={template.id} template={template} />
    </div>
  )
}
