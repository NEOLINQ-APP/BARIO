'use client'

import { useEffect, useState } from 'react'

export default function TemplateThumbnail({ templateId, title }: { templateId: string; title: string }) {
  const [html, setHtml] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/templates/${templateId}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        if (data.error || typeof data.html !== 'string') throw new Error('no preview')
        setHtml(data.html)
      })
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
  }, [templateId])

  return (
    <div className="relative w-full aspect-[16/10] overflow-hidden rounded-xl border border-zinc-800 bg-white">
      {html ? (
        <iframe
          srcDoc={html}
          title={`${title} preview`}
          tabIndex={-1}
          scrolling="no"
          className="absolute top-0 left-0 border-0 pointer-events-none origin-top-left"
          style={{ width: '400%', height: '400%', transform: 'scale(0.25)' }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-xs text-zinc-600">
          {failed ? 'Preview unavailable' : 'Loading preview…'}
        </div>
      )}
    </div>
  )
}
