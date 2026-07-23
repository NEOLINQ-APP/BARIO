'use client'

import { useState, useRef, useEffect, createElement } from 'react'
import { upload } from '@vercel/blob/client'
import './builder-sections.css'
import ProfileMenu from '@/components/ProfileMenu'
import PublishPanel from '@/components/PublishPanel'
import BusinessProfilePanel from '@/components/BusinessProfilePanel'
import { buildSiteHtml } from '@/lib/renderSite'

type SectionType = 'nav' | 'hero' | 'features' | 'stats' | 'testimonial' | 'pricing' | 'cta' | 'footer'
type SectionData = Record<string, string>
type Section = { id: string; type: SectionType; data: SectionData }
type ChatMsg = { role: 'zeus' | 'user'; text: string }
type Theme = { primary: string; accent: string }

const SECTION_LABELS: Record<SectionType, string> = {
  nav: 'Nav', hero: 'Hero', features: 'Features', stats: 'Stats',
  testimonial: 'Testimonials', pricing: 'Pricing', cta: 'CTA', footer: 'Footer',
}

const DEFAULTS: Record<SectionType, SectionData> = {
  nav: { logo: '⚡ YourBrand' },
  hero: { headline: 'Your Powerful Headline Goes Here', sub: 'A compelling description that explains your unique value proposition clearly.', cta: 'Get Started Today', image: '' },
  features: { title: 'Why Choose Us', f1t: 'Fast & Reliable', f1d: 'Built for speed and performance at every level.', f1img: '', f2t: 'Secure', f2d: 'Enterprise-grade security protecting your data.', f2img: '', f3t: 'Smart', f3d: 'Tools that work the way you think.', f3img: '' },
  stats: { s1n: '500+', s1l: 'Happy Clients', s2n: '98%', s2l: 'Satisfaction Rate', s3n: '10yr', s3l: 'Experience', s4n: '24/7', s4l: 'Support' },
  testimonial: { title: 'What Our Clients Say', t1q: 'Amazing service! Completely transformed our business.', t1n: 'John D.', t1r: 'CEO, Company', t2q: 'Best decision we ever made.', t2n: 'Sarah M.', t2r: 'Director, Firm', t3q: 'Outstanding results from day one.', t3n: 'Rob C.', t3r: 'Owner, Business' },
  pricing: { title: 'Simple, Transparent Pricing', p1n: 'Basic', p1p: '$99', p1f: 'Feature 1,Feature 2,Feature 3', p2n: 'Pro', p2p: '$199', p2f: 'Feature 1,Feature 2,Feature 3,Feature 4', p3n: 'Enterprise', p3p: '$499', p3f: 'Feature 1,Feature 2,Feature 3,Feature 4,Feature 5' },
  cta: { headline: 'Ready to Get Started?', sub: 'Join thousands of businesses already growing with us.', cta: 'Start Free Today' },
  footer: { logo: '⚡ YourBrand', copy: '© 2026 YourBrand. All rights reserved.' },
}

