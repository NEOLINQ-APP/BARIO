'use client'

// Proof-of-concept only (build-order step 1 from the approved Studio Ecosystem
// plan): prove @openvideo/core + @openvideo/engine-pixi's Studio actually
// work end-to-end in this app — upload a clip, see it render, trim it,
// export a real MP4 — before building the full timeline UI/AI copilot on
// top of it. Intentionally skips @openvideo/timeline's drag-drop UI for now;
// that's the next step once this core pipeline is confirmed working.

import { useEffect, useRef, useState } from 'react'
import { Core } from '@openvideo/core'
import { Studio, Compositor, Video } from '@openvideo/engine-pixi'

export default function StudioEditorPoc() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const coreRef = useRef<Core | null>(null)
  const studioRef = useRef<Studio | null>(null)
  const [clipId, setClipId] = useState<string | null>(null)
  const [status, setStatus] = useState('Loading engine…')
  const [exportUrl, setExportUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    const core = new Core({ settings: { width: 1280, height: 720, fps: 30, duration: 0 } })
    coreRef.current = core

    const studio = new Studio({ width: 1280, height: 720, canvas: canvasRef.current, core })
    studioRef.current = studio

    studio.ready.then(() => setStatus('Ready — upload a clip'))

    return () => {
      studio.destroy()
    }
  }, [])

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    const core = coreRef.current
    if (!file || !core) return
    setStatus('Adding clip…')
    const objectUrl = URL.createObjectURL(file)
    const clip = await core.clip.add({ type: 'Video', src: objectUrl })
    setClipId(clip.id)
    setStatus('Clip added — try trim/export')
  }

  async function handleTrim() {
    const core = coreRef.current
    if (!core || !clipId) return
    // Trim 1s off the start as a simple, visible proof the trim path works.
    core.clip.update(clipId, { trim: { from: 1_000_000, to: undefined as any } } as any)
    setStatus('Trimmed 1s off the start')
  }

  async function handleExport() {
    const core = coreRef.current
    if (!core) return
    setStatus('Checking export support…')
    const supported = await Compositor.isSupported()
    if (!supported) {
      setStatus('This browser does not support WebCodecs export')
      return
    }
    setStatus('Exporting…')
    const project = core.project.export()
    const compositor = new Compositor({ width: project.settings.width, height: project.settings.height })
    for (const clip of Object.values(project.clips)) {
      // Compositor needs a real engine-pixi sprite instance (with tick/clone/
      // getFrame), not the plain data object Core stores — Video.fromUrl()
      // is the documented conversion for the video clip type. POC only
      // handles Video; the real integration (step 2+) needs the equivalent
      // for Audio/Image/Text too.
      if (clip.type !== 'Video') continue
      const sprite = await Video.fromUrl(clip.src as string, {
        x: clip.transform.x,
        y: clip.transform.y,
        width: clip.transform.width,
        height: clip.transform.height,
      })
      await compositor.addSprite(sprite, { main: true })
    }
    const stream = compositor.output()
    const response = new Response(stream)
    const blob = await response.blob()
    setExportUrl(URL.createObjectURL(blob))
    setStatus('Export complete')
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500 dark:text-zinc-400">{status}</p>
      <canvas ref={canvasRef} className="w-full max-w-2xl border border-slate-300 dark:border-zinc-700 rounded-lg" />
      <div className="flex gap-2 flex-wrap">
        <input type="file" accept="video/*" onChange={handleFile} className="text-sm" />
        <button onClick={handleTrim} disabled={!clipId} className="rounded-lg bg-slate-200 dark:bg-zinc-800 disabled:opacity-50 text-sm px-3 py-1.5">
          Trim 1s
        </button>
        <button onClick={handleExport} disabled={!clipId} className="rounded-lg bg-amber-500 text-white disabled:opacity-50 text-sm px-3 py-1.5">
          Export MP4
        </button>
      </div>
      {exportUrl && (
        <div className="space-y-2">
          <video src={exportUrl} controls className="w-full max-w-2xl rounded-lg border border-slate-300 dark:border-zinc-700" />
          <a href={exportUrl} download="export.mp4" className="text-xs text-amber-600 dark:text-[#f59e0b] underline">
            Download
          </a>
        </div>
      )}
    </div>
  )
}
