'use client'

// Real Studio editor. Builds on @openvideo/core + @openvideo/engine-pixi: a
// completed AI generation (video or voiceover) is added directly as a clip
// via core.clip.add(...). Phase 1 (2026-08-19) adds: explicit multi-clip
// sequencing on a dedicated "scenes" track (previously every new clip
// defaulted to display.from=0, so clips silently overlapped instead of
// playing in order — see lib/studioTypes.ts's comment on @openvideo/core's
// microsecond timing units for why), an aspect-ratio picker, and a
// server-side ffmpeg export (lib/studioExport.ts) that replaces the old
// client-only WebCodecs path — that path could never export text overlays
// (a @openvideo/engine-pixi Compositor renderer-wiring limitation) and was
// hardcoded to 720p with no persistence (a blob URL that died on refresh).
//
// A real @openvideo/timeline (Fabric.js-based drag/trim widget, with a
// TimelineBridge class purpose-built to sync it against a Core instance) is
// installed in this repo and confirmed technically wireable via reading its
// compiled source — but deliberately NOT adopted here. It's undocumented
// (a 6-line README against a substantial, unfamiliar Fabric.js canvas
// surface) with real open questions (CSS/styling, coordinate systems, one
// timeline row per @openvideo/core clip *type* rather than one unified
// "scenes" row) that would need open-ended trial and error to resolve
// safely. This ordered-list UI is the deliberate, lower-risk Phase 1 floor
// the approved plan called for; real drag-and-drop is a fast-follow once
// this ships and the export pipeline is proven.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { uploadFile } from '@/lib/clientUpload'
import { Core, CoreConfig, BrowserMetadataProvider, type AnyClip } from '@openvideo/core'
import { Studio } from '@openvideo/engine-pixi'
import { CURRENT_STUDIO_POLICY_VERSION } from '@/lib/legalVersion'
import { RESOLUTIONS, mapProjectToExportRequest, MAX_EXPORT_DURATION_SECONDS, totalExportDurationSeconds, type AspectRatioPreset } from '@/lib/studioTypes'

// Without this, @openvideo/core has no way to know a video/audio clip's
// real duration (no metadata provider means every clip silently falls back
// to a hardcoded 5s default, confirmed by reading loadClip()'s source) —
// this was never wired up anywhere in the app before Phase 1, even though
// the library ships a ready browser implementation for exactly this. Set
// once at module scope since it's a global singleton, not per-editor-
// instance state.
if (typeof window !== 'undefined') {
  CoreConfig.setMetadataProvider(new BrowserMetadataProvider())
}

const SCENES_TRACK_ID = 'studio-scenes'
const DEFAULT_IMAGE_DURATION_SECONDS = 5
const MICROSECONDS_PER_SECOND = 1_000_000

const ASPECT_RATIO_OPTIONS: { value: AspectRatioPreset; label: string }[] = [
  { value: '16:9', label: '16:9 Landscape' },
  { value: '9:16', label: '9:16 Reels/Shorts' },
  { value: '1:1', label: '1:1 Square' },
]

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
type SceneClip = { id: string; type: 'Video' | 'Image'; name: string; startSeconds: number; durationSeconds: number }
type OverlayClip = { id: string; type: 'Text' | 'Audio'; name: string }
type AddClip = (type: 'Video' | 'Audio' | 'Image', src: string, name: string) => Promise<void>
type AddTextClip = (text: string) => Promise<void>
type AddUploadClip = (file: File) => Promise<void>

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