const TEMPLATES: Record<string, { type: SectionType; data: SectionData }[]> = {
  business: [
    { type: 'nav', data: { logo: 'BusinessPro' } },
    { type: 'hero', data: { headline: 'Grow Your Business With Confidence', sub: 'Professional services tailored to your unique needs and goals.', cta: 'Get Free Consultation' } },
    { type: 'stats', data: { s1n: '500+', s1l: 'Happy Clients', s2n: '15yr', s2l: 'Experience', s3n: '98%', s3l: 'Success Rate', s4n: '24/7', s4l: 'Support' } },
    { type: 'features', data: { title: 'What We Offer', f1t: 'Expert Team', f1d: 'Seasoned professionals dedicated to your success.', f2t: 'Proven Results', f2d: 'Track record of delivering measurable outcomes.', f3t: 'Always Available', f3d: 'Round-the-clock support for your business.' } },
    { type: 'cta', data: { headline: 'Ready to Transform Your Business?', sub: 'Join 500+ businesses already succeeding with us.', cta: 'Start Today' } },
    { type: 'footer', data: { logo: 'BusinessPro', copy: '© 2026 BusinessPro. All rights reserved.' } },
  ],
  restaurant: [
    { type: 'nav', data: { logo: 'La Bella' } },
    { type: 'hero', data: { headline: 'Authentic Flavours, Unforgettable Moments', sub: 'Experience the finest cuisine crafted with fresh local ingredients.', cta: 'Reserve Your Table' } },
    { type: 'features', data: { title: 'Why Dine With Us', f1t: 'Fresh Ingredients', f1d: 'Locally sourced, seasonal ingredients in every dish.', f2t: 'Award-Winning Chef', f2d: '15 years of culinary excellence.', f3t: 'Perfect Atmosphere', f3d: 'Intimate setting perfect for any occasion.' } },
    { type: 'cta', data: { headline: 'Book Your Table Tonight', sub: 'Available 7 days a week.', cta: 'Make a Reservation' } },
    { type: 'footer', data: { logo: 'La Bella', copy: '© 2026 La Bella Restaurant.' } },
  ],
  agency: [
    { type: 'nav', data: { logo: 'Bario Agency' } },
    { type: 'hero', data: { headline: 'Results For Your Business', sub: 'We combine strategy with execution to deliver real results.', cta: 'See Our Work' } },
    { type: 'features', data: { title: 'Our Services', f1t: 'Marketing', f1d: 'Campaigns that convert.', f2t: 'Web Development', f2d: 'Beautiful, fast websites.', f3t: 'Automation', f3d: 'Workflows that run 24/7.' } },
    { type: 'pricing', data: { title: 'Investment Plans', p1n: 'Starter', p1p: '$997', p1f: '5 Pages,Support', p2n: 'Growth', p2p: '$2,497', p2f: '10 Pages,E-commerce,SEO', p3n: 'Enterprise', p3p: 'Custom', p3f: 'Unlimited Pages,Priority Support' } },
    { type: 'cta', data: { headline: "Let's Build Something Great", sub: 'Book a free strategy call.', cta: 'Get Started' } },
    { type: 'footer', data: { logo: 'Bario Agency', copy: '© 2026 Bario Agency.' } },
  ],
}

function renderFieldsFromModel(sections: { type: SectionType; data: SectionData }[]): Section[] {
  return sections.map((s) => ({ id: crypto.randomUUID(), type: s.type, data: s.data }))
}

function newId() {
  return crypto.randomUUID()
}

