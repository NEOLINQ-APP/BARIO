'use client'

// Real Studio editor (replaces the old standalone generate-and-preview
// StudioGenerator + the editor-poc test page). Builds on the proven
// @openvideo/core + @openvideo/engine-pixi pipeline: a completed AI
// generation (video or voiceover) is added directly as a clip via
// core.clip.add(...) instead of shown in a standalone player. The full
// drag-drop multi-track timeline UI (@openvideo/timeline) is intentionally
// not wired in yet — this ships the AI-generation-as-asset-source step
// first (build-order step 2) with a simple clip list in its place; the
// visual timeline is the next piece.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Core } from '@openvideo/core'
import { Studio, Compositor, Video, Audio } from '@openvideo/engine-pixi'
import { CURRENT_STUDIO_POLICY_VERSION } from '@/lib/legalVersion'

const VOICE_OPTIONS = [
  { id: 'af_heart', label: 'Female — Heart (warm, American)' },
  { id: 'af_bella', label: 'Female — Bella (elegant, American)' },
  { id: 'am_adam', label: 'Male — Adam (energetic, American)' },
  { id: 'am_michael', label: 'Male — Michael (American)' },
  { id: 'bf_emma', label: 'Female — Emma (British)' },
  { id: 'bm_george', label: 'Male — George (British)' },
]

type JobStatus = 'idle' | 'submitting' | 'pending' | 'processing' | 'complete' | 'failed'
type ClipSummary = { id: string; type: string; name: string }
type AddClip = (type: 'Video' | 'Audio', src: string, name: string) => Promise<void>
type AddTextClip = (text: string) => Promise<void>
type AddMusicClip = (file: File) => Promise<void>

function TextAddPanel({ onAdd }: { onAdd: AddTextClip }) {
  const [text, setText] = useState('')

  async function handleAdd() {
    if (!text.trim()) return
    await onAdd(text.trim())
    setText('')
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-sm font-medium block mb-1">Text overlay</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Your headline or caption"
          rows={3}
          className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm"
        />
      </div>
      <button
        onClick={handleAdd}
        disabled={!text.trim()}
        className="w-full rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2"
      >
        Add text to canvas
      </button>
    </div>
  )
}

function MusicAddPanel({ onAdd }: { onAdd: AddMusicClip }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setBusy(true)
    try {
      await onAdd(file)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
      e.target.value = ''
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-sm font-medium block mb-1">Upload a music/audio track</label>
        <input type="file" accept="audio/*" onChange={handleFile} disabled={busy} className="text-sm" />
      </div>
      {busy && <p className="text-xs text-slate-500 dark:text-zinc-400">Adding…</p>}
      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
    </div>
  )
}

async function pollStudioJob(jobId: string): Promise<{ outputUrl: string } | { error: string }> {
  for (;;) {
    await new Promise((r) => setTimeout(r, 3000))
    const res = await fetch(`/api/studio/status/${jobId}`)
    const data = await res.json()
    if (!res.ok) return { error: data.error ?? 'Something went wrong' }
    if (data.status === 'complete') return { outputUrl: data.outputUrl }
    if (data.status === 'failed') return { error: data.error ?? 'Generation failed — credits were refunded.' }
  }
}

type ChatMessage = { role: 'user' | 'assistant'; content: string }

