'use client'

import { useEffect, useRef, useState } from 'react'
import { CURRENT_STUDIO_POLICY_VERSION } from '@/lib/legalVersion'

type JobStatus = 'idle' | 'submitting' | 'pending' | 'processing' | 'complete' | 'failed'

function VideoTab() {
  const [prompt, setPrompt] = useState('')
  const [sourceImageUrl, setSourceImageUrl] = useState('')
  const [durationSeconds, setDurationSeconds] = useState(5)
  const [needsAup, setNeedsAup] = useState(false)
  const [legalAccepted, setLegalAccepted] = useState(false)
  const [status, setStatus] = useState<JobStatus>('idle')
  const [outputUrl, setOutputUrl] = useState<string | null>(null)
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
        setOutputUrl(data.outputUrl)
        if (pollRef.current) clearInterval(pollRef.current)
      } else if (data.status === 'failed') {
        setError(data.error ?? 'Generation failed — your credits were refunded.')
        if (pollRef.current) clearInterval(pollRef.current)
      }
    }, 3000)
  }

  async function handleGenerate() {
    setError(null)
    setOutputUrl(null)
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
    <div className="space-y-4">
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
        <label className="text-sm font-medium block mb-1">Source image URL (optional — image-to-video)</label>
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
        <input
          type="range"
          min={1}
          max={10}
          value={durationSeconds}
          onChange={(e) => setDurationSeconds(Number(e.target.value))}
          className="w-full"
        />
      </div>

      {needsAup && (
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={legalAccepted}
            onChange={(e) => setLegalAccepted(e.target.checked)}
            className="w-4 h-4 mt-0.5"
          />
          <span className="text-xs text-slate-500 dark:text-zinc-400">
            I have read and accept the Bario Studio{' '}
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
        className="rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2"
      >
        {busy ? 'Generating…' : 'Generate'}
      </button>

      {busy && (
        <p className="text-xs text-slate-500 dark:text-zinc-400 animate-pulse">
          Generating your video — this can take a minute or two…
        </p>
      )}
      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
      {outputUrl && (
        <div className="pt-2 space-y-2">
          <video src={outputUrl} controls className="w-full rounded-lg border border-slate-300 dark:border-zinc-700" />
          <a href={outputUrl} download className="text-xs text-amber-600 dark:text-[#f59e0b] underline">
            Download
          </a>
        </div>
      )}
    </div>
  )
}

function VoiceoverTab() {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [outputUrl, setOutputUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerate() {
    setError(null)
    setOutputUrl(null)
    setBusy(true)
    try {
      const res = await fetch('/api/studio/voiceover', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to generate voiceover')
      setOutputUrl(data.url)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
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

      <button
        onClick={handleGenerate}
        disabled={!text.trim() || busy}
        className="rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2"
      >
        {busy ? 'Generating…' : 'Generate'}
      </button>

      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
      {outputUrl && (
        <div className="pt-2 space-y-2">
          <audio src={outputUrl} controls className="w-full" />
          <a href={outputUrl} download className="text-xs text-amber-600 dark:text-[#f59e0b] underline">
            Download
          </a>
        </div>
      )}
    </div>
  )
}

export default function StudioGenerator() {
  const [tab, setTab] = useState<'video' | 'voiceover'>('video')

  return (
    <div>
      <div className="flex gap-2 mb-6">
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
      {tab === 'video' ? <VideoTab /> : <VoiceoverTab />}
    </div>
  )
}