export default function Builder({
  siteId,
  initialName,
  initialSections,
  initialTheme,
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
  initialBusinessName,
  initialBusinessCategory,
  initialBusinessHours,
  initialBusinessLocation,
}: {
  siteId: string | null
  initialName: string
  initialSections: { type: SectionType; data: SectionData }[]
  initialTheme: Theme
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
  initialBusinessName: string
  initialBusinessCategory: string
  initialBusinessHours: string
  initialBusinessLocation: string
}) {
  const [currentSiteId, setCurrentSiteId] = useState(siteId)
  const [siteName, setSiteName] = useState(initialName)
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const [metaTitle, setMetaTitle] = useState(initialMetaTitle)
  const [metaDescription, setMetaDescription] = useState(initialMetaDescription)
  const [analyticsId, setAnalyticsId] = useState(initialAnalyticsId)
  const [faviconUrl, setFaviconUrl] = useState(initialFaviconUrl)
  const [businessName, setBusinessName] = useState(initialBusinessName)
  const [businessCategory, setBusinessCategory] = useState(initialBusinessCategory)
  const [businessHours, setBusinessHours] = useState(initialBusinessHours)
  const [businessLocation, setBusinessLocation] = useState(initialBusinessLocation)
  const [showProfile, setShowProfile] = useState(false)
  const [showPublish, setShowPublish] = useState(false)
  const [credits, setCredits] = useState(initialCredits)
  const unlimitedCredits = credits === -1
  const outOfCredits = !unlimitedCredits && credits <= 0
  const [sections, setSections] = useState<Section[]>(() =>
    initialSections.map((s) => ({ id: newId(), type: s.type, data: s.data }))
  )
  const canvasScrollRef = useRef<HTMLDivElement>(null)
  const sectionsLengthRef = useRef(sections.length)

  useEffect(() => {
    if (sections.length > sectionsLengthRef.current) {
      requestAnimationFrame(() => {
        canvasScrollRef.current?.scrollTo({ top: canvasScrollRef.current.scrollHeight, behavior: 'smooth' })
      })
    }
    sectionsLengthRef.current = sections.length
  }, [sections])
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: 'zeus', text: "Hi! I'm Zeus, your AI website builder. Tell me what kind of website you need and I'll build it. Try: \"Build a modern site for a Calgary plumbing company.\"" },
  ])
  const [input, setInput] = useState('')
  const [attachment, setAttachment] = useState<{ url: string; kind: 'image' | 'video' | 'audio'; name: string } | null>(null)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  function addMsg(role: ChatMsg['role'], text: string) {
    setMessages((m) => [...m, { role, text }])
  }

  function updateField(id: string, field: string, value: string) {
    setSections((secs) => secs.map((s) => (s.id === id ? { ...s, data: { ...s.data, [field]: value } } : s)))
  }

  function removeSection(id: string) {
    setSections((secs) => secs.filter((s) => s.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  function moveSection(id: string, dir: -1 | 1) {
    setSections((secs) => {
      const idx = secs.findIndex((s) => s.id === id)
      const swapIdx = idx + dir
      if (idx === -1 || swapIdx < 0 || swapIdx >= secs.length) return secs
      const copy = [...secs]
      ;[copy[idx], copy[swapIdx]] = [copy[swapIdx], copy[idx]]
      return copy
    })
  }

  function duplicateSection(id: string) {
    setSections((secs) => {
      const idx = secs.findIndex((s) => s.id === id)
      if (idx === -1) return secs
      const copy = [...secs]
      copy.splice(idx + 1, 0, { ...secs[idx], id: newId() })
      return copy
    })
  }

  function addBlankSection(type: SectionType) {
    setSections((secs) => [...secs, { id: newId(), type, data: { ...DEFAULTS[type] } }])
  }

  function loadTemplate(name: string) {
    const tmpl = TEMPLATES[name]
    if (!tmpl) return
    setSections(renderFieldsFromModel(tmpl))
    addMsg('zeus', `${name.charAt(0).toUpperCase() + name.slice(1)} template loaded. Click any text to edit it directly, or ask me to change anything.`)
  }

  async function handleAttachFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const kind = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : null
    if (!kind) {
      setUploadError('Only image, video, or audio files are supported')
      return
    }

    setUploadingFile(true)
    setUploadError(null)
    try {
      const blob = await upload(file.name, file, {
        access: 'public',
        handleUploadUrl: '/api/sites/upload-asset',
      })
      setAttachment({ url: blob.url, kind, name: file.name })
    } catch (err: any) {
      setUploadError(err.message ?? 'Upload failed')
    }
    setUploadingFile(false)
  }

  async function handleSend() {
    const text = input.trim()
    if ((!text && !attachment) || busy) return
    setInput('')
    const currentAttachment = attachment
    setAttachment(null)
    addMsg('user', currentAttachment ? `${text} 📎 ${currentAttachment.name}` : text)
    setBusy(true)

    const isNew = sections.length === 0 || /build|create|make|generate|new site/i.test(text)

    try {
      const res = await fetch('/api/builder/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt: text || `Use this attached ${currentAttachment?.kind} where it fits best.`,
          sections: sections.map((s) => ({ type: s.type, data: s.data })),
          theme,
          isNew,
          businessName,
          businessCategory,
          businessHours,
          businessLocation,
          attachmentUrl: currentAttachment?.url,
          attachmentKind: currentAttachment?.kind,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Generation failed')
      setSections(renderFieldsFromModel(d.sections))
      if (d.theme) setTheme(d.theme)
      if (typeof d.creditsRemaining === 'number') setCredits(d.creditsRemaining)
      addMsg('zeus', d.explanation ?? 'Done.')
    } catch (err: any) {
      addMsg('zeus', `⚠️ ${err.message}`)
    }
    setBusy(false)
  }

  async function handleSave() {
    setSaving(true)
    setSaveMsg(null)
    try {
      const res = await fetch('/api/builder/site', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          siteId: currentSiteId,
          name: siteName,
          sections: sections.map((s) => ({ type: s.type, data: s.data })),
          theme,
          metaTitle,
          metaDescription,
          analyticsId,
          businessName,
          businessCategory,
          businessHours,
          businessLocation,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Save failed')
      if (d.id) setCurrentSiteId(d.id)
      setSaveMsg('Saved')
    } catch (err: any) {
      setSaveMsg(`Failed: ${err.message}`)
    }
    setSaving(false)
    setTimeout(() => setSaveMsg(null), 3000)
  }

  function handleExport() {
    const html = buildSiteHtml(siteName, sections.map((s) => ({ type: s.type, data: s.data })), theme, {
      metaTitle,
      metaDescription,
      analyticsId,
      faviconUrl,
    })
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
        <a href={`/build/templates${currentSiteId ? `?site=${currentSiteId}` : ''}`} className="text-sm text-zinc-400 hover:text-zinc-200">Premium Templates</a>
        <input
          value={siteName}
          onChange={(e) => setSiteName(e.target.value)}
          className="bg-transparent text-sm font-semibold outline-none border-b border-transparent focus:border-zinc-700"
        />
        <div className="ml-auto flex items-center gap-3">
          <span className={`text-xs px-2 py-1 rounded-full border ${!unlimitedCredits && credits <= 5 ? 'border-red-500/40 text-red-400' : 'border-zinc-700 text-zinc-400'}`}>
            {unlimitedCredits ? '∞ credits (admin)' : `${credits} credit${credits === 1 ? '' : 's'} left`}
          </span>
          <label className="flex items-center gap-1.5 text-xs text-zinc-400" title="Primary color">
            Primary
            <input
              type="color"
              value={theme.primary}
              onChange={(e) => setTheme((t) => ({ ...t, primary: e.target.value }))}
              className="w-6 h-6 rounded border border-zinc-700 bg-transparent cursor-pointer"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-zinc-400" title="Accent color">
            Accent
            <input
              type="color"
              value={theme.accent}
              onChange={(e) => setTheme((t) => ({ ...t, accent: e.target.value }))}
              className="w-6 h-6 rounded border border-zinc-700 bg-transparent cursor-pointer"
            />
          </label>
          {saveMsg && <span className="text-xs text-zinc-400">{saveMsg}</span>}
          <button onClick={() => setShowProfile(true)} className="px-3 py-1.5 rounded-lg border border-zinc-700 text-xs font-semibold">
            Business Profile
          </button>
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
        {/* Chat panel */}
        <div className="w-80 flex-shrink-0 border-r border-zinc-800 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${m.role === 'user' ? 'bg-[#1a56db] text-white' : 'bg-[#131b2a] border border-zinc-800 text-zinc-200'}`}>
                  {m.text}
                </div>
              </div>
            ))}
            {busy && <div className="text-xs text-zinc-500">Zeus is building…</div>}
          </div>

          <div className="p-3 border-t border-zinc-800">
            {outOfCredits && (
              <div className="text-xs text-red-400 mb-2">
                Out of AI credits for this billing period. <a href="/#pricing" className="underline">Upgrade your plan</a> for more.
              </div>
            )}
            <div className="flex flex-wrap gap-1.5 mb-2">
              {['business', 'restaurant', 'agency'].map((t) => (
                <button key={t} onClick={() => loadTemplate(t)} className="text-[10px] px-2 py-1 rounded-full border border-zinc-700 text-zinc-400 hover:text-zinc-200 capitalize">
                  {t} template
                </button>
              ))}
            </div>
            {uploadError && <div className="text-xs text-red-400 mb-2">{uploadError}</div>}
            {attachment && (
              <div className="flex items-center gap-2 mb-2 text-xs bg-zinc-800 rounded-lg px-2.5 py-1.5 w-fit">
                <span>{attachment.kind === 'image' ? '🖼️' : attachment.kind === 'video' ? '🎬' : '🎵'}</span>
                <span className="text-zinc-300 max-w-[160px] truncate">{attachment.name}</span>
                <button onClick={() => setAttachment(null)} className="text-zinc-500 hover:text-zinc-300">✕</button>
              </div>
            )}
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,audio/*"
                onChange={handleAttachFile}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingFile || outOfCredits}
                title="Attach an image, video, or audio file"
                className="w-8 h-8 shrink-0 self-end rounded-xl border border-zinc-700 text-zinc-300 hover:text-white disabled:opacity-50 flex items-center justify-center"
              >
                {uploadingFile ? '…' : '+'}
              </button>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                placeholder={attachment ? 'Say what to do with this file (optional)…' : 'Describe your website or ask for changes…'}
                rows={2}
                disabled={outOfCredits}
                className="flex-1 bg-[#131b2a] border border-zinc-700 rounded-xl px-3 py-2 text-xs outline-none resize-none disabled:opacity-50"
              />
              <button onClick={handleSend} disabled={busy || outOfCredits || uploadingFile} className="px-3 rounded-xl bg-[#1a56db] text-white text-xs font-semibold disabled:opacity-50">
                Send
              </button>
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 flex flex-col min-h-0 bg-[#1a1a2e]">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800 overflow-x-auto">
            {(Object.keys(SECTION_LABELS) as SectionType[]).map((t) => (
              <button key={t} onClick={() => addBlankSection(t)} className="text-[11px] px-2.5 py-1 rounded-md bg-zinc-800 text-zinc-300 hover:text-white whitespace-nowrap">
                + {SECTION_LABELS[t]}
              </button>
            ))}
          </div>
          <div ref={canvasScrollRef} className="flex-1 overflow-y-auto p-6">
            <div
              className="b-canvas bg-white rounded-lg shadow-2xl max-w-5xl mx-auto overflow-hidden min-h-[400px]"
              style={{ ['--b-primary' as any]: theme.primary, ['--b-accent' as any]: theme.accent }}
            >
              {sections.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-24 text-center px-10">
                  <div className="text-4xl opacity-40">🏗️</div>
                  <h3 className="text-slate-500 font-semibold">Your website will appear here</h3>
                  <p className="text-slate-400 text-sm max-w-xs">Chat with Zeus on the left, or load a template to get started.</p>
                </div>
              ) : (
                sections.map((s) => (
                  <SectionView
                    key={s.id}
                    section={s}
                    selected={selectedId === s.id}
                    onSelect={() => setSelectedId(s.id)}
                    onCommit={(field, value) => updateField(s.id, field, value)}
                    onMoveUp={() => moveSection(s.id, -1)}
                    onMoveDown={() => moveSection(s.id, 1)}
                    onDuplicate={() => duplicateSection(s.id)}
                    onDelete={() => removeSection(s.id)}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {showPublish && (
        <PublishPanel
          siteId={currentSiteId}
          onClose={() => setShowPublish(false)}
          initialSubdomain={initialSubdomain}
          initialCustomDomain={initialCustomDomain}
          initialDomainStatus={initialDomainStatus}
          initialPublished={initialPublished}
          isPaid={isPaid}
          initialShowBadge={initialShowBadge}
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

      {showProfile && (
        <BusinessProfilePanel
          onClose={() => setShowProfile(false)}
          businessName={businessName}
          setBusinessName={setBusinessName}
          businessCategory={businessCategory}
          setBusinessCategory={setBusinessCategory}
          businessHours={businessHours}
          setBusinessHours={setBusinessHours}
          businessLocation={businessLocation}
          setBusinessLocation={setBusinessLocation}
          onSave={async () => {
            await handleSave()
            setShowProfile(false)
          }}
        />
      )}
    </main>
  )
}

function Editable({
  tag = 'span',
  value,
  onCommit,
  className,
}: {
  tag?: 'span' | 'div' | 'h1' | 'h2' | 'h3' | 'p'
  value: string
  onCommit: (v: string) => void
  className?: string
}) {
  return createElement(
    tag,
    {
      className: `b-editable ${className ?? ''}`,
      contentEditable: true,
      suppressContentEditableWarning: true,
      onClick: (e: React.MouseEvent) => e.stopPropagation(),
      onBlur: (e: React.FocusEvent<HTMLElement>) => onCommit(e.currentTarget.textContent ?? ''),
    },
    value
  )
}

function SectionView({
  section, selected, onSelect, onCommit, onMoveUp, onMoveDown, onDuplicate, onDelete,
}: {
  section: Section
  selected: boolean
  onSelect: () => void
  onCommit: (field: string, value: string) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const { type, data } = section
  const toolbar = (
    <div className="b-sec-toolbar">
      <button className="b-sec-btn" onClick={onMoveUp}>↑ Up</button>
      <button className="b-sec-btn" onClick={onMoveDown}>↓ Down</button>
      <button className="b-sec-btn" onClick={onDuplicate}>⧉ Duplicate</button>
      <button className="b-sec-btn red" onClick={onDelete}>✕ Delete</button>
    </div>
  )
  const wrapperClass = `b-section ${selected ? 'selected' : ''}`

  if (type === 'nav') {
    return (
      <div className={`${wrapperClass} s-nav`} onClick={onSelect}>
        {toolbar}
        <Editable value={data.logo} onCommit={(v) => onCommit('logo', v)} className="s-nav-logo" />
        <div className="s-nav-links"><span>Home</span><span>About</span><span>Services</span><span>Contact</span></div>
      </div>
    )
  }
  if (type === 'hero') {
    return (
      <div className={`${wrapperClass} s-hero`} onClick={onSelect}>
        {toolbar}
        {data.image && <img src={data.image} alt="" className="b-hero-img" />}
        <Editable tag="h1" value={data.headline} onCommit={(v) => onCommit('headline', v)} />
        <Editable tag="p" value={data.sub} onCommit={(v) => onCommit('sub', v)} />
        <Editable value={data.cta} onCommit={(v) => onCommit('cta', v)} className="s-hero-btn" />
      </div>
    )
  }
  if (type === 'features') {
    return (
      <div className={`${wrapperClass} s-features`} onClick={onSelect}>
        {toolbar}
        <Editable tag="h2" value={data.title} onCommit={(v) => onCommit('title', v)} />
        <div className="s-features-grid">
          {[1, 2, 3].map((n) => (
            <div className="s-feat-card" key={n}>
              {data[`f${n}img`] ? (
                <img src={data[`f${n}img`]} alt="" className="b-feat-img" />
              ) : (
                <div className="s-feat-icon">✨</div>
              )}
              <Editable tag="h3" value={data[`f${n}t`]} onCommit={(v) => onCommit(`f${n}t`, v)} />
              <Editable tag="p" value={data[`f${n}d`]} onCommit={(v) => onCommit(`f${n}d`, v)} />
            </div>
          ))}
        </div>
      </div>
    )
  }
  if (type === 'stats') {
    return (
      <div className={`${wrapperClass} s-stats`} onClick={onSelect}>
        {toolbar}
        <div className="s-stats-grid">
          {[1, 2, 3, 4].map((n) => (
            <div key={n}>
              <Editable value={data[`s${n}n`]} onCommit={(v) => onCommit(`s${n}n`, v)} className="s-stat-num" />
              <Editable value={data[`s${n}l`]} onCommit={(v) => onCommit(`s${n}l`, v)} className="s-stat-label" />
            </div>
          ))}
        </div>
      </div>
    )
  }
  if (type === 'testimonial') {
    return (
      <div className={`${wrapperClass} s-testimonial`} onClick={onSelect}>
        {toolbar}
        <Editable tag="h2" value={data.title} onCommit={(v) => onCommit('title', v)} />
        <div className="s-test-grid">
          {[1, 2, 3].map((n) => (
            <div className="s-test-card" key={n}>
              <Editable tag="p" value={data[`t${n}q`]} onCommit={(v) => onCommit(`t${n}q`, v)} className="s-test-quote" />
              <div className="s-test-author">
                <div className="s-test-av">{(data[`t${n}n`] || '?').slice(0, 2).toUpperCase()}</div>
                <div>
                  <Editable value={data[`t${n}n`]} onCommit={(v) => onCommit(`t${n}n`, v)} className="s-test-name" />
                  <Editable value={data[`t${n}r`]} onCommit={(v) => onCommit(`t${n}r`, v)} className="s-test-role" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }
  if (type === 'pricing') {
    return (
      <div className={`${wrapperClass} s-pricing`} onClick={onSelect}>
        {toolbar}
        <Editable tag="h2" value={data.title} onCommit={(v) => onCommit('title', v)} />
        <div className="s-price-grid">
          {[1, 2, 3].map((n) => (
            <div className={`s-price-card ${n === 2 ? 'featured' : ''}`} key={n}>
              <Editable value={data[`p${n}n`]} onCommit={(v) => onCommit(`p${n}n`, v)} className="s-price-name" />
              <Editable value={data[`p${n}p`]} onCommit={(v) => onCommit(`p${n}p`, v)} className="s-price-num" />
              <div className="s-price-per">/month</div>
              <ul className="s-price-features">
                {(data[`p${n}f`] || '').split(',').map((f, i) => <li key={i}>{f.trim()}</li>)}
              </ul>
              <div className="text-[10px] text-slate-400 mb-2">(edit features via chat)</div>
            </div>
          ))}
        </div>
      </div>
    )
  }
  if (type === 'cta') {
    return (
      <div className={`${wrapperClass} s-cta`} onClick={onSelect}>
        {toolbar}
        <Editable tag="h2" value={data.headline} onCommit={(v) => onCommit('headline', v)} />
        <Editable tag="p" value={data.sub} onCommit={(v) => onCommit('sub', v)} />
        <Editable value={data.cta} onCommit={(v) => onCommit('cta', v)} className="s-cta-btn" />
      </div>
    )
  }
  // footer
  return (
    <div className={`${wrapperClass} s-footer`} onClick={onSelect}>
      {toolbar}
      <Editable value={data.logo} onCommit={(v) => onCommit('logo', v)} className="s-footer-logo" />
      <div className="s-footer-links"><span>Privacy</span><span>Terms</span><span>Contact</span></div>
      <Editable value={data.copy} onCommit={(v) => onCommit('copy', v)} className="s-footer-copy" />
    </div>
  )
}
