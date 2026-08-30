'use client'

import { useState, useRef, useEffect, createElement } from 'react'
import { useRouter } from 'next/navigation'
import { uploadFile } from '@/lib/clientUpload'
import './builder-sections.css'
import ProfileMenu from '@/components/ProfileMenu'
import PublishPanel from '@/components/PublishPanel'
import BusinessProfilePanel from '@/components/BusinessProfilePanel'
import { buildSiteHtml, backgroundVars } from '@/lib/renderSite'
import { STYLE_PRESETS, STYLE_PRESET_KEYS, DEFAULT_STYLE_PRESET, isStylePresetKey, type StylePresetKey } from '@/lib/stylePresets'

type SectionType = 'nav' | 'hero' | 'features' | 'stats' | 'testimonial' | 'pricing' | 'cta' | 'footer' | 'gallery' | 'team' | 'faq' | 'contact' | 'map' | 'logos' | 'pagelinks'
type SectionData = Record<string, string>
type Section = { id: string; type: SectionType; data: SectionData }
type Page = { id: string; name: string; slug: string; sections: Section[] }
type ChatMsg = { role: 'assistant' | 'user'; text: string }
type Theme = { primary: string; accent: string; style?: string; backgroundStyle?: 'solid' | 'gradient' }

const SECTION_LABELS: Record<SectionType, string> = {
  nav: 'Nav', hero: 'Hero', features: 'Features', stats: 'Stats',
  testimonial: 'Testimonials', pricing: 'Pricing', cta: 'CTA', footer: 'Footer',
  gallery: 'Gallery', team: 'Team', faq: 'FAQ', contact: 'Contact', map: 'Map', logos: 'Logo Cloud', pagelinks: 'Category Links',
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
  gallery: { title: 'Our Work', g1img: '', g2img: '', g3img: '', g4img: '', g5img: '', g6img: '' },
  team: { title: 'Meet The Team', m1img: '', m1n: 'Jamie Lee', m1r: 'Founder & CEO', m2img: '', m2n: 'Alex Rivera', m2r: 'Head of Operations', m3img: '', m3n: 'Sam Chen', m3r: 'Lead Designer' },
  faq: { title: 'Frequently Asked Questions', q1q: 'How does it work?', q1a: 'Answer this common question clearly and simply.', q2q: 'What is included?', q2a: 'Describe what customers get.', q3q: 'How do I get started?', q3a: 'Explain the first step.', q4q: '', q4a: '' },
  contact: { title: 'Get In Touch', sub: "We'd love to hear from you.", email: '', phone: '', address: '' },
  map: { title: 'Find Us', address: '' },
  logos: { title: 'Trusted By', l1n: 'Company A', l2n: 'Company B', l3n: 'Company C', l4n: 'Company D', l5n: '', l6n: '' },
  pagelinks: { title: 'Explore Our Services', c1n: 'Category One', c1s: '', c1d: 'Short description of this category.', c1img: '', c2n: '', c2s: '', c2d: '', c2img: '', c3n: '', c3s: '', c3d: '', c3img: '' },
}

// Local quick-start templates are multi-page now too — a Home landing page
// plus a Contact page, rather than one long page. The AI builder (or the
// user) can still add more pages from here via chat or the page tabs.
const TEMPLATES: Record<string, { name: string; slug: string; sections: { type: SectionType; data: SectionData }[] }[]> = {
  business: [
    {
      name: 'Home', slug: '', sections: [
        { type: 'nav', data: { logo: 'BusinessPro' } },
        { type: 'hero', data: { headline: 'Grow Your Business With Confidence', sub: 'Professional services tailored to your unique needs and goals.', cta: 'Get Free Consultation' } },
        { type: 'stats', data: { s1n: '500+', s1l: 'Happy Clients', s2n: '15yr', s2l: 'Experience', s3n: '98%', s3l: 'Success Rate', s4n: '24/7', s4l: 'Support' } },
        { type: 'features', data: { title: 'What We Offer', f1t: 'Expert Team', f1d: 'Seasoned professionals dedicated to your success.', f2t: 'Proven Results', f2d: 'Track record of delivering measurable outcomes.', f3t: 'Always Available', f3d: 'Round-the-clock support for your business.' } },
        { type: 'cta', data: { headline: 'Ready to Transform Your Business?', sub: 'Join 500+ businesses already succeeding with us.', cta: 'Start Today' } },
        { type: 'footer', data: { logo: 'BusinessPro', copy: '© 2026 BusinessPro. All rights reserved.' } },
      ],
    },
    {
      name: 'Contact', slug: 'contact', sections: [
        { type: 'nav', data: { logo: 'BusinessPro' } },
        { type: 'contact', data: { title: 'Get In Touch', sub: "We'd love to hear from you.", email: '', phone: '', address: '' } },
        { type: 'footer', data: { logo: 'BusinessPro', copy: '© 2026 BusinessPro. All rights reserved.' } },
      ],
    },
  ],
  restaurant: [
    {
      name: 'Home', slug: '', sections: [
        { type: 'nav', data: { logo: 'La Bella' } },
        { type: 'hero', data: { headline: 'Authentic Flavours, Unforgettable Moments', sub: 'Experience the finest cuisine crafted with fresh local ingredients.', cta: 'Reserve Your Table' } },
        { type: 'features', data: { title: 'Why Dine With Us', f1t: 'Fresh Ingredients', f1d: 'Locally sourced, seasonal ingredients in every dish.', f2t: 'Award-Winning Chef', f2d: '15 years of culinary excellence.', f3t: 'Perfect Atmosphere', f3d: 'Intimate setting perfect for any occasion.' } },
        { type: 'cta', data: { headline: 'Book Your Table Tonight', sub: 'Available 7 days a week.', cta: 'Make a Reservation' } },
        { type: 'footer', data: { logo: 'La Bella', copy: '© 2026 La Bella Restaurant.' } },
      ],
    },
    {
      name: 'Contact', slug: 'contact', sections: [
        { type: 'nav', data: { logo: 'La Bella' } },
        { type: 'contact', data: { title: 'Reservations & Contact', sub: 'Call ahead or stop by.', email: '', phone: '', address: '' } },
        { type: 'footer', data: { logo: 'La Bella', copy: '© 2026 La Bella Restaurant.' } },
      ],
    },
  ],
  agency: [
    {
      name: 'Home', slug: '', sections: [
        { type: 'nav', data: { logo: 'Bario Agency' } },
        { type: 'hero', data: { headline: 'Results For Your Business', sub: 'We combine strategy with execution to deliver real results.', cta: 'See Our Work' } },
        { type: 'features', data: { title: 'Our Services', f1t: 'Marketing', f1d: 'Campaigns that convert.', f2t: 'Web Development', f2d: 'Beautiful, fast websites.', f3t: 'Automation', f3d: 'Workflows that run 24/7.' } },
        { type: 'cta', data: { headline: "Let's Build Something Great", sub: 'Book a free strategy call.', cta: 'Get Started' } },
        { type: 'footer', data: { logo: 'Bario Agency', copy: '© 2026 Bario Agency.' } },
      ],
    },
    {
      name: 'Pricing', slug: 'pricing', sections: [
        { type: 'nav', data: { logo: 'Bario Agency' } },
        { type: 'pricing', data: { title: 'Investment Plans', p1n: 'Starter', p1p: '$997', p1f: '5 Pages,Support', p2n: 'Growth', p2p: '$2,497', p2f: '10 Pages,E-commerce,SEO', p3n: 'Enterprise', p3p: 'Custom', p3f: 'Unlimited Pages,Priority Support' } },
        { type: 'footer', data: { logo: 'Bario Agency', copy: '© 2026 Bario Agency.' } },
      ],
    },
    {
      name: 'Contact', slug: 'contact', sections: [
        { type: 'nav', data: { logo: 'Bario Agency' } },
        { type: 'contact', data: { title: 'Get In Touch', sub: "Let's talk about your project.", email: '', phone: '', address: '' } },
        { type: 'footer', data: { logo: 'Bario Agency', copy: '© 2026 Bario Agency.' } },
      ],
    },
  ],
}