function CopilotPanel({
  clips,
  addClipToCanvas,
  addTextClip,
}: {
  clips: ClipSummary[]
  addClipToCanvas: AddClip
  addTextClip: AddTextClip
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: "Tell me what you want to create — I can generate video, voiceover, or add text, in any language." },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)

  async function runTool(name: string, args: any): Promise<string> {
    if (name === 'add_text_overlay') {
      await addTextClip(String(args.text || ''))
      return 'Added the text overlay to the canvas.'
    }
    if (name === 'generate_voiceover') {
      const res = await fetch('/api/studio/voiceover', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: args.text, voiceId: args.voiceId }),
      })
      const data = await res.json()
      if (!res.ok) return `Couldn't generate the voiceover: ${data.error}`
      await addClipToCanvas('Audio', data.url, String(args.text || '').slice(0, 40))
      return 'Voiceover generated and added to the canvas.'
    }
    if (name === 'generate_video') {
      const res = await fetch('/api/studio/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: args.prompt, durationSeconds: args.durationSeconds }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.requiresAup) {
          return 'You need to accept the Studio Acceptable Use Policy first — switch to the Video tab, check the box, then ask me again.'
        }
        return `Couldn't start the generation: ${data.error}`
      }
      const result = await pollStudioJob(data.jobId)
      if ('error' in result) return `Video generation failed: ${result.error}`
      await addClipToCanvas('Video', result.outputUrl, String(args.prompt || '').slice(0, 40))
      return 'Video generated and added to the canvas.'
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
        body: JSON.stringify({ messages: nextMessages, clipsSummary }),
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
      if (data.reply) {
        setMessages((m) => [...m, { role: 'assistant', content: data.reply }])
      }
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
              m.role === 'user'
                ? 'ml-auto bg-amber-500 text-white'
                : 'bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200'
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
          placeholder="e.g. Make a video of a sunset over the ocean with calm music"
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

function VideoGeneratePanel({ onClipReady }: { onClipReady: AddClip }) {
  const [prompt, setPrompt] = useState('')
  const [sourceImageUrl, setSourceImageUrl] = useState('')
  const [durationSeconds, setDurationSeconds] = useState(5)
  const [needsAup, setNeedsAup] = useState(false)
  const [legalAccepted, setLegalAccepted] = useState(false)
  const [status, setStatus] = useState<JobStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  function pollJob(jobId: string) {
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/studio/status/${jobId}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong')
        setStatus('failed')
        if (pollRef.current) clearInterval(pollRef.current)
        return
      }
      setStatus(data.status)
      if (data.status === 'complete') {
        if (pollRef.current) clearInterval(pollRef.current)
        await onClipReady('Video', data.outputUrl, prompt.slice(0, 40) || 'AI video')
        setStatus('idle')
      } else if (data.status === 'failed') {
        setError(data.error ?? 'Generation failed — your credits were refunded.')
        if (pollRef.current) clearInterval(pollRef.current)
      }
    }, 3000)
  }

  async function handleGenerate() {
    setError(null)
    setStatus('submitting')
    try {
      const res = await fetch('/api/studio/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt, sourceImageUrl: sourceImageUrl || undefined, durationSeconds, legalAccepted }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.requiresAup) {
          setNeedsAup(true)
          setStatus('idle')
          return
        }
        throw new Error(data.error ?? 'Failed to start generation')
      }
      setStatus('pending')
      pollJob(data.jobId)
    } catch (err: any) {
      setError(err.message)
      setStatus('failed')
    }
  }

  const busy = status === 'submitting' || status === 'pending' || status === 'processing'

  return (
    <div className="space-y-3">
      <div>
        <label className="text-sm font-medium block mb-1">Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="A drone shot slowly rising over a quiet coastal town at sunrise"
          rows={3}
          className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="text-sm font-medium block mb-1">Source image URL (optional)</label>
        <input
          type="text"
          value={sourceImageUrl}
          onChange={(e) => setSourceImageUrl(e.target.value)}
          placeholder="https://…"
          className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="text-sm font-medium block mb-1">Duration: {durationSeconds}s</label>
        <input type="range" min={1} max={10} value={durationSeconds} onChange={(e) => setDurationSeconds(Number(e.target.value))} className="w-full" />
      </div>
      {needsAup && (
        <label className="flex items-start gap-3">
          <input type="checkbox" checked={legalAccepted} onChange={(e) => setLegalAccepted(e.target.checked)} className="w-4 h-4 mt-0.5" />
          <span className="text-xs text-slate-500 dark:text-zinc-400">
            I accept the Bario Studio{' '}
            <a href="/legal/studio-aup" target="_blank" rel="noopener noreferrer" className="text-amber-600 dark:text-[#f59e0b] underline">
              Acceptable Use Policy
            </a>{' '}
            (v{CURRENT_STUDIO_POLICY_VERSION})
          </span>
        </label>
      )}
      <button
        onClick={handleGenerate}
        disabled={!prompt.trim() || busy || (needsAup && !legalAccepted)}
        className="w-full rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2"
      >
        {busy ? 'Generating…' : 'Generate & add to canvas'}
      </button>
      {busy && <p className="text-xs text-slate-500 dark:text-zinc-400 animate-pulse">This can take a minute or two…</p>}
      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
    </div>
  )
}

