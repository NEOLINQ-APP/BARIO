'use client'

import { useState, createElement } from 'react'
import './builder-sections.css'

type SectionType = 'nav' | 'hero' | 'features' | 'stats' | 'testimonial' | 'pricing' | 'cta' | 'footer'
type SectionData = Record<string, string>
type Section = { id: string; type: SectionType; data: SectionData }
type ChatMsg = { role: 'zeus' | 'user'; text: string }

const SECTION_LABELS: Record<SectionType, string> = {
  nav: 'Nav', hero: 'Hero', features: 'Features', stats: 'Stats',
  testimonial: 'Testimonials', pricing: 'Pricing', cta: 'CTA', footer: 'Footer',
}

const DEFAULTS: Record<SectionType, SectionData> = {
  nav: { logo: '⚡ YourBrand' },
  hero: { headline: 'Your Powerful Headline Goes Here', sub: 'A compelling description that explains your unique value proposition clearly.', cta: 'Get Started Today' },
  features: { title: 'Why Choose Us', f1t: 'Fast & Reliable', f1d: 'Built for speed and performance at every level.', f2t: 'Secure', f2d: 'Enterprise-grade security protecting your data.', f3t: 'Smart', f3d: 'Tools that work the way you think.' },
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

export default function Builder({ initialName, initialSections }: { initialName: string; initialSections: { type: SectionType; data: SectionData }[] }) {
  const [siteName, setSiteName] = useState(initialName)
  const [sections, setSections] = useState<Section[]>(() =>
    initialSections.map((s) => ({ id: newId(), type: s.type, data: s.data }))
  )
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: 'zeus', text: "Hi! I'm Zeus, your AI website builder. Tell me what kind of website you need and I'll build it. Try: \"Build a modern site for a Calgary plumbing company.\"" },
  ])
  const [input, setInput] = useState('')
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

  async function handleSend() {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    addMsg('user', text)
    setBusy(true)

    const isNew = sections.length === 0 || /build|create|make|generate|new site/i.test(text)

    try {
      const res = await fetch('/api/builder/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt: text,
          sections: sections.map((s) => ({ type: s.type, data: s.data })),
          isNew,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Generation failed')
      setSections(renderFieldsFromModel(d.sections))
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
        body: JSON.stringify({ name: siteName, sections: sections.map((s) => ({ type: s.type, data: s.data })) }),
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
    const html = buildExportHtml(siteName, sections)
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
        <a href="/build/templates" className="text-sm text-zinc-400 hover:text-zinc-200">Premium Templates</a>
        <input
          value={siteName}
          onChange={(e) => setSiteName(e.target.value)}
          className="bg-transparent text-sm font-semibold outline-none border-b border-transparent focus:border-zinc-700"
        />
        <div className="ml-auto flex items-center gap-2">
          {saveMsg && <span className="text-xs text-zinc-400">{saveMsg}</span>}
          <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 rounded-lg border border-zinc-700 text-xs font-semibold disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={handleExport} className="px-3 py-1.5 rounded-lg bg-[#f59e0b] text-[#1a1200] text-xs font-semibold">
            Export HTML
          </button>
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
            <div className="flex flex-wrap gap-1.5 mb-2">
              {['business', 'restaurant', 'agency'].map((t) => (
                <button key={t} onClick={() => loadTemplate(t)} className="text-[10px] px-2 py-1 rounded-full border border-zinc-700 text-zinc-400 hover:text-zinc-200 capitalize">
                  {t} template
                </button>
              ))}
            </div>
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
                placeholder="Describe your website or ask for changes…"
                rows={2}
                className="flex-1 bg-[#131b2a] border border-zinc-700 rounded-xl px-3 py-2 text-xs outline-none resize-none"
              />
              <button onClick={handleSend} disabled={busy} className="px-3 rounded-xl bg-[#1a56db] text-white text-xs font-semibold disabled:opacity-50">
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
          <div className="flex-1 overflow-y-auto p-6">
            <div className="bg-white rounded-lg shadow-2xl max-w-5xl mx-auto overflow-hidden min-h-[400px]">
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
              <div className="s-feat-icon">✨</div>
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

function sectionToHtml(type: SectionType, data: SectionData): string {
  switch (type) {
    case 'nav':
      return `<div class="s-nav"><div class="s-nav-logo">${data.logo}</div><div class="s-nav-links"><span>Home</span><span>About</span><span>Services</span><span>Contact</span></div></div>`
    case 'hero':
      return `<div class="s-hero"><h1>${data.headline}</h1><p>${data.sub}</p><div class="s-hero-btn">${data.cta}</div></div>`
    case 'features':
      return `<div class="s-features"><h2>${data.title}</h2><div class="s-features-grid">${[1, 2, 3].map((n) => `<div class="s-feat-card"><div class="s-feat-icon">✨</div><h3>${data[`f${n}t`]}</h3><p>${data[`f${n}d`]}</p></div>`).join('')}</div></div>`
    case 'stats':
      return `<div class="s-stats"><div class="s-stats-grid">${[1, 2, 3, 4].map((n) => `<div><div class="s-stat-num">${data[`s${n}n`]}</div><div class="s-stat-label">${data[`s${n}l`]}</div></div>`).join('')}</div></div>`
    case 'testimonial':
      return `<div class="s-testimonial"><h2>${data.title}</h2><div class="s-test-grid">${[1, 2, 3].map((n) => `<div class="s-test-card"><p class="s-test-quote">"${data[`t${n}q`]}"</p><div class="s-test-author"><div class="s-test-av">${(data[`t${n}n`] || '?').slice(0, 2).toUpperCase()}</div><div><div class="s-test-name">${data[`t${n}n`]}</div><div class="s-test-role">${data[`t${n}r`]}</div></div></div></div>`).join('')}</div></div>`
    case 'pricing':
      return `<div class="s-pricing"><h2>${data.title}</h2><div class="s-price-grid">${[1, 2, 3].map((n) => `<div class="s-price-card ${n === 2 ? 'featured' : ''}"><div class="s-price-name">${data[`p${n}n`]}</div><div class="s-price-num">${data[`p${n}p`]}</div><div class="s-price-per">/month</div><ul class="s-price-features">${(data[`p${n}f`] || '').split(',').map((f) => `<li>${f.trim()}</li>`).join('')}</ul></div>`).join('')}</div></div>`
    case 'cta':
      return `<div class="s-cta"><h2>${data.headline}</h2><p>${data.sub}</p><div class="s-cta-btn">${data.cta}</div></div>`
    case 'footer':
      return `<div class="s-footer"><div class="s-footer-logo">${data.logo}</div><div class="s-footer-links"><span>Privacy</span><span>Terms</span><span>Contact</span></div><div class="s-footer-copy">${data.copy}</div></div>`
  }
}

const EXPORT_CSS = `
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',sans-serif}
.s-nav{background:#0A2342;color:white;padding:16px 48px;display:flex;align-items:center;justify-content:space-between}
.s-nav-logo{font-size:20px;font-weight:800}
.s-nav-links{display:flex;gap:28px;font-size:13px;opacity:0.8}
.s-hero{background:linear-gradient(135deg,#0A2342 0%,#1e3a6e 60%,#1a56db 100%);color:white;padding:96px 64px;text-align:center}
.s-hero h1{font-size:52px;font-weight:800;margin-bottom:18px;line-height:1.15}
.s-hero p{font-size:19px;opacity:0.85;margin-bottom:36px;max-width:580px;margin-left:auto;margin-right:auto}
.s-hero-btn{background:linear-gradient(135deg,#fbbf24,#f97316);color:white;padding:16px 44px;border-radius:50px;font-size:16px;font-weight:700;display:inline-block}
.s-features{padding:88px 64px;background:#f8faff}
.s-features h2{text-align:center;font-size:38px;font-weight:800;margin-bottom:56px;color:#0A2342}
.s-features-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:28px}
.s-feat-card{background:white;border-radius:20px;padding:36px;box-shadow:0 4px 24px rgba(10,35,66,0.06);text-align:center}
.s-feat-icon{font-size:44px;margin-bottom:18px}
.s-feat-card h3{font-size:19px;font-weight:700;margin-bottom:10px;color:#0A2342}
.s-feat-card p{font-size:14px;color:#64748b;line-height:1.65}
.s-stats{padding:56px 64px;background:white}
.s-stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:24px;text-align:center}
.s-stat-num{font-size:42px;font-weight:800;color:#1a56db}
.s-stat-label{font-size:13px;color:#64748b;margin-top:6px}
.s-testimonial{padding:88px 64px;background:#f0f4ff}
.s-testimonial h2{text-align:center;font-size:38px;font-weight:800;margin-bottom:48px;color:#0A2342}
.s-test-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
.s-test-card{background:white;border-radius:16px;padding:28px;box-shadow:0 4px 16px rgba(10,35,66,0.06)}
.s-test-quote{font-size:14px;color:#64748b;line-height:1.7;margin-bottom:20px;font-style:italic}
.s-test-author{display:flex;align-items:center;gap:10px}
.s-test-av{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#1a56db,#0A2342);display:flex;align-items:center;justify-content:center;color:white;font-size:13px;font-weight:700}
.s-test-name{font-size:13px;font-weight:700;color:#0A2342}
.s-test-role{font-size:11px;color:#94a3b8}
.s-pricing{padding:88px 64px;background:white}
.s-pricing h2{text-align:center;font-size:38px;font-weight:800;margin-bottom:48px;color:#0A2342}
.s-price-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
.s-price-card{border:2px solid #e2e8f0;border-radius:20px;padding:36px;text-align:center}
.s-price-card.featured{border-color:#1a56db;background:#f0f4ff;transform:scale(1.04)}
.s-price-name{font-size:16px;font-weight:700;color:#0A2342;margin-bottom:8px}
.s-price-num{font-size:42px;font-weight:800;color:#1a56db;margin-bottom:4px}
.s-price-per{font-size:13px;color:#94a3b8;margin-bottom:24px}
.s-price-features{list-style:none;text-align:left;margin-bottom:28px}
.s-price-features li{font-size:13px;color:#64748b;padding:6px 0;border-bottom:1px solid #e2e8f0}
.s-cta{background:linear-gradient(135deg,#1a56db,#0A2342);color:white;padding:88px 64px;text-align:center}
.s-cta h2{font-size:42px;font-weight:800;margin-bottom:18px}
.s-cta p{font-size:19px;opacity:0.88;margin-bottom:36px;max-width:560px;margin-left:auto;margin-right:auto}
.s-cta-btn{background:white;color:#1a56db;padding:16px 44px;border-radius:50px;font-size:16px;font-weight:700;display:inline-block}
.s-footer{background:#0f0f1a;color:white;padding:48px 64px;display:flex;align-items:center;justify-content:space-between}
.s-footer-logo{font-size:18px;font-weight:800;opacity:0.9}
.s-footer-links{display:flex;gap:24px;font-size:13px;opacity:0.5}
.s-footer-copy{font-size:12px;opacity:0.4}
@media(max-width:768px){
  .s-nav{flex-direction:column;gap:12px;padding:16px 20px;text-align:center}
  .s-hero{padding:60px 24px}.s-hero h1{font-size:32px}
  .s-features{padding:60px 24px}.s-features-grid{grid-template-columns:1fr}
  .s-stats{padding:40px 24px}.s-stats-grid{grid-template-columns:repeat(2,1fr)}
  .s-test-grid{grid-template-columns:1fr}.s-testimonial{padding:60px 24px}
  .s-price-grid{grid-template-columns:1fr}.s-pricing{padding:60px 24px}
  .s-cta{padding:60px 24px}.s-cta h2{font-size:28px}
  .s-footer{flex-direction:column;gap:16px;text-align:center;padding:32px 24px}
}
`

function buildExportHtml(name: string, sections: Section[]): string {
  const body = sections.map((s) => sectionToHtml(s.type, s.data)).join('\n')
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${name} — Built with Bario</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>${EXPORT_CSS}</style>
</head>
<body>
${body}
<!-- Built with Bario — bario.ca -->
</body>
</html>`
}