// What each quick template actually covers, so a chat message like "use the
// restaurant template" can be matched to a real template instead of being
// sent to the AI, which has no concept of these local templates and would
// just free-generate something loosely related — which is exactly the
// "random website instead of the template I asked for" bug this avoids.
const TEMPLATE_ALIASES: Record<string, string[]> = {
  business: ['business', 'corporate', 'professional services', 'consulting'],
  restaurant: ['restaurant', 'cafe', 'café', 'dining', 'food'],
  agency: ['agency', 'marketing agency', 'digital agency', 'creative agency'],
}
// Requires an actual "apply an existing template" verb near the word
// "template" (not just any mention of it — e.g. "no template, build from
// scratch" shouldn't trigger this).
const TEMPLATE_INTENT_RE = /\b(use|load|apply|switch to|upload|import|give me|show me|open|pick|choose)\b[\s\S]{0,40}\btemplate/i

function matchTemplateAlias(text: string): string | null {
  const lower = text.toLowerCase()
  for (const [key, aliases] of Object.entries(TEMPLATE_ALIASES)) {
    if (aliases.some((a) => lower.includes(a))) return key
  }
  return null
}

// Native <option> elements largely ignore Tailwind's text/bg utility classes
// in their dropdown popup across browsers — without this, the popup falls
// back to inheriting the parent <select>'s color as text against the
// browser's own (usually white) native listbox background, which is how a
// dark-themed select ended up rendering near-white text on a white popup.
// Inline style is what browsers reliably honor here, so force a fixed,
// always-readable combo rather than trying to theme the native popup.
const OPTION_STYLE: React.CSSProperties = { backgroundColor: '#ffffff', color: '#1e293b' }

function newId() {
  return crypto.randomUUID()
}

function pagesFromModel(pages: { name: string; slug: string; sections: { type: SectionType; data: SectionData }[] }[]): Page[] {
  return pages.map((p) => ({
    id: newId(),
    name: p.name,
    slug: p.slug,
    sections: p.sections.map((s) => ({ id: newId(), type: s.type, data: s.data })),
  }))
}

// Mirrors the `phase` events app/api/builder/generate/route.ts now sends
// (2026-08-21, surfacing the Gemini review pass that was previously
// invisible — a few real extra seconds of wait with no indication anything
// was happening). 'building' is also the default before any phase event
// has arrived yet, or for phases with no distinct label of their own.
const GEN_PHASE_LABELS: Record<'planning' | 'building' | 'reviewing', string> = {
  planning: 'Sky is planning your site…',
  building: 'Sky is building your site…',
  reviewing: 'Double-checking the details…',
}

// Turns a mid-generation partial object (still missing fields, possibly a
// trailing incomplete array element) into safely renderable pages — used
// only for the live "Sky is building…" preview while a new site streams
// in, never for the authoritative save. `idsRef` assigns each page/section a
// stable id keyed by its position, reused across successive partial calls
// within the same generation, so React sees the same key on every update
// and doesn't remount (and therefore doesn't replay) a section that's
// already on screen — only genuinely new pages/sections mount fresh, which
// is what makes the CSS entrance transition fire once per section instead
// of on every partial refinement.
function safePartialPages(rawPages: unknown, idsRef: React.MutableRefObject<Map<string, string>>): Page[] {
  if (!Array.isArray(rawPages)) return []
  const result: Page[] = []
  rawPages.forEach((p: any, i: number) => {
    if (!p || typeof p !== 'object' || typeof p.slug !== 'string') return
    const pageKey = `p${i}`
    if (!idsRef.current.has(pageKey)) idsRef.current.set(pageKey, newId())
    const pageId = idsRef.current.get(pageKey)!

    const rawSections = Array.isArray(p.sections) ? p.sections : []
    const sections: Section[] = []
    rawSections.forEach((s: any, si: number) => {
      if (!s || typeof s !== 'object' || typeof s.type !== 'string' || !(s.type in SECTION_LABELS)) return
      const sectionKey = `${pageKey}-s${si}`
      if (!idsRef.current.has(sectionKey)) idsRef.current.set(sectionKey, newId())
      const rawData = s.data && typeof s.data === 'object' ? s.data : {}
      const data: SectionData = {}
      for (const [field, value] of Object.entries(rawData)) {
        if (typeof value !== 'string') continue
        // Image fields hold a search phrase until the final resolved pass —
        // showing that as an <img src> renders a broken-image icon, so only
        // pass through values that are already a real URL (a user-attached
        // photo the model echoes back verbatim shows up this way).
        if (/img$/i.test(field) || field === 'image') {
          data[field] = value.startsWith('http') ? value : ''
        } else {
          data[field] = value
        }
      }
      sections.push({ id: idsRef.current.get(sectionKey)!, type: s.type as SectionType, data })
    })

    result.push({ id: pageId, name: typeof p.name === 'string' && p.name.trim() ? p.name : `Page ${i + 1}`, slug: p.slug, sections })
  })
  return result
}

// One path segment of a slug, e.g. "Plumbing Repair" -> "plumbing-repair".
// A full slug is one or more of these joined with "/" — the "/" itself is
// what makes a page a child of another (see the Page type's comment).
function slugSegment(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'page'
}

function uniqueSlug(base: string, existing: Set<string>): string {
  let slug = base
  let n = 2
  while (existing.has(slug)) {
    slug = `${base}-${n}`
    n++
  }
  return slug
}