function VoiceoverGeneratePanel({ onClipReady }: { onClipReady: AddClip }) {
  const [text, setText] = useState('')
  const [voiceId, setVoiceId] = useState(VOICE_OPTIONS[0].id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerate() {
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/studio/voiceover', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, voiceId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to generate voiceover')
      await onClipReady('Audio', data.url, text.slice(0, 40) || 'AI voiceover')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-sm font-medium block mb-1">Text</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What should the voiceover say?"
          rows={4}
          maxLength={2000}
          className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm"
        />
        <p className="text-xs text-slate-400 mt-1">{text.length}/2000</p>
      </div>
      <div>
        <label className="text-sm font-medium block mb-1">Voice</label>
        <select
          value={voiceId}
          onChange={(e) => setVoiceId(e.target.value)}
          className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm"
        >
          {VOICE_OPTIONS.map((v) => (
            <option key={v.id} value={v.id}>{v.label}</option>
          ))}
        </select>
      </div>
      <button
        onClick={handleGenerate}
        disabled={!text.trim() || busy}
        className="w-full rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2"
      >
        {busy ? 'Generating…' : 'Generate & add to canvas'}
      </button>
      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
    </div>
  )
}

export type StudioEditorTab = 'assistant' | 'video' | 'voiceover' | 'text' | 'music'

