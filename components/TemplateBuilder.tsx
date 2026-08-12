'use client'

import { useEffect, useRef, useState } from 'react'
import { uploadFile } from '@/lib/clientUpload'
import ProfileMenu from '@/components/ProfileMenu'
import PublishPanel from '@/components/PublishPanel'

type ChatMsg = { role: 'assistant' | 'user'; text: string }

export default function TemplateBuilder({
  siteId,
  initialName,
  initialHtml,
  initialCredits,
  userEmail,
  userPlan,
  isAdmin,
  initialSubdomain,
  initialCustomDomain,
  initialDomainStatus,
  initialPublished,
  isPaid,
  initialShowBadge,
  initialMetaTitle,
  initialMetaDescription,
  initialAnalyticsId,
  initialFaviconUrl,
}: {
  siteId: string
  initialName: string
  initialHtml: string
  initialCredits: number
  userEmail: string
  userPlan: string | null
  isAdmin: boolean
  initialSubdomain: string | null
  initialCustomDomain: string | null
  initialDomainStatus: string
  initialPublished: boolean
  isPaid: boolean
  initialShowBadge: boolean
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
  // Lifted (not PublishPanel-local) so the panel doesn't forget a subdomain
  // you just published the moment you close and reopen it — see the same
  // fix in Builder.tsx for the full explanation.
  const [subdomain, setSubdomain] = useState(initialSubdomain ?? '')
  const [published, setPublished] = useState(initialPublished)
  const [customDomain, setCustomDomain] = useState(initialCustomDomain ?? '')
  const [domainStatus, setDomainStatus] = useState(initialDomainStatus)
  const [showBadge, setShowBadge] = useState(initialShowBadge)
  const [showPublish, setShowPublish] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [credits, setCredits] = useState(initialCredits)
  const unlimitedCredits = credits === -1
  const outOfCredits = !unlimitedCredits && credits <= 0

  // The document lives in the iframe's own DOM (contentEditable text, image
  // swaps, link edits all mutate it directly) — this state only exists to
  // force a fresh srcDoc load when Sky hands back a whole new document.
  // Plain edits never touch it, so they don't cause a reload mid-edit.
  const [html, setHtml] = useState(initialHtml)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const lastHtmlRef = useRef(initialHtml)
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: 'assistant', text: "This page came from a template, so I'm editing the real HTML directly rather than Bario's sections. Click any text to edit it, click an image to replace it, click a link to change where it goes, or tell me what to change here." },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)

  const imageFileInputRef = useRef<HTMLInputElement>(null)
  const pendingImageRef = useRef<HTMLImageElement | null>(null)
  const [imageUploading, setImageUploading] = useState(false)
  const [imageUploadError, setImageUploadError] = useState<string | null>(null)

  function addMsg(role: ChatMsg['role'], text: string) {
    setMessages((m) => [...m, { role, text }])
  }

  function scheduleAutosave() {
    setDirty(true)
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = setTimeout(() => { handleSave() }, 1200)
  }

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!dirty) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  function handleIframeLoad() {
    try {
      const doc = iframeRef.current?.contentDocument
      if (!doc) return
      doc.body.setAttribute('contenteditable', 'true')
      doc.body.style.outline = 'none'
      doc.body.addEventListener('input', scheduleAutosave)

      doc.querySelectorAll('a').forEach((a) => {
        a.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          const current = a.getAttribute('href') ?? ''
          const next = window.prompt('Link destination (URL):', current)
          if (next !== null && next !== current) {
            a.setAttribute('href', next)
            scheduleAutosave()
          }
        })
      })

      doc.querySelectorAll('img').forEach((img) => {
        img.style.cursor = 'pointer'
        img.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          pendingImageRef.current = img as HTMLImageElement
          imageFileInputRef.current?.click()
        })
      })
    } catch {
      // cross-origin or not yet ready — ignore
    }
  }

  async function handleImageFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    const img = pendingImageRef.current
    if (!file || !img) return
    setImageUploading(true)
    setImageUploadError(null)
    try {
      const blob = await uploadFile(file)
      img.src = blob.url
      scheduleAutosave()
    } catch (err: any) {
      setImageUploadError(err.message ?? 'Upload failed')
    }
    setImageUploading(false)
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
      const current = getEditedHtml()
      lastHtmlRef.current = current
      const res = await fetch('/api/sites/template-content', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ siteId, html: current, metaTitle, metaDescription, analyticsId }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Save failed')
      setSaveMsg('Saved')
      setDirty(false)
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

  async function handleSwitchToAiBuilder() {
    if (!confirm('Switch back to the AI builder? Your current HTML template stays saved if you want to return to it later.')) return
    setSwitching(true)
    try {
      const res = await fetch('/api/sites/mode', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'sections', siteId }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed to switch')
      window.location.href = '/build'
    } catch (err: any) {
      setSaveMsg(`Failed: ${err.message}`)
      setSwitching(false)
    }
  }

  async function handleSend() {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    addMsg('user', text)
    setBusy(true)
    const currentHtml = getEditedHtml()
    // A killed serverless function (timeout) sends no response at all, so
    // without this the fetch just hangs forever with nothing to catch —
    // exactly what "Sky frozen" turned out to be. Give up client-side
    // slightly before the server's own 60s limit so there's always a
    // definite answer instead of an indefinite spinner.
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 55_000)
    try {
      const res = await fetch('/api/builder/generate-html', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: text, html: currentHtml }),
        signal: controller.signal,
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Generation failed')
      lastHtmlRef.current = d.html
      setHtml(d.html)
      if (typeof d.creditsRemaining === 'number') setCredits(d.creditsRemaining)
      addMsg('assistant', d.explanation ?? 'Done.')
      scheduleAutosave()
    } catch (err: any) {
      addMsg('assistant', err.name === 'AbortError' ? '⚠️ That took too long and timed out. Try a smaller, more specific request.' : `⚠️ ${err.message}`)
    }
    clearTimeout(timeout)
    setBusy(false)
  }

  return (
    <main className="h-screen flex flex-col bg-[#0b111c] text-zinc-100">
      <div className="flex items-center gap-4 h-14 px-5 border-b border-zinc-800 flex-shrink-0">
        <a href="/dashboard" className="text-sm text-zinc-400 hover:text-zinc-200">← Dashboard</a>
        <a href={`/build/templates?site=${siteId}`} className="text-sm text-zinc-400 hover:text-zinc-200">Switch Template</a>
        <button
          onClick={handleSwitchToAiBuilder}
          disabled={switching}
          className="text-sm text-zinc-400 hover:text-zinc-200 disabled:opacity-50"
        >
          {switching ? 'Switching…' : 'Switch to AI Builder'}
        </button>
        <span className="text-sm font-semibold">{siteName}</span>
        <div className="ml-auto flex items-center gap-3">
          <span className={`text-xs px-2 py-1 rounded-full border ${!unlimitedCredits && credits <= 5 ? 'border-red-500/40 text-red-400' : 'border-zinc-700 text-zinc-400'}`}>
            {unlimitedCredits ? '∞ credits (admin)' : `${credits} credit${credits === 1 ? '' : 's'} left`}
          </span>
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
          <ProfileMenu
            email={userEmail}
            plan={userPlan}
            isAdmin={isAdmin}
            creditsLabel={unlimitedCredits ? '∞ credits (admin)' : `${credits} credit${credits === 1 ? '' : 's'} left`}
          />
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="w-80 flex-shrink-0 border-r border-zinc-800 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${m.role === 'user' ? 'bg-[#1a56db] text-white' : 'bg-[#131b2a] border border-zinc-800 text-zinc-200'}`}>
                  {m.text}
                </div>
              </div>
            ))}
            {busy && <div className="text-xs text-zinc-500">Sky is editing…</div>}
          </div>

          <div className="p-3 border-t border-zinc-800">
            {outOfCredits && (
              <div className="text-xs text-red-400 mb-2">
                Out of AI credits for this billing period. <a href="/#pricing" className="underline">Upgrade your plan</a> for more.
              </div>
            )}
            {imageUploadError && <div className="text-xs text-red-400 mb-2">{imageUploadError}</div>}
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                placeholder="Ask Sky to change something on this page…"
                rows={2}
                disabled={outOfCredits}
                className="flex-1 bg-[#131b2a] border border-zinc-700 rounded-xl px-3 py-2 text-xs outline-none resize-none disabled:opacity-50"
              />
              <button onClick={handleSend} disabled={busy || outOfCredits} className="px-3 rounded-xl bg-[#1a56db] text-white text-xs font-semibold disabled:opacity-50">
                Send
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 bg-[#1a1a2e] p-6">
          <div className="h-full max-w-6xl mx-auto rounded-lg shadow-2xl overflow-hidden bg-white relative">
            {imageUploading && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-10 text-white text-sm font-semibold">
                Uploading image…
              </div>
            )}
            <iframe
              ref={iframeRef}
              srcDoc={html}
              onLoad={handleIframeLoad}
              className="w-full h-full"
              title={siteName}
            />
          </div>
        </div>
      </div>

      <input
        ref={imageFileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageFileChange}
        className="hidden"
      />

      {showPublish && (
        <PublishPanel
          siteId={siteId}
          onClose={() => setShowPublish(false)}
          subdomain={subdomain}
          setSubdomain={setSubdomain}
          published={published}
          setPublished={setPublished}
          customDomain={customDomain}
          setCustomDomain={setCustomDomain}
          domainStatus={domainStatus}
          setDomainStatus={setDomainStatus}
          isPaid={isPaid}
          showBadge={showBadge}
          setShowBadge={setShowBadge}
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
