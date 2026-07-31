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

export default function StudioEditor() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const coreRef = useRef<Core | null>(null)
  const studioRef = useRef<Studio | null>(null)
  const [ready, setReady] = useState(false)
  const [clips, setClips] = useState<ClipSummary[]>([])
  const [tab, setTab] = useState<'video' | 'voiceover'>('video')
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
        }
      }
      const stream = compositor.output()
      const blob = await new Response(stream).blob()
      setExportUrl(URL.createObjectURL(blob))
    } catch (err: any) {
      setExportError(err.message)
    } finally {
      setExportBusy(false)
    }
  }

  return (
    <div className="grid md:grid-cols-[1fr_360px] gap-6">
      <div className="space-y-3">
        <canvas ref={canvasRef} className="w-full border border-slate-300 dark:border-zinc-700 rounded-lg bg-black" />

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
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setTab('video')}
            className={`text-sm font-medium px-3 py-1.5 rounded-lg ${tab === 'video' ? 'bg-amber-500 text-white' : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300'}`}
          >
            Video
          </button>
          <button
            onClick={() => setTab('voiceover')}
            className={`text-sm font-medium px-3 py-1.5 rounded-lg ${tab === 'voiceover' ? 'bg-amber-500 text-white' : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300'}`}
          >
            Voiceover
          </button>
        </div>
        {tab === 'video' ? <VideoGeneratePanel onClipReady={addClipToCanvas} /> : <VoiceoverGeneratePanel onClipReady={addClipToCanvas} />}
      </div>
    </div>
  )
}