function UploadAddPanel({ onAdd }: { onAdd: AddUploadClip }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

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
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="w-full flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 dark:border-zinc-700 hover:border-amber-500 dark:hover:border-amber-500 transition-colors py-8 disabled:opacity-50"
      >
        <span className="w-10 h-10 rounded-full bg-amber-500 text-white text-2xl leading-none flex items-center justify-center">+</span>
        <span className="text-sm font-medium">{busy ? 'Uploading…' : 'Upload image, video, or audio'}</span>
        <span className="text-xs text-slate-400">Drops straight into your project</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*,audio/*"
        onChange={handleFile}
        disabled={busy}
        className="hidden"
      />
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

function SceneList({
  scenes,
  onMove,
  onRemove,
  onDurationChange,
}: {
  scenes: SceneClip[]
  onMove: (id: string, direction: -1 | 1) => void
  onRemove: (id: string) => void
  onDurationChange: (id: string, durationSeconds: number) => void
}) {
  if (scenes.length === 0) {
    return <p className="text-xs text-slate-400">No scenes yet — generate a video or upload an image/video on the right to get started.</p>
  }
  return (
    <ul className="space-y-2">
      {scenes.map((s, i) => (
        <li key={s.id} className="flex items-center gap-2 text-xs rounded-lg border border-slate-200 dark:border-zinc-800 px-2 py-1.5">
          <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-zinc-800 flex items-center justify-center font-mono">{i + 1}</span>
          <span className="flex-1 truncate">{s.type}: {s.name}</span>
          <input
            type="number"
            min={1}
            max={30}
            step={0.5}
            value={s.durationSeconds}
            onChange={(e) => onDurationChange(s.id, Math.max(0.5, Number(e.target.value) || s.durationSeconds))}
            className="w-14 rounded border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-1 py-0.5 text-xs"
            title="Duration (seconds)"
          />
          <span className="text-slate-400">s</span>
          <button onClick={() => onMove(s.id, -1)} disabled={i === 0} className="disabled:opacity-30 hover:text-amber-500" title="Move earlier">↑</button>
          <button onClick={() => onMove(s.id, 1)} disabled={i === scenes.length - 1} className="disabled:opacity-30 hover:text-amber-500" title="Move later">↓</button>
          <button onClick={() => onRemove(s.id)} className="text-red-500 hover:underline">Remove</button>
        </li>
      ))}
    </ul>
  )
}

function OverlayList({ overlays, onRemove }: { overlays: OverlayClip[]; onRemove: (id: string) => void }) {
  if (overlays.length === 0) return <p className="text-xs text-slate-400">No text overlays or audio tracks yet.</p>
  return (
    <ul className="space-y-1">
      {overlays.map((o) => (
        <li key={o.id} className="flex items-center justify-between text-xs">
          <span>{o.type}: {o.name}</span>
          <button onClick={() => onRemove(o.id)} className="text-red-500 hover:underline">Remove</button>
        </li>
      ))}
    </ul>
  )
}

export type StudioEditorTab = 'assistant' | 'video' | 'voiceover' | 'text' | 'upload'

export default function StudioEditor({ initialTab = 'assistant' }: { initialTab?: StudioEditorTab }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const coreRef = useRef<Core | null>(null)
  const studioRef = useRef<Studio | null>(null)
  const [ready, setReady] = useState(false)
  const [scenes, setScenes] = useState<SceneClip[]>([])
  const [overlays, setOverlays] = useState<OverlayClip[]>([])
  const [aspectRatio, setAspectRatio] = useState<AspectRatioPreset>('16:9')
  const [tab, setTab] = useState<StudioEditorTab>(initialTab)
  const [exportBusy, setExportBusy] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportUrl, setExportUrl] = useState<string | null>(null)

  const clipsSummary = useMemo<ClipSummary[]>(
    () => [...scenes.map((s) => ({ id: s.id, type: s.type, name: s.name })), ...overlays.map((o) => ({ id: o.id, type: o.type, name: o.name }))],
    [scenes, overlays]
  )

  const syncFromStore = useCallback((clips: Record<string, AnyClip>) => {
    const all = Object.values(clips)
    const sceneClips = all
      .filter((c): c is AnyClip & { type: 'Video' | 'Image' } => c.type === 'Video' || c.type === 'Image')
      .sort((a, b) => a.timing.display.from - b.timing.display.from)
      .map((c) => ({
        id: c.id,
        type: c.type,
        name: c.name || c.type,
        startSeconds: c.timing.display.from / MICROSECONDS_PER_SECOND,
        durationSeconds: (c.timing.display.to - c.timing.display.from) / MICROSECONDS_PER_SECOND,
      }))
    const overlayClips = all
      .filter((c): c is AnyClip & { type: 'Text' | 'Audio' } => c.type === 'Text' || c.type === 'Audio')
      .map((c) => ({ id: c.id, type: c.type, name: c.name || c.type }))
    setScenes(sceneClips)
    setOverlays(overlayClips)
  }, [])

  function buildStudio(core: Core, width: number, height: number) {
    if (!canvasRef.current) return
    studioRef.current?.destroy()
    const studio = new Studio({ width, height, canvas: canvasRef.current, core })
    studioRef.current = studio
    setReady(false)
    studio.ready.then(() => setReady(true))
  }

  useEffect(() => {
    if (!canvasRef.current) return
    const { width, height } = RESOLUTIONS['16:9']
    const core = new Core({ settings: { width, height, fps: 30, duration: 0 } })
    coreRef.current = core
    // One fixed track for sequential "scenes" (video/image) regardless of
    // clip type — @openvideo/core's own auto-track-matching (manageTracks)
    // groups by clip type, which would otherwise split AI-generated video
    // scenes and uploaded image scenes onto two separate tracks even when
    // interleaved in the same sequence.
    core.track.add({ id: SCENES_TRACK_ID, name: 'Scenes', type: 'scenes', clipIds: [] })

    buildStudio(core, width, height)

    const unsubscribe = core.store.subscribe((state) => syncFromStore(state.clips))

    return () => {
      unsubscribe()
      studioRef.current?.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleAspectRatioChange(next: AspectRatioPreset) {
    const core = coreRef.current
    if (!core) return
    setAspectRatio(next)
    const { width, height } = RESOLUTIONS[next]
    core.store.getState().updateSettings({ width, height })
    buildStudio(core, width, height)
  }

  const addSceneClip = useCallback(async (type: 'Video' | 'Image', src: string, name: string) => {
    const core = coreRef.current
    if (!core) return
    const state = core.store.getState()
    const sceneTrack = state.tracks.find((t) => t.id === SCENES_TRACK_ID)
    const lastEndUs = (sceneTrack?.clipIds ?? []).reduce((max, id) => {
      const clip = state.clips[id]
      return clip ? Math.max(max, clip.timing.display.to) : max
    }, 0)
    const timing: any = { display: { from: lastEndUs } }
    if (type === 'Image') timing.duration = DEFAULT_IMAGE_DURATION_SECONDS * MICROSECONDS_PER_SECOND
    await core.clip.add({ type, src, name, timing } as any, { trackId: SCENES_TRACK_ID })
  }, [])

  const addOverlayClip = useCallback(async (type: 'Audio', src: string, name: string) => {
    const core = coreRef.current
    if (!core) return
    // Audio (voiceover/music) defaults to starting at the top of the
    // timeline, as a continuous bed under the scenes — not sequenced after
    // them like a scene would be.
    await core.clip.add({ type, src, name } as any)
  }, [])

  const addClipToCanvas = useCallback<AddClip>(
    async (type, src, name) => {
      if (type === 'Audio') return addOverlayClip('Audio', src, name)
      return addSceneClip(type, src, name)
    },
    [addSceneClip, addOverlayClip]
  )

  const addTextClip = useCallback<AddTextClip>(async (text) => {
    const core = coreRef.current
    if (!core) return
    // Default a new overlay to span the whole current timeline so far (min
    // 5s if the canvas is otherwise empty) — per-overlay time-range editing
    // is a fast-follow, not required for Phase 1's export to work
    // correctly (lib/studioTypes.ts's mapper reads whatever display.from/to
    // ends up here regardless of how it was set).
    const state = core.store.getState()
    const sceneTrack = state.tracks.find((t) => t.id === SCENES_TRACK_ID)
    const totalUs = (sceneTrack?.clipIds ?? []).reduce((max, id) => {
      const clip = state.clips[id]
      return clip ? Math.max(max, clip.timing.display.to) : max
    }, 0)
    await core.clip.add({
      type: 'Text',
      text,
      name: text.slice(0, 40),
      style: { fontSize: 48, color: '#ffffff', align: 'center' },
      timing: { display: { from: 0, to: Math.max(totalUs, DEFAULT_IMAGE_DURATION_SECONDS * MICROSECONDS_PER_SECOND) } },
    } as any)
  }, [])

  // Direct-to-Blob (same pattern as TemplateBuilder.tsx's image upload) so
  // a real video file isn't capped by Vercel's ~4.5MB serverless body limit
  // — and, unlike the old URL.createObjectURL approach, the resulting URL
  // is a real persisted asset, not one that vanishes on refresh.
  const addUploadClip = useCallback<AddUploadClip>(
    async (file) => {
      const blob = await uploadFile(file)
      if (file.type.startsWith('video/')) return addSceneClip('Video', blob.url, file.name)
      if (file.type.startsWith('image/')) return addSceneClip('Image', blob.url, file.name)
      return addOverlayClip('Audio', blob.url, file.name)
    },
    [addSceneClip, addOverlayClip]
  )

  function moveScene(id: string, direction: -1 | 1) {
    const core = coreRef.current
    if (!core) return
    const currentOrder = [...scenes]
    const index = currentOrder.findIndex((s) => s.id === id)
    const targetIndex = index + direction
    if (index === -1 || targetIndex < 0 || targetIndex >= currentOrder.length) return
    ;[currentOrder[index], currentOrder[targetIndex]] = [currentOrder[targetIndex], currentOrder[index]]
    resequence(core, currentOrder)
  }

  function updateSceneDuration(id: string, durationSeconds: number) {
    const core = coreRef.current
    if (!core) return
    const next = scenes.map((s) => (s.id === id ? { ...s, durationSeconds } : s))
    resequence(core, next)
  }

  function removeScene(id: string) {
    const core = coreRef.current
    if (!core) return
    core.clip.remove([id])
    resequence(core, scenes.filter((s) => s.id !== id))
  }

  function removeOverlay(id: string) {
    coreRef.current?.clip.remove([id])
  }

  // Walks the desired scene order and reassigns cumulative display.from/to
  // for every clip so they play back-to-back with no gaps or overlaps —
  // needed after a reorder, a duration edit, or a removal, since none of
  // those individually keep the rest of the sequence consistent on their
  // own.
  function resequence(core: Core, orderedScenes: SceneClip[]) {
    let cursorUs = 0
    for (const scene of orderedScenes) {
      const fromUs = cursorUs
      const durationUs = Math.round(scene.durationSeconds * MICROSECONDS_PER_SECOND)
      const toUs = fromUs + durationUs
      core.clip.update(scene.id, { timing: { display: { from: fromUs, to: toUs } } } as any)
      cursorUs = toUs
    }
  }

  async function handleExport() {
    const core = coreRef.current
    if (!core) return
    setExportError(null)
    setExportBusy(true)
    setExportUrl(null)
    try {
      const project = core.project.export()
      const exportRequest = mapProjectToExportRequest(project, aspectRatio)
      if (exportRequest.clips.length === 0) throw new Error('Add at least one video or image scene before exporting.')
      const totalDuration = totalExportDurationSeconds(exportRequest)
      if (totalDuration > MAX_EXPORT_DURATION_SECONDS) {
        throw new Error(`This timeline is ${Math.round(totalDuration)}s — exports are capped at ${MAX_EXPORT_DURATION_SECONDS}s for now.`)
      }
      const res = await fetch('/api/studio/export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(exportRequest),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Export failed')
      setExportUrl(data.url)
    } catch (err: any) {
      setExportError(err.message)
    } finally {
      setExportBusy(false)
    }
  }

  return (
    <div className="grid md:grid-cols-[1fr_360px] gap-6">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">Aspect ratio:</span>
          {ASPECT_RATIO_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleAspectRatioChange(opt.value)}
              className={`text-xs font-medium px-2.5 py-1 rounded-lg ${
                aspectRatio === opt.value ? 'bg-amber-500 text-white' : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="max-h-[70vh] flex items-center justify-center border border-slate-300 dark:border-zinc-700 rounded-lg bg-black overflow-hidden">
          <canvas ref={canvasRef} className="max-w-full max-h-[70vh] w-auto h-auto" />
        </div>

        <div className="rounded-lg border border-slate-300 dark:border-zinc-700 p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium">Scenes ({scenes.length})</p>
            <button
              onClick={() => setTab('upload')}
              title="Upload image, video, or audio"
              className="w-6 h-6 rounded-full bg-amber-500 hover:bg-amber-600 text-white text-sm leading-none flex items-center justify-center"
            >
              +
            </button>
          </div>
          <SceneList scenes={scenes} onMove={moveScene} onRemove={removeScene} onDurationChange={updateSceneDuration} />
        </div>

        <div className="rounded-lg border border-slate-300 dark:border-zinc-700 p-3">
          <p className="text-xs font-medium mb-2">Text overlays & audio</p>
          <OverlayList overlays={overlays} onRemove={removeOverlay} />
        </div>

        <button
          onClick={handleExport}
          disabled={!ready || scenes.length === 0 || exportBusy}
          className="rounded-lg bg-slate-800 dark:bg-zinc-700 text-white text-sm px-4 py-2 disabled:opacity-50"
        >
          {exportBusy ? 'Exporting…' : 'Export MP4'}
        </button>
        {exportError && <p className="text-xs text-red-500 dark:text-red-400">{exportError}</p>}
        {exportUrl && (
          <div className="space-y-1">
            <video src={exportUrl} controls className="w-full rounded-lg border border-slate-300 dark:border-zinc-700" />
            <div className="flex items-center gap-3">
              <a href={exportUrl} download="bario-studio-export.mp4" className="text-xs text-amber-600 dark:text-[#f59e0b] underline">
                Download
              </a>
              <span className="text-xs text-slate-400">Also saved to your X-Drive → Studio folder</span>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4">
        <div className="flex gap-2 mb-4 flex-wrap">
          {(['assistant', 'video', 'voiceover', 'text', 'upload'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-sm font-medium px-3 py-1.5 rounded-lg capitalize ${tab === t ? 'bg-amber-500 text-white' : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300'}`}
            >
              {t}
            </button>
          ))}
        </div>
        {tab === 'assistant' && <CopilotPanel clips={clipsSummary} addClipToCanvas={addClipToCanvas} addTextClip={addTextClip} />}
        {tab === 'video' && <VideoGeneratePanel onClipReady={addClipToCanvas} />}
        {tab === 'voiceover' && <VoiceoverGeneratePanel onClipReady={addClipToCanvas} />}
        {tab === 'text' && <TextAddPanel onAdd={addTextClip} />}
        {tab === 'upload' && <UploadAddPanel onAdd={addUploadClip} />}
      </div>
    </div>
  )
}
