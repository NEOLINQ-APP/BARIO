'use client'

import { useRef, useState } from 'react'
import ProfileMenu from '@/components/ProfileMenu'
import PublishPanel from '@/components/PublishPanel'

export default function TemplateBuilder({
  initialName,
  initialHtml,
  userEmail,
  userPlan,
  isAdmin,
  initialSubdomain,
  initialCustomDomain,
  initialDomainStatus,
  initialPublished,
  initialMetaTitle,
  initialMetaDescription,
  initialAnalyticsId,
  initialFaviconUrl,
}: {
  initialName: string
  initialHtml: string
  userEmail: string
  userPlan: string | null
  isAdmin: boolean
  initialSubdomain: string | null
  initialCustomDomain: string | null
  initialDomainStatus: string
  initialPublished: boolean
  initialMetaTitle: string
  initialMetaDescription: string
  initialAnalyticsId: string
  initialFaviconUrl: string
}) {
  const [siteName] = useState(initialName)
  const [metaTitle, setMetaTitle] = useState(initialMetaTitle)
  const [metaDescription, setMetaDescription] = useState(initialMetaDescription)
  const [analyticsId, setAnalyticsId] = useState(initialAnalyticsId)
  const [faviconUrl, setFaviconUrl] = useState(initialFaviconUrl)
  const [showPublish, setShowPublish] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const lastHtmlRef = useRef(initialHtml)

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

  function getEditedHtml(): string {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return lastHtmlRef.current
    return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`
  }

  async function handleSave(): Promise<void> {
    setSaving(true)
    setSaveMsg(null)
    try {
      const html = getEditedHtml()
      lastHtmlRef.current = html
      const res = await fetch('/api/sites/template-content', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ html, metaTitle, metaDescription, analyticsId }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Save failed')
      setSaveMsg('Saved')
    } catch (err: any) {
      setSaveMsg(`Failed: ${err.message}`)
    }
    setSaving(false)
    setTimeout(() => setSaveMsg(null), 3000)
  }

  function handleExport() {
    const html = getEditedHtml()
    const blob = new Blob([html], { type: 'text/html' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${siteName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.html`
    a.click()
  }

  return (
    <main className="h-screen flex flex-col bg-[#0b111c] text-zinc-100">
      <div className="flex items-center gap-4 h-14 px-5 border-b border-zinc-800 flex-shrink-0">
        <a href="/dashboard" className="text-sm text-zinc-400 hover:text-zinc-200">← Dashboard</a>
        <a href="/build/templates" className="text-sm text-zinc-400 hover:text-zinc-200">Switch Template</a>
        <span className="text-sm font-semibold">{siteName}</span>
        <div className="ml-auto flex items-center gap-3">
          {saveMsg && <span className="text-xs text-zinc-400">{saveMsg}</span>}
          <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 rounded-lg border border-zinc-700 text-xs font-semibold disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={handleExport} className="px-3 py-1.5 rounded-lg border border-zinc-700 text-xs font-semibold">
            Export HTML
          </button>
          <button onClick={() => setShowPublish(true)} className="px-3 py-1.5 rounded-lg bg-[#f59e0b] text-[#1a1200] text-xs font-semibold">
            Publish
          </button>
          <ProfileMenu email={userEmail} plan={userPlan} isAdmin={isAdmin} creditsLabel="Template site" />
        </div>
      </div>

      <div className="flex-1 min-h-0 bg-[#1a1a2e] p-6">
        <div className="h-full max-w-6xl mx-auto rounded-lg shadow-2xl overflow-hidden bg-white">
          <iframe
            ref={iframeRef}
            srcDoc={initialHtml}
            onLoad={handleIframeLoad}
            className="w-full h-full"
            title={siteName}
          />
        </div>
      </div>

      {showPublish && (
        <PublishPanel
          onClose={() => setShowPublish(false)}
          initialSubdomain={initialSubdomain}
          initialCustomDomain={initialCustomDomain}
          initialDomainStatus={initialDomainStatus}
          initialPublished={initialPublished}
          metaTitle={metaTitle}
          setMetaTitle={setMetaTitle}
          metaDescription={metaDescription}
          setMetaDescription={setMetaDescription}
          analyticsId={analyticsId}
          setAnalyticsId={setAnalyticsId}
          faviconUrl={faviconUrl}
          setFaviconUrl={setFaviconUrl}
          onSaveSeo={handleSave}
        />
      )}
    </main>
  )
}