export default function Builder({
  siteId,
  initialName,
  initialPages,
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
  initialHasUnpublishedChanges,
  initialLastPublishedAt,
}: {
  siteId: string | null
  initialName: string
  initialPages: { name: string; slug: string; sections: { type: SectionType; data: SectionData }[] }[]
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
  initialHasUnpublishedChanges: boolean
  initialLastPublishedAt: string | null
}) {
  const router = useRouter()
  const [currentSiteId, setCurrentSiteId] = useState(siteId)
  const [siteName, setSiteName] = useState(initialName)
  const [theme, setTheme] = useState<Theme>(initialTheme)

  // The builder app's OWN light/dark chrome — unrelated to `theme` above,
  // which is the colors of the WEBSITE being built. Defaults to dark
  // (today's only look) so existing users see no change until they opt in;
  // toggling flips the `dark` class on <html>, which every themed class in
  // this file and its modals key off via Tailwind's `dark:` variant.
  const [uiTheme, setUiTheme] = useState<'dark' | 'light'>('dark')
  useEffect(() => {
    const stored = localStorage.getItem('bario-ui-theme')
    if (stored === 'light' || stored === 'dark') setUiTheme(stored)
  }, [])
  useEffect(() => {
    document.documentElement.classList.toggle('dark', uiTheme === 'dark')
    localStorage.setItem('bario-ui-theme', uiTheme)
  }, [uiTheme])
  const [metaTitle, setMetaTitle] = useState(initialMetaTitle)
  const [metaDescription, setMetaDescription] = useState(initialMetaDescription)
  const [analyticsId, setAnalyticsId] = useState(initialAnalyticsId)
  const [faviconUrl, setFaviconUrl] = useState(initialFaviconUrl)
  // Lifted up (rather than left as PublishPanel-local state) because the
  // panel unmounts on close — local state there would forget a subdomain
  // you'd just published the moment you closed and reopened the panel,
  // making it look like you had to type it in again.
  const [subdomain, setSubdomain] = useState(initialSubdomain ?? '')
  const [published, setPublished] = useState(initialPublished)
  const [customDomain, setCustomDomain] = useState(initialCustomDomain ?? '')
  const [domainStatus, setDomainStatus] = useState(initialDomainStatus)
  const [showBadge, setShowBadge] = useState(initialShowBadge)
  const [businessName, setBusinessName] = useState(initialBusinessName)
  const [businessCategory, setBusinessCategory] = useState(initialBusinessCategory)
  const [businessHours, setBusinessHours] = useState(initialBusinessHours)
  const [businessLocation, setBusinessLocation] = useState(initialBusinessLocation)
  const [showProfile, setShowProfile] = useState(false)
  const [showPublish, setShowPublish] = useState(false)
  const [credits, setCredits] = useState(initialCredits)
  const unlimitedCredits = credits === -1
  const outOfCredits = !unlimitedCredits && credits <= 0

  const [pages, setPages] = useState<Page[]>(() => pagesFromModel(initialPages.length ? initialPages : [{ name: 'Home', slug: '', sections: [] }]))
  const [activePageId, setActivePageId] = useState<string>(() => pages[0]?.id ?? '')
  const activePage = pages.find((p) => p.id === activePageId) ?? pages[0]
  const sections = activePage.sections

  // Live preview while a brand-new site streams in — see safePartialPages
  // above. Only used for new builds (isNew), not edits: an edit's current
  // page is already on screen and worth looking at while the (usually much
  // smaller/faster) change computes, so it stays put until the real result
  // lands rather than being replaced by a reconstruction of itself.
  const [streamingPages, setStreamingPages] = useState<Page[] | null>(null)
  const streamIdsRef = useRef<Map<string, string>>(new Map())
  const streamingPreviewPage = streamingPages?.find((p) => p.slug === activePage.slug) ?? streamingPages?.[0] ?? null

  function setActivePageSections(updater: (secs: Section[]) => Section[]) {
    setPages((ps) => ps.map((p) => (p.id === activePage.id ? { ...p, sections: updater(p.sections) } : p)))
  }

  const [dirty, setDirty] = useState(false)
  const canvasScrollRef = useRef<HTMLDivElement>(null)
  const sectionsLengthRef = useRef(sections.length)

  useEffect(() => {
    if (sections.length > sectionsLengthRef.current) {
      requestAnimationFrame(() => {
        canvasScrollRef.current?.scrollTo({ top: canvasScrollRef.current.scrollHeight, behavior: 'smooth' })
      })
    }
    sectionsLengthRef.current = sections.length
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections])

  const activeStyle: StylePresetKey = isStylePresetKey(theme.style) ? theme.style : DEFAULT_STYLE_PRESET

  // The canvas can show any of a handful of style presets, each needing its
  // own Google Font family — load (or swap) a single <link> tag for whichever
  // preset is currently active rather than loading every preset's fonts
  // up front.
  useEffect(() => {
    const href = STYLE_PRESETS[activeStyle].googleFontsHref
    let link = document.getElementById('b-preset-font') as HTMLLinkElement | null
    if (!link) {
      link = document.createElement('link')
      link.id = 'b-preset-font'
      link.rel = 'stylesheet'
      document.head.appendChild(link)
    }
    if (link.href !== href) link.href = href
  }, [activeStyle])

  // Autosave: previously the only way work landed in the database was the
  // manual Save button, so a refresh mid-session (or the AI builder generating a site
  // the user never explicitly clicked Save on) silently threw everything
  // away. Debounce a save shortly after any real change to pages/theme/
  // name instead — short enough that a refresh can't land in the gap for
  // long, long enough not to fire on every keystroke (field edits only
  // commit on blur, so this mostly debounces distinct edits, not typing).
  const mountedRef = useRef(false)
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }
    if (pages.every((p) => p.sections.length === 0) && !currentSiteId) return
    setDirty(true)
    const t = setTimeout(() => { handleSave() }, 1200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages, theme, siteName])

  // Second line of defense: if a save is still pending (debounce window or
  // in-flight request) when the user tries to close/refresh the tab, warn
  // them instead of silently losing the last few edits.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!dirty) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: 'assistant', text: "Hi! I'm Sky, your website builder. Tell me what kind of website you need and I'll build it — a real multi-page site, not just one long page. Try: \"Build a site for a Calgary plumbing company.\"" },
  ])
  const [input, setInput] = useState('')
  const [attachment, setAttachment] = useState<{ url: string; kind: 'image' | 'video' | 'audio'; name: string } | null>(null)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const htmlFileInputRef = useRef<HTMLInputElement>(null)
  const [importingHtml, setImportingHtml] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [genPhase, setGenPhase] = useState<'planning' | 'building' | 'reviewing' | null>(null)
  const [confirmDeletePage, setConfirmDeletePage] = useState<{ id: string; hasChildren: boolean } | null>(null)
  const [homePageDeleteBlocked, setHomePageDeleteBlocked] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  // Preview -> approve -> publish: autosave always lands in draft_* columns
  // server-side now (see app/api/builder/site/route.ts), so hasUnpublishedChanges
  // tracks whether there's a draft not yet promoted to the live site.
  const [hasUnpublishedChanges, setHasUnpublishedChanges] = useState(initialHasUnpublishedChanges)
  const [lastPublishedAt, setLastPublishedAt] = useState(initialLastPublishedAt)
  const [publishingDraft, setPublishingDraft] = useState(false)
  const [publishMsg, setPublishMsg] = useState<string | null>(null)

  async function handlePublishDraft() {
    if (!currentSiteId || !hasUnpublishedChanges) return
    setPublishingDraft(true)
    setPublishMsg(null)
    try {
      const res = await fetch('/api/builder/site/publish-draft', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ siteId: currentSiteId }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Publish failed')
      setHasUnpublishedChanges(false)
      setLastPublishedAt(new Date().toISOString())
      setPublishMsg('Published')
    } catch (err: any) {
      setPublishMsg(`Failed: ${err.message}`)
    }
    setPublishingDraft(false)
    setTimeout(() => setPublishMsg(null), 3000)
  }

  function addMsg(role: ChatMsg['role'], text: string) {
    setMessages((m) => [...m, { role, text }])
  }

  function updateField(id: string, field: string, value: string) {
    setActivePageSections((secs) => secs.map((s) => (s.id === id ? { ...s, data: { ...s.data, [field]: value } } : s)))
  }

  function removeSection(id: string) {
    setActivePageSections((secs) => secs.filter((s) => s.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  function moveSection(id: string, dir: -1 | 1) {
    setActivePageSections((secs) => {
      const idx = secs.findIndex((s) => s.id === id)
      const swapIdx = idx + dir
      if (idx === -1 || swapIdx < 0 || swapIdx >= secs.length) return secs
      const copy = [...secs]
      ;[copy[idx], copy[swapIdx]] = [copy[swapIdx], copy[idx]]
      return copy
    })
  }

  function duplicateSection(id: string) {
    setActivePageSections((secs) => {
      const idx = secs.findIndex((s) => s.id === id)
      if (idx === -1) return secs
      const copy = [...secs]
      copy.splice(idx + 1, 0, { ...secs[idx], id: newId() })
      return copy
    })
  }

  function addBlankSection(type: SectionType) {
    setActivePageSections((secs) => [...secs, { id: newId(), type, data: { ...DEFAULTS[type] } }])
  }

  function loadTemplate(name: string) {
    const tmpl = TEMPLATES[name]
    if (!tmpl) return
    const newPages = pagesFromModel(tmpl)
    setPages(newPages)
    setActivePageId(newPages[0].id)
    addMsg('assistant', `${name.charAt(0).toUpperCase() + name.slice(1)} template loaded (${newPages.length} pages). Click any text to edit it directly, use the page tabs above the canvas to switch pages, or ask me to change anything.`)
  }

  function addPage() {
    const name = window.prompt('New page name (e.g. "About", "Services", "Gallery")')?.trim()
    if (!name) return
    const existing = new Set(pages.map((p) => p.slug))
    const slug = uniqueSlug(slugSegment(name), existing)
    const newPage: Page = {
      id: newId(),
      name,
      slug,
      sections: [
        { id: newId(), type: 'nav', data: { ...(pages[0]?.sections.find((s) => s.type === 'nav')?.data ?? DEFAULTS.nav) } },
        { id: newId(), type: 'footer', data: { ...(pages[0]?.sections.find((s) => s.type === 'footer')?.data ?? DEFAULTS.footer) } },
      ],
    }
    setPages((ps) => [...ps, newPage])
    setActivePageId(newPage.id)
  }

  // Nests a new page under any existing page (top-level or already-nested) —
  // this is how a "Services" page grows dedicated sub-pages per category
  // (services/plumbing-repair, services/drain-cleaning, ...) instead of one
  // long list, and how those sub-pages can themselves grow further children.
  function addSubPage(parentId: string) {
    const parent = pages.find((p) => p.id === parentId)
    if (!parent) return
    const name = window.prompt(`New sub-page name under "${parent.name}" (e.g. a specific service or category)`)?.trim()
    if (!name) return
    const existing = new Set(pages.map((p) => p.slug))
    const slug = uniqueSlug(`${parent.slug}/${slugSegment(name)}`, existing)
    const newPage: Page = {
      id: newId(),
      name,
      slug,
      sections: [
        { id: newId(), type: 'nav', data: { ...(pages[0]?.sections.find((s) => s.type === 'nav')?.data ?? DEFAULTS.nav) } },
        { id: newId(), type: 'footer', data: { ...(pages[0]?.sections.find((s) => s.type === 'footer')?.data ?? DEFAULTS.footer) } },
      ],
    }
    setPages((ps) => [...ps, newPage])
    setActivePageId(newPage.id)
  }

  function renamePage(id: string) {
    const idx = pages.findIndex((p) => p.id === id)
    if (idx === -1) return
    const page = pages[idx]
    const name = window.prompt('Rename page', page.name)?.trim()
    if (!name) return
    if (idx === 0) {
      setPages((ps) => ps.map((p) => (p.id === id ? { ...p, name } : p)))
      return
    }
    setPages((ps) => {
      const parentPrefix = page.slug.includes('/') ? page.slug.slice(0, page.slug.lastIndexOf('/')) : null
      const existing = new Set(ps.filter((p) => p.id !== id).map((p) => p.slug))
      const base = parentPrefix ? `${parentPrefix}/${slugSegment(name)}` : slugSegment(name)
      const newSlug = uniqueSlug(base, existing)
      return ps.map((p) => {
        if (p.id === id) return { ...p, name, slug: newSlug }
        // Cascade: any descendant of the OLD slug moves under the NEW one,
        // so renaming "Services" doesn't orphan services/plumbing-repair.
        if (p.slug.startsWith(`${page.slug}/`)) return { ...p, slug: newSlug + p.slug.slice(page.slug.length) }
        return p
      })
    })
  }

  // window.confirm()/alert() block the JS main thread until the user
  // responds — harmless functionally, but a real performance-monitoring
  // tool (INP) flags that block as if it were slow code, which reads as a
  // scary "error" popup to anyone watching (2026-08-21). Replaced with a
  // real React modal (confirmDeletePage state below) — same UX, no blocking
  // dialog for any monitoring tool to (mis)report on.
  function deletePage(id: string) {
    if (pages.length <= 1) return
    const page = pages.find((p) => p.id === id)
    if (!page) return
    if (pages[0]?.id === id) {
      setHomePageDeleteBlocked(true)
      return
    }
    const hasChildren = pages.some((p) => p.slug.startsWith(`${page.slug}/`))
    setConfirmDeletePage({ id, hasChildren })
  }

  function performDeletePage() {
    if (!confirmDeletePage) return
    const { id } = confirmDeletePage
    const page = pages.find((p) => p.id === id)
    setConfirmDeletePage(null)
    if (!page) return
    setPages((ps) => ps.filter((p) => p.id !== id && !p.slug.startsWith(`${page.slug}/`)))
    if (activePageId === id || activePage.slug.startsWith(`${page.slug}/`)) setActivePageId(pages[0].id)
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
      const blob = await uploadFile(file)
      setAttachment({ url: blob.url, kind, name: file.name })
    } catch (err: any) {
      setUploadError(err.message ?? 'Upload failed')
    }
    setUploadingFile(false)
  }

  // Brings in a user's own already-built HTML file. This switches the site
  // to raw-HTML/template mode (same as picking a Premium Template), which is
  // a different editing experience than the AI builder's section canvas — confirm
  // first if there's real work on the canvas that would no longer be shown.
  async function handleImportHtml(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (pages.some((p) => p.sections.length > 0)) {
      const ok = window.confirm(
        "This replaces the current site with your uploaded HTML file and switches to raw-HTML editing mode (the AI chat builder won't apply anymore). Continue?"
      )
      if (!ok) return
    }
    setImportingHtml(true)
    setImportError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      if (currentSiteId) form.append('siteId', currentSiteId)
      const res = await fetch('/api/sites/import-html', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to import HTML')
      window.location.href = `/build?site=${data.id}`
    } catch (err: any) {
      setImportError(err.message)
      setImportingHtml(false)
    }
  }

  async function handleSend() {
    const text = input.trim()
    if ((!text && !attachment) || busy) return
    setInput('')
    const currentAttachment = attachment
    setAttachment(null)
    addMsg('user', currentAttachment ? `${text} 📎 ${currentAttachment.name}` : text)

    if (!currentAttachment && TEMPLATE_INTENT_RE.test(text)) {
      const matchedKey = matchTemplateAlias(text)
      if (matchedKey) {
        loadTemplate(matchedKey)
        return
      }
      addMsg(
        'assistant',
        "I can't pull in a premium template through chat yet. Click \"Premium Templates\" at the top of the screen to browse full custom designs, or \"Upload your own HTML\" below to bring in a site file you already have. I do have business, restaurant, and agency quick-start templates ready right now though — click one below, or tell me what to build and I'll design it from scratch."
      )
      return
    }

    setBusy(true)
    setGenPhase('planning')

    const isNew = pages.every((p) => p.sections.length === 0) || /build|create|make|generate|new site/i.test(text)
    streamIdsRef.current = new Map()
    if (isNew) setStreamingPages([])

    // The response streams progressively now, so a fixed wall-clock abort
    // no longer fits — a big multi-page build can legitimately take 30-60s+
    // of *active* generation. Instead, abort only on genuine silence: reset
    // the timer on every chunk received, so a stalled/killed connection
    // still gets caught quickly while a slow-but-progressing one isn't cut
    // off mid-build. 45s (not something tighter like 20-25s) because the
    // gap BEFORE the first chunk arrives — cold start + model connection
    // setup — measured as long as ~25-30s on its own in testing, before any
    // real inactivity would even begin; once flowing, chunks arrive every
    // ~100ms, so this only ever fires on a genuinely dead connection.
    const controller = new AbortController()
    const IDLE_TIMEOUT_MS = 45_000
    let idleTimer: ReturnType<typeof setTimeout> = setTimeout(() => controller.abort(), IDLE_TIMEOUT_MS)
    const resetIdleTimer = () => {
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => controller.abort(), IDLE_TIMEOUT_MS)
    }

    try {
      const res = await fetch('/api/builder/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt: text || `Use this attached ${currentAttachment?.kind} where it fits best.`,
          pages: pages.map((p) => ({ name: p.name, slug: p.slug, sections: p.sections.map((s) => ({ type: s.type, data: s.data })) })),
          activeSlug: activePage.slug,
          theme,
          isNew,
          businessName,
          businessCategory,
          businessHours,
          businessLocation,
          attachmentUrl: currentAttachment?.url,
          attachmentKind: currentAttachment?.kind,
        }),
        signal: controller.signal,
      })
      if (!res.body) throw new Error('Generation failed — no response received')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let doneEvent: any = null
      let errorMsg: string | null = null

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        resetIdleTimer()
        buffer += decoder.decode(value, { stream: true })
        let nl: number
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl).trim()
          buffer = buffer.slice(nl + 1)
          if (!line) continue
          let evt: any
          try {
            evt = JSON.parse(line)
          } catch {
            continue
          }
          if (evt.type === 'phase') {
            setGenPhase(evt.phase)
          } else if (evt.type === 'partial') {
            if (isNew) {
              const preview = safePartialPages(evt.object?.pages, streamIdsRef)
              if (preview.length) setStreamingPages(preview)
            }
          } else if (evt.type === 'done') {
            doneEvent = evt
          } else if (evt.type === 'error') {
            errorMsg = evt.error
          }
        }
      }
      clearTimeout(idleTimer)

      if (errorMsg) throw new Error(errorMsg)
      if (!doneEvent) throw new Error('Generation ended unexpectedly — try again.')

      const newPages = pagesFromModel(doneEvent.pages)
      setPages(newPages)
      const stillViewing = newPages.find((p) => p.slug === activePage.slug)
      setActivePageId(stillViewing ? stillViewing.id : newPages[0].id)
      if (doneEvent.theme) setTheme(doneEvent.theme)
      if (typeof doneEvent.creditsRemaining === 'number') setCredits(doneEvent.creditsRemaining)
      addMsg('assistant', doneEvent.explanation ?? 'Done.')
    } catch (err: any) {
      clearTimeout(idleTimer)
      addMsg('assistant', err.name === 'AbortError' ? '⚠️ That took too long with no response. Try a smaller, more specific request.' : `⚠️ ${err.message}`)
    }
    setStreamingPages(null)
    setBusy(false)
    setGenPhase(null)
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
          pages: pages.map((p) => ({ name: p.name, slug: p.slug, sections: p.sections.map((s) => ({ type: s.type, data: s.data })) })),
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
      if (d.id && d.id !== currentSiteId) {
        // Keep the URL pointing at this exact site — otherwise a refresh
        // (or reopening the tab later) has no ?site= to go on and falls
        // back to "whichever site you last touched," which is usually
        // right but not guaranteed, and briefly wasn't even that (see the
        // resolveSiteId fix above).
        setCurrentSiteId(d.id)
        router.replace(`/build?site=${d.id}`, { scroll: false })
      }
      setSaveMsg('Draft saved')
      setDirty(false)
      setHasUnpublishedChanges(true)
    } catch (err: any) {
      setSaveMsg(`Failed: ${err.message}`)
    }
    setSaving(false)
    setTimeout(() => setSaveMsg(null), 3000)
  }

  function handleExport() {
    const pagesForRender = pages.map((p) => ({ name: p.name, slug: p.slug, sections: p.sections.map((s) => ({ type: s.type, data: s.data })) }))
    const html = buildSiteHtml(siteName, pagesForRender, activePage.slug, theme, {
      metaTitle,
      metaDescription,
      analyticsId,
      faviconUrl,
    })
    const blob = new Blob([html], { type: 'text/html' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${siteName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}${activePage.slug ? `-${activePage.slug}` : ''}.html`
    a.click()
  }

  return (
    <main className="h-screen flex flex-col bg-slate-50 text-slate-900 dark:bg-[#0b111c] dark:text-zinc-100">
      <div className="flex items-center gap-4 h-14 px-5 border-b border-slate-200 dark:border-zinc-800 flex-shrink-0">
        <a href="/dashboard" className="text-sm text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200">← Dashboard</a>
        <a href={`/build/templates${currentSiteId ? `?site=${currentSiteId}` : ''}`} className="text-sm text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200">Premium Templates</a>
        <input
          value={siteName}
          onChange={(e) => setSiteName(e.target.value)}
          className="bg-transparent text-sm font-semibold outline-none border-b border-transparent focus:border-slate-300 dark:focus:border-zinc-700"
        />
        <div className="ml-auto flex items-center gap-3">
          <span className={`text-xs px-2 py-1 rounded-full border ${!unlimitedCredits && credits <= 5 ? 'border-red-400 text-red-600 dark:border-red-500/40 dark:text-red-400' : 'border-slate-300 text-slate-500 dark:border-zinc-700 dark:text-zinc-400'}`}>
            {unlimitedCredits ? '∞ credits (admin)' : `${credits} credit${credits === 1 ? '' : 's'} left`}
          </span>
          <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400" title="Primary color">
            Primary
            <input
              type="color"
              value={theme.primary}
              onChange={(e) => setTheme((t) => ({ ...t, primary: e.target.value }))}
              className="w-6 h-6 rounded border border-slate-300 dark:border-zinc-700 bg-transparent cursor-pointer"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400" title="Accent color">
            Accent
            <input
              type="color"
              value={theme.accent}
              onChange={(e) => setTheme((t) => ({ ...t, accent: e.target.value }))}
              className="w-6 h-6 rounded border border-slate-300 dark:border-zinc-700 bg-transparent cursor-pointer"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400" title="Visual style — fonts, corner rounding, shadows">
            Style
            <select
              value={activeStyle}
              onChange={(e) => setTheme((t) => ({ ...t, style: e.target.value }))}
              className="bg-white border border-slate-300 dark:bg-[#131b2a] dark:border-zinc-700 rounded px-1.5 py-1 text-xs text-slate-700 dark:text-zinc-200 outline-none cursor-pointer"
            >
              {STYLE_PRESET_KEYS.map((k) => (
                <option key={k} value={k} style={OPTION_STYLE}>{STYLE_PRESETS[k].label}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400" title="Whether the hero, buttons, and accents use a flat color or a gradient">
            Background
            <select
              value={theme.backgroundStyle ?? 'gradient'}
              onChange={(e) => setTheme((t) => ({ ...t, backgroundStyle: e.target.value as 'solid' | 'gradient' }))}
              className="bg-white border border-slate-300 dark:bg-[#131b2a] dark:border-zinc-700 rounded px-1.5 py-1 text-xs text-slate-700 dark:text-zinc-200 outline-none cursor-pointer"
            >
              <option value="solid" style={OPTION_STYLE}>Solid</option>
              <option value="gradient" style={OPTION_STYLE}>Gradient</option>
            </select>
          </label>
          {(publishMsg ?? saveMsg) && <span className="text-xs text-slate-500 dark:text-zinc-400">{publishMsg ?? saveMsg}</span>}
          <button onClick={() => setShowProfile(true)} className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 text-xs font-semibold">
            Business Profile
          </button>
          <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 text-xs font-semibold disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={handleExport} title="Exports the page you're currently viewing" className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 text-xs font-semibold">
            Export HTML
          </button>
          <a
            href={currentSiteId ? `/api/builder/site/preview?site=${currentSiteId}` : undefined}
            target="_blank"
            rel="noopener noreferrer"
            title={hasUnpublishedChanges ? "Preview your unpublished changes" : "Preview what's currently live"}
            className={`px-3 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 text-xs font-semibold ${!currentSiteId ? 'opacity-50 pointer-events-none' : ''}`}
          >
            Preview
          </a>
          <button
            onClick={handlePublishDraft}
            disabled={!currentSiteId || !hasUnpublishedChanges || publishingDraft}
            title={lastPublishedAt ? `Last published ${new Date(lastPublishedAt).toLocaleString()}` : 'Not published yet'}
            className="px-3 py-1.5 rounded-lg bg-[#f59e0b] text-[#1a1200] text-xs font-semibold disabled:opacity-40"
          >
            {publishingDraft ? 'Publishing…' : hasUnpublishedChanges ? 'Publish' : 'Published'}
          </button>
          <button onClick={() => setShowPublish(true)} className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 text-xs font-semibold">
            Go Live
          </button>
          <button
            onClick={() => setUiTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            title={uiTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="w-8 h-8 rounded-lg border border-slate-300 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white flex items-center justify-center text-sm flex-shrink-0"
          >
            {uiTheme === 'dark' ? '☀️' : '🌙'}
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
        <div className="w-80 flex-shrink-0 border-r border-slate-200 dark:border-zinc-800 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${m.role === 'user' ? 'bg-[#1a56db] text-white' : 'bg-slate-100 border border-slate-200 text-slate-700 dark:bg-[#131b2a] dark:border-zinc-800 dark:text-zinc-200'}`}>
                  {m.text}
                </div>
              </div>
            ))}
            {busy && <div className="text-xs text-slate-400 dark:text-zinc-500">{GEN_PHASE_LABELS[genPhase ?? 'building']}</div>}
          </div>

          <div className="p-3 border-t border-slate-200 dark:border-zinc-800">
            {outOfCredits && (
              <div className="text-xs text-red-600 dark:text-red-400 mb-2">
                Out of AI credits for this billing period. <a href="/#pricing" className="underline">Upgrade your plan</a> for more.
              </div>
            )}
            <div className="mb-2">
              <input
                ref={htmlFileInputRef}
                type="file"
                accept=".html,.htm"
                onChange={handleImportHtml}
                className="hidden"
              />
              <select
                value=""
                disabled={importingHtml}
                onChange={(e) => {
                  const v = e.target.value
                  if (v === 'business' || v === 'restaurant' || v === 'agency') loadTemplate(v)
                  else if (v === 'premium') router.push(`/build/templates${currentSiteId ? `?site=${currentSiteId}` : ''}`)
                  else if (v === 'upload') htmlFileInputRef.current?.click()
                }}
                className="text-[11px] px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-500 hover:text-slate-800 dark:border-zinc-700 dark:bg-transparent dark:text-zinc-400 dark:hover:text-zinc-200 disabled:opacity-50 outline-none w-full"
              >
                <option value="" disabled style={OPTION_STYLE}>{importingHtml ? 'Uploading…' : 'Quick start: templates or your own HTML…'}</option>
                <option value="business" style={OPTION_STYLE}>Business template</option>
                <option value="restaurant" style={OPTION_STYLE}>Restaurant template</option>
                <option value="agency" style={OPTION_STYLE}>Agency template</option>
                <option value="premium" style={OPTION_STYLE}>Browse premium templates</option>
                <option value="upload" style={OPTION_STYLE}>Upload your own HTML</option>
              </select>
            </div>
            {importError && <div className="text-xs text-red-600 dark:text-red-400 mb-2">{importError}</div>}
            {uploadError && <div className="text-xs text-red-600 dark:text-red-400 mb-2">{uploadError}</div>}
            {attachment && (
              <div className="flex items-center gap-2 mb-2 text-xs bg-slate-200 dark:bg-zinc-800 rounded-lg px-2.5 py-1.5 w-fit">
                <span>{attachment.kind === 'image' ? '🖼️' : attachment.kind === 'video' ? '🎬' : '🎵'}</span>
                <span className="text-slate-700 dark:text-zinc-300 max-w-[160px] truncate">{attachment.name}</span>
                <button onClick={() => setAttachment(null)} className="text-slate-400 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-300">✕</button>
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
                className="w-8 h-8 shrink-0 self-end rounded-xl border border-slate-300 text-slate-600 hover:text-slate-900 dark:border-zinc-700 dark:text-zinc-300 dark:hover:text-white disabled:opacity-50 flex items-center justify-center"
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
                placeholder={attachment ? 'Say what to do with this file (optional)…' : `Describe your website or ask for changes to "${activePage.name}"…`}
                rows={2}
                disabled={outOfCredits}
                className="flex-1 bg-white border border-slate-300 dark:bg-[#131b2a] dark:border-zinc-700 rounded-xl px-3 py-2 text-xs outline-none resize-none disabled:opacity-50"
              />
              <button onClick={handleSend} disabled={busy || outOfCredits || uploadingFile} className="px-3 rounded-xl bg-[#1a56db] text-white text-xs font-semibold disabled:opacity-50">
                Send
              </button>
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 flex flex-col min-h-0 bg-slate-100 dark:bg-[#1a1a2e]">
          {/* Page tabs — top-level pages on top, and (when the active page's
              family has any) a nested sub-page row underneath. A page is
              "top-level" if its slug has no "/"; everything under it is
              found by slug prefix, however many levels deep. */}
          {(() => {
            const topLevelPages = pages.filter((p) => !p.slug.includes('/'))
            const activeTopSlug = activePage.slug.split('/')[0]
            const activeTop = topLevelPages.find((p) => p.slug === activeTopSlug) ?? topLevelPages[0]
            const family = activeTop ? pages.filter((p) => p.slug.startsWith(`${activeTop.slug}/`)) : []
            return (
              <div className="border-b border-slate-200 dark:border-zinc-800">
                <div className="flex items-center gap-1.5 px-4 pt-2 overflow-x-auto">
                  {topLevelPages.map((p, i) => (
                    <div key={p.id} className="flex items-center">
                      <button
                        onClick={() => setActivePageId(p.id)}
                        onDoubleClick={() => renamePage(p.id)}
                        title="Double-click to rename"
                        className={`text-xs px-3 py-1.5 rounded-t-lg whitespace-nowrap ${p.slug === activeTopSlug ? 'bg-white text-slate-900 border border-slate-300 border-b-0 dark:bg-[#1a1a2e] dark:text-white dark:border-zinc-700 font-semibold' : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
                      >
                        {p.name}
                        {i === 0 && <span className="text-[9px] text-slate-400 dark:text-zinc-500 ml-1">(home)</span>}
                        {pages.some((c) => c.slug.startsWith(`${p.slug}/`)) && <span className="text-[9px] ml-1 opacity-60">▾</span>}
                      </button>
                      {i > 0 && p.id === activePage.id && (
                        <button onClick={() => deletePage(p.id)} title="Delete page" className="text-slate-400 hover:text-red-600 dark:text-zinc-500 dark:hover:text-red-400 text-xs px-1">✕</button>
                      )}
                    </div>
                  ))}
                  <button onClick={addPage} className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-500 hover:text-slate-800 dark:border-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 whitespace-nowrap">
                    + Page
                  </button>
                </div>
                {activeTop && activeTop.slug !== '' && (
                  <div className="flex items-center gap-1.5 px-4 pb-2 pt-1 pl-9 overflow-x-auto">
                    <span className="text-[10px] text-slate-400 dark:text-zinc-600">↳</span>
                    {family.map((p) => (
                      <div key={p.id} className="flex items-center">
                        <button
                          onClick={() => setActivePageId(p.id)}
                          onDoubleClick={() => renamePage(p.id)}
                          title="Double-click to rename"
                          className={`text-[11px] px-2.5 py-1 rounded-lg whitespace-nowrap ${p.id === activePage.id ? 'bg-slate-200 text-slate-900 dark:bg-zinc-800 dark:text-white font-semibold' : 'text-slate-400 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-300'}`}
                        >
                          {p.name}
                        </button>
                        {p.id === activePage.id && (
                          <button onClick={() => deletePage(p.id)} title="Delete page" className="text-slate-400 hover:text-red-600 dark:text-zinc-600 dark:hover:text-red-400 text-[11px] px-1">✕</button>
                        )}
                      </div>
                    ))}
                    <button onClick={() => addSubPage(activeTop.id)} className="text-[11px] px-2 py-1 rounded-lg border border-slate-300 text-slate-400 hover:text-slate-800 dark:border-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200 whitespace-nowrap">
                      + Sub-page
                    </button>
                  </div>
                )}
              </div>
            )
          })()}

          <div className="flex items-center px-4 py-2 border-b border-slate-200 dark:border-zinc-800">
            <select
              value=""
              onChange={(e) => {
                const t = e.target.value as SectionType
                if (t) addBlankSection(t)
              }}
              className="text-[11px] px-2.5 py-1.5 rounded-md bg-slate-200 text-slate-700 hover:text-slate-900 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:text-white outline-none"
            >
              <option value="" disabled style={OPTION_STYLE}>+ Add section</option>
              {(Object.keys(SECTION_LABELS) as SectionType[]).map((t) => (
                <option key={t} value={t} style={OPTION_STYLE}>{SECTION_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div ref={canvasScrollRef} className="flex-1 overflow-y-auto p-6">
            {streamingPages !== null && (
              <div className="max-w-5xl mx-auto mb-3 flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-zinc-400">
                <span className="b-building-dot" />
                {GEN_PHASE_LABELS[genPhase ?? 'building']}
              </div>
            )}
            <div
              className="b-canvas bg-white rounded-lg shadow-2xl max-w-5xl mx-auto overflow-hidden min-h-[400px]"
              style={{ ['--b-primary' as any]: theme.primary, ['--b-accent' as any]: theme.accent, ...backgroundVars(theme), ...STYLE_PRESETS[activeStyle].vars }}
            >
              {streamingPages !== null ? (
                !streamingPreviewPage || streamingPreviewPage.sections.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-24 text-center px-10">
                    <div className="b-building-dot" />
                    <h3 className="text-slate-500 font-semibold">Sketching out your site…</h3>
                  </div>
                ) : (
                  <div className="pointer-events-none">
                    {streamingPreviewPage.sections.map((s) => (
                      <div key={s.id} className="b-section-enter">
                        <SectionView
                          section={s}
                          pages={streamingPages}
                          selected={false}
                          onSelect={() => {}}
                          onCommit={() => {}}
                          onMoveUp={() => {}}
                          onMoveDown={() => {}}
                          onDuplicate={() => {}}
                          onDelete={() => {}}
                        />
                      </div>
                    ))}
                  </div>
                )
              ) : sections.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-24 text-center px-10">
                  <div className="text-4xl opacity-40">🏗️</div>
                  <h3 className="text-slate-500 font-semibold">This page will appear here</h3>
                  <p className="text-slate-400 text-sm max-w-xs">Chat with Sky on the left, or load a template to get started.</p>
                </div>
              ) : (
                sections.map((s) => (
                  <div key={s.id} className="b-section-enter">
                    <SectionView
                      section={s}
                      pages={pages}
                      selected={selectedId === s.id}
                      onSelect={() => setSelectedId(s.id)}
                      onCommit={(field, value) => updateField(s.id, field, value)}
                      onMoveUp={() => moveSection(s.id, -1)}
                      onMoveDown={() => moveSection(s.id, 1)}
                      onDuplicate={() => duplicateSection(s.id)}
                      onDelete={() => removeSection(s.id)}
                    />
                  </div>
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

      {confirmDeletePage && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center px-4" onClick={() => setConfirmDeletePage(null)}>
          <div
            className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white text-slate-900 dark:border-zinc-800 dark:bg-[#131b2a] dark:text-zinc-100 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-bold mb-2">Delete this page?</h2>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mb-5">
              {confirmDeletePage.hasChildren
                ? 'This will delete the page AND all of its sub-pages. This cannot be undone.'
                : 'This cannot be undone.'}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDeletePage(null)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
                Cancel
              </button>
              <button onClick={performDeletePage} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {homePageDeleteBlocked && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center px-4" onClick={() => setHomePageDeleteBlocked(false)}>
          <div
            className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white text-slate-900 dark:border-zinc-800 dark:bg-[#131b2a] dark:text-zinc-100 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-bold mb-2">Can't delete the Home page</h2>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mb-5">Rename it instead if you want a different landing page.</p>
            <div className="flex justify-end">
              <button onClick={() => setHomePageDeleteBlocked(false)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1a56db] text-white hover:opacity-90">
                Got it
              </button>
            </div>
          </div>
        </div>
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
  section, pages, selected, onSelect, onCommit, onMoveUp, onMoveDown, onDuplicate, onDelete,
}: {
  section: Section
  pages: Page[]
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
        <div className="s-nav-links">
          {pages.filter((p) => !p.slug.includes('/')).map((p) => <span key={p.id}>{p.name}</span>)}
        </div>
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
  if (type === 'footer') {
    return (
      <div className={`${wrapperClass} s-footer`} onClick={onSelect}>
        {toolbar}
        <Editable value={data.logo} onCommit={(v) => onCommit('logo', v)} className="s-footer-logo" />
        <div className="s-footer-links"><span>Privacy</span><span>Terms</span><span>Contact</span></div>
        <Editable value={data.copy} onCommit={(v) => onCommit('copy', v)} className="s-footer-copy" />
      </div>
    )
  }
  if (type === 'gallery') {
    return (
      <div className={`${wrapperClass} s-gallery`} onClick={onSelect}>
        {toolbar}
        <Editable tag="h2" value={data.title} onCommit={(v) => onCommit('title', v)} />
        <div className="s-gallery-grid">
          {[1, 2, 3, 4, 5, 6].filter((n) => data[`g${n}img`]).map((n) => (
            <img key={n} src={data[`g${n}img`]} alt="" className="s-gallery-img" />
          ))}
        </div>
      </div>
    )
  }
  if (type === 'team') {
    return (
      <div className={`${wrapperClass} s-team`} onClick={onSelect}>
        {toolbar}
        <Editable tag="h2" value={data.title} onCommit={(v) => onCommit('title', v)} />
        <div className="s-team-grid">
          {[1, 2, 3].filter((n) => data[`m${n}n`]).map((n) => (
            <div className="s-team-card" key={n}>
              {data[`m${n}img`] ? (
                <img src={data[`m${n}img`]} alt="" className="s-team-img" />
              ) : (
                <div className="s-team-placeholder">👤</div>
              )}
              <Editable value={data[`m${n}n`]} onCommit={(v) => onCommit(`m${n}n`, v)} className="s-team-name" />
              <Editable value={data[`m${n}r`]} onCommit={(v) => onCommit(`m${n}r`, v)} className="s-team-role" />
            </div>
          ))}
        </div>
      </div>
    )
  }
  if (type === 'faq') {
    return (
      <div className={`${wrapperClass} s-faq`} onClick={onSelect}>
        {toolbar}
        <Editable tag="h2" value={data.title} onCommit={(v) => onCommit('title', v)} />
        <div className="s-faq-list">
          {[1, 2, 3, 4].filter((n) => data[`q${n}q`]).map((n) => (
            <details className="s-faq-item" key={n}>
              <summary>
                <Editable value={data[`q${n}q`]} onCommit={(v) => onCommit(`q${n}q`, v)} />
              </summary>
              <Editable tag="p" value={data[`q${n}a`]} onCommit={(v) => onCommit(`q${n}a`, v)} />
            </details>
          ))}
        </div>
      </div>
    )
  }
  if (type === 'contact') {
    return (
      <div className={`${wrapperClass} s-contact`} onClick={onSelect}>
        {toolbar}
        <Editable tag="h2" value={data.title} onCommit={(v) => onCommit('title', v)} />
        <Editable tag="p" value={data.sub} onCommit={(v) => onCommit('sub', v)} />
        <div className="s-contact-details">
          <Editable value={data.email} onCommit={(v) => onCommit('email', v)} className="s-contact-field" />
          <Editable value={data.phone} onCommit={(v) => onCommit('phone', v)} className="s-contact-field" />
          <Editable value={data.address} onCommit={(v) => onCommit('address', v)} className="s-contact-field" />
        </div>
        {data.email && <div className="s-contact-btn">Send us an email</div>}
      </div>
    )
  }
  if (type === 'map') {
    return (
      <div className={`${wrapperClass} s-map`} onClick={onSelect}>
        {toolbar}
        <Editable tag="h2" value={data.title} onCommit={(v) => onCommit('title', v)} />
        {data.address ? (
          <iframe
            className="s-map-frame"
            src={`https://www.google.com/maps?q=${encodeURIComponent(data.address)}&output=embed`}
            loading="lazy"
          />
        ) : (
          <div className="s-map-frame" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f4ff', color: '#94a3b8' }}>
            Add an address via chat to show a map
          </div>
        )}
        <Editable value={data.address} onCommit={(v) => onCommit('address', v)} className="s-contact-field" />
      </div>
    )
  }
  if (type === 'logos') {
    return (
      <div className={`${wrapperClass} s-logos`} onClick={onSelect}>
        {toolbar}
        <Editable tag="h2" value={data.title} onCommit={(v) => onCommit('title', v)} />
        <div className="s-logos-row">
          {[1, 2, 3, 4, 5, 6].filter((n) => data[`l${n}n`]).map((n) => (
            <Editable key={n} value={data[`l${n}n`]} onCommit={(v) => onCommit(`l${n}n`, v)} className="s-logo-item" />
          ))}
        </div>
      </div>
    )
  }
  // pagelinks — cards linking to other pages on this site. Non-interactive
  // in the editor canvas (no real navigation between in-progress pages
  // here); the target slug is shown as a small hint under each card so it's
  // clear which page it'll link to once published.
  return (
    <div className={`${wrapperClass} s-pagelinks`} onClick={onSelect}>
      {toolbar}
      <Editable tag="h2" value={data.title} onCommit={(v) => onCommit('title', v)} />
      <div className="s-pagelinks-grid">
        {[1, 2, 3, 4, 5, 6].filter((n) => data[`c${n}n`]).map((n) => (
          <div className="s-pagelinks-card" key={n}>
            {data[`c${n}img`] && <img src={data[`c${n}img`]} alt="" className="b-feat-img" />}
            <Editable tag="h3" value={data[`c${n}n`]} onCommit={(v) => onCommit(`c${n}n`, v)} />
            <Editable tag="p" value={data[`c${n}d`]} onCommit={(v) => onCommit(`c${n}d`, v)} />
            <div className="text-[10px] text-slate-400 mt-1">links to: /{data[`c${n}s`] || '…'}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