export default function StudioEditor({ initialTab = 'assistant' }: { initialTab?: StudioEditorTab }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const coreRef = useRef<Core | null>(null)
  const studioRef = useRef<Studio | null>(null)
  const [ready, setReady] = useState(false)
  const [clips, setClips] = useState<ClipSummary[]>([])
  const [tab, setTab] = useState<StudioEditorTab>(initialTab)
  const [exportBusy, setExportBusy] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportUrl, setExportUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    const core = new Core({ settings: { width: 1280, height: 720, fps: 30, duration: 0 } })
    coreRef.current = core

    const studio = new Studio({ width: 1280, height: 720, canvas: canvasRef.current, core })
    studioRef.current = studio
    studio.ready.then(() => setReady(true))

    const unsubscribe = core.store.subscribe((state) => {
      setClips(Object.values(state.clips).map((c: any) => ({ id: c.id, type: c.type, name: c.name || c.type })))
    })

    return () => {
      unsubscribe()
      studio.destroy()
    }
  }, [])

  const addClipToCanvas = useCallback<AddClip>(async (type, src, name) => {
    const core = coreRef.current
    if (!core) return
    await core.clip.add({ type, src, name })
  }, [])

  const addTextClip = useCallback<AddTextClip>(async (text) => {
    const core = coreRef.current
    if (!core) return
    await core.clip.add({
      type: 'Text',
      text,
      name: text.slice(0, 40),
      style: { fontSize: 48, color: '#ffffff', align: 'center' },
    } as any)
  }, [])

  const addMusicClip = useCallback<AddMusicClip>(async (file) => {
    const core = coreRef.current
    if (!core) return
    const objectUrl = URL.createObjectURL(file)
    await core.clip.add({ type: 'Audio', src: objectUrl, name: file.name })
  }, [])

  function removeClip(id: string) {
    coreRef.current?.clip.remove([id])
  }

  async function handleExport() {
    const core = coreRef.current
    if (!core) return
    setExportError(null)
    setExportBusy(true)
    setExportUrl(null)
    try {
      const supported = await Compositor.isSupported()
      if (!supported) throw new Error('This browser does not support the WebCodecs export needed here.')

      const project = core.project.export()
      const compositor = new Compositor({ width: project.settings.width, height: project.settings.height })

      let addedMain = false
      let skippedTextClips = 0
      for (const clip of Object.values(project.clips)) {
        if (clip.type === 'Video') {
          const sprite = await Video.fromUrl(clip.src as string, {
            x: clip.transform.x,
            y: clip.transform.y,
            width: clip.transform.width,
            height: clip.transform.height,
          })
          await compositor.addSprite(sprite, { main: !addedMain })
          addedMain = true
        } else if (clip.type === 'Audio') {
          const sprite = await Audio.fromUrl(clip.src as string)
          await compositor.addSprite(sprite, { main: !addedMain })
          addedMain = true
        } else if (clip.type === 'Text') {
          // Known limitation, not silently swallowed: @openvideo/engine-pixi's
          // Text sprite requires a live PixiJS renderer to rasterize glyphs,
          // and Compositor doesn't expose its own internal one for us to
          // hand over — tried both the constructor arg and setRenderer(),
          // neither took in testing ("BaseTextClip: No renderer" at tick
          // time). Text overlays still show correctly in the live canvas
          // preview (Studio wires its own renderer internally); export is
          // the one path affected. Flagged to the user rather than shipping
          // a silently-broken or crashing export.
          skippedTextClips++
        }
      }
      const stream = compositor.output()
      const blob = await new Response(stream).blob()
      setExportUrl(URL.createObjectURL(blob))
      if (skippedTextClips > 0) {
        setExportError(
          `Note: ${skippedTextClips} text overlay${skippedTextClips > 1 ? 's' : ''} shown in the preview above aren't in this exported file yet — a known limitation, video/audio export normally.`
        )
      }
    } catch (err: any) {
      setExportError(err.message)
    } finally {
      setExportBusy(false)
    }
  }

  return (
    <div className="grid md:grid-cols-[1fr_360px] gap-6">
      <div className="space-y-3">
        <div className="max-h-[70vh] flex items-center justify-center border border-slate-300 dark:border-zinc-700 rounded-lg bg-black overflow-hidden">
          <canvas ref={canvasRef} className="max-w-full max-h-[70vh] w-auto h-auto" />
        </div>

        <div className="rounded-lg border border-slate-300 dark:border-zinc-700 p-3">
          <p className="text-xs font-medium mb-2">Clips ({clips.length})</p>
          {clips.length === 0 && <p className="text-xs text-slate-400">No clips yet — generate one on the right to get started.</p>}
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
          onClick={handleExport}
          disabled={!ready || clips.length === 0 || exportBusy}
          className="rounded-lg bg-slate-800 dark:bg-zinc-700 text-white text-sm px-4 py-2 disabled:opacity-50"
        >
          {exportBusy ? 'Exporting…' : 'Export MP4'}
        </button>
        {exportError && <p className="text-xs text-red-500 dark:text-red-400">{exportError}</p>}
        {exportUrl && (
          <div className="space-y-1">
            <video src={exportUrl} controls className="w-full rounded-lg border border-slate-300 dark:border-zinc-700" />
            <a href={exportUrl} download="bario-studio-export.mp4" className="text-xs text-amber-600 dark:text-[#f59e0b] underline">
              Download
            </a>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4">
        <div className="flex gap-2 mb-4 flex-wrap">
          {(['assistant', 'video', 'voiceover', 'text', 'music'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-sm font-medium px-3 py-1.5 rounded-lg capitalize ${tab === t ? 'bg-amber-500 text-white' : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300'}`}
            >
              {t}
            </button>
          ))}
        </div>
        {tab === 'assistant' && <CopilotPanel clips={clips} addClipToCanvas={addClipToCanvas} addTextClip={addTextClip} />}
        {tab === 'video' && <VideoGeneratePanel onClipReady={addClipToCanvas} />}
        {tab === 'voiceover' && <VoiceoverGeneratePanel onClipReady={addClipToCanvas} />}
        {tab === 'text' && <TextAddPanel onAdd={addTextClip} />}
        {tab === 'music' && <MusicAddPanel onAdd={addMusicClip} />}
      </div>
    </div>
  )
}
