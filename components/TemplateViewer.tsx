'use client'

import { useEffect, useRef, useState } from 'react'

type TemplateDetail = {
  id: string
  title: string
  category: string
  description: string
  html: string
}

export default function TemplateViewer({ templateId }: { templateId: string }) {
  const [template, setTemplate] = useState<TemplateDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    fetch(`/api/templates/${templateId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setTemplate(data)
      })
      .catch((err) => setError(err.message))
  }, [templateId])

  function handleIframeLoad() {
    try {
      const doc = iframeRef.current?.contentDocument
      if (doc) {
        doc.body.setAttribute('contenteditable', 'true')
        doc.body.style.outline = 'none'
        doc.querySelectorAll('a').forEach((a) => a.addEventListener('click', (e) => e.preventDefault()))
      }
    } catch {
      // cross-origin or not yet ready — ignore
    }
  }

  function handleExport() {
    window.location.href = `/api/templates/${templateId}/export`
  }

  function handleFullPreview() {
    if (!template) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.open()
    win.document.write(template.html)
    win.document.close()
  }

  if (error) return <main className="min-h-screen bg-[#0b111c] text-red-400 p-10">{error}</main>
  if (!template) return <main className="min-h-screen bg-[#0b111c] text-zinc-400 p-10">Loading…</main>

  return (
    <main className="h-screen flex flex-col bg-[#0b111c] text-zinc-100">
      <div className="flex items-center gap-4 h-14 px-5 border-b border-zinc-800 flex-shrink-0">
        <a href="/build/templates" className="text-sm text-zinc-400 hover:text-zinc-200">← Templates</a>
        <div>
          <div className="text-sm font-semibold">{template.title}</div>
          <div className="text-xs text-zinc-500">{template.category}</div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <button onClick={handleFullPreview} className="px-4 py-1.5 rounded-lg border border-zinc-700 text-xs font-semibold text-zinc-200">
            Open Full Preview ↗
          </button>
          <button onClick={handleExport} className="px-4 py-1.5 rounded-lg bg-[#f59e0b] text-[#1a1200] text-xs font-semibold">
            Export HTML
          </button>
        </div>
      </div>

      <iframe
        ref={iframeRef}
        srcDoc={template.html}
        onLoad={handleIframeLoad}
        className="flex-1 w-full bg-white"
        title={template.title}
      />
    </main>
  )
}
