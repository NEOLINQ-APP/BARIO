// Shared HTML rendering for a site's sections + theme. Used by both the
// builder's "Export HTML" button (client-side) and the live /site/[domain]
// page (server-side), so a published site always matches what gets exported.

import { STYLE_PRESETS, DEFAULT_STYLE_PRESET, isStylePresetKey, presetVarsToCss } from './stylePresets'

export type SectionType = 'nav' | 'hero' | 'features' | 'stats' | 'testimonial' | 'pricing' | 'cta' | 'footer' | 'gallery' | 'team' | 'faq' | 'contact' | 'map' | 'logos' | 'pagelinks'
export type SectionData = Record<string, string>
export type Section = { type: SectionType; data: SectionData }
// backgroundStyle is optional and missing on every site saved before this
// existed — undefined falls through to 'gradient' everywhere it's checked,
// so a site nobody has re-saved keeps rendering exactly as it always did.
export type Theme = { primary: string; accent: string; style?: string; backgroundStyle?: 'solid' | 'gradient' }

// The hero/CTA/button/avatar backgrounds used to be hard-baked gradients in
// EXPORT_CSS (one of them — the hero button — wasn't even wired to the
// site's own brand colors, it was a fixed amber/orange regardless of theme).
// These are the only place that decision gets made now: computed once per
// render and exposed as CSS custom properties, so EXPORT_CSS just points at
// a var() and never hard-codes solid vs. gradient itself.
export function backgroundVars(theme: Pick<Theme, 'backgroundStyle'>): Record<string, string> {
  const isSolid = theme.backgroundStyle === 'solid'
  return {
    '--b-hero-bg': isSolid ? 'var(--b-primary)' : 'linear-gradient(135deg,var(--b-primary) 0%,var(--b-primary) 60%,var(--b-accent) 100%)',
    '--b-hero-btn-bg': isSolid ? 'var(--b-accent)' : 'linear-gradient(135deg,var(--b-primary),var(--b-accent))',
    '--b-cta-bg': isSolid ? 'var(--b-accent)' : 'linear-gradient(135deg,var(--b-accent),var(--b-primary))',
    '--b-avatar-bg': isSolid ? 'var(--b-accent)' : 'linear-gradient(135deg,var(--b-accent),var(--b-primary))',
  }
}
// A page's slug may contain "/" to nest it under another page, e.g.
// "services/plumbing-repair" is a child of the page whose slug is
// "services" — there's no separate parent field, the hierarchy is entirely
// derived from the slug path. Depth is unlimited; a child's slug can itself
// be a prefix for grandchildren.
export type Page = { name: string; slug: string; sections: Section[] }

// sites.sections_json historically stored a bare Section[] — one page,
// always. Multi-page sites store { pages: Page[] } instead. This is the one
// place that distinction is resolved, so every reader (the live site route,
// the builder's load endpoint) sees a normalized Page[] regardless of which
// shape is actually in the database — a site nobody has re-saved since
// multi-page shipped keeps rendering exactly as it always did, as a single
// implicit page.
export function parsePagesJson(sectionsJson: string): Page[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(sectionsJson)
  } catch {
    return [{ name: 'Home', slug: '', sections: [] }]
  }
  if (Array.isArray(parsed)) {
    return [{ name: 'Home', slug: '', sections: parsed as Section[] }]
  }
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as any).pages) && (parsed as any).pages.length > 0) {
    return (parsed as { pages: Page[] }).pages
  }
  return [{ name: 'Home', slug: '', sections: [] }]
}

// All section data is user- (or AI-) authored and ends up on a publicly
// served page, so every value must be escaped before interpolation — this
// is the only thing standing between a text field and stored XSS.
export function esc(value: string | undefined | null): string {
  if (value == null) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function sectionToHtml(type: SectionType, data: SectionData, navPages?: Page[]): string {
  switch (type) {
    case 'nav': {
      // Only top-level pages (no "/" in their slug) show up in the main
      // menu — a site with dozens of nested category sub-pages would
      // otherwise flood the nav bar. Sub-pages are reached via a
      // "pagelinks" section on their parent page, or direct URL.
      const links = (navPages ?? [])
        .filter((p) => !p.slug.includes('/'))
        .map((p) => `<a href="/${esc(p.slug)}">${esc(p.name)}</a>`)
        .join('')
      return `<div class="s-nav"><div class="s-nav-logo">${esc(data.logo)}</div><div class="s-nav-links">${links}</div></div>`
    }
    case 'hero':
      return `<div class="s-hero">${data.image ? `<img src="${esc(data.image)}" alt="" style="width:100%;max-width:600px;border-radius:12px;margin:0 auto 24px;display:block;object-fit:cover;height:260px">` : ''}<h1>${esc(data.headline)}</h1><p>${esc(data.sub)}</p><div class="s-hero-btn">${esc(data.cta)}</div></div>`
    case 'features':
      return `<div class="s-features"><h2>${esc(data.title)}</h2><div class="s-features-grid">${[1, 2, 3].map((n) => `<div class="s-feat-card">${data[`f${n}img`] ? `<img src="${esc(data[`f${n}img`])}" alt="" style="width:100%;height:140px;object-fit:cover;border-radius:12px;margin-bottom:14px;display:block">` : '<div class="s-feat-icon">✨</div>'}<h3>${esc(data[`f${n}t`])}</h3><p>${esc(data[`f${n}d`])}</p></div>`).join('')}</div></div>`
    case 'stats':
      return `<div class="s-stats"><div class="s-stats-grid">${[1, 2, 3, 4].map((n) => `<div><div class="s-stat-num">${esc(data[`s${n}n`])}</div><div class="s-stat-label">${esc(data[`s${n}l`])}</div></div>`).join('')}</div></div>`
    case 'testimonial':
      return `<div class="s-testimonial"><h2>${esc(data.title)}</h2><div class="s-test-grid">${[1, 2, 3].map((n) => `<div class="s-test-card"><p class="s-test-quote">"${esc(data[`t${n}q`])}"</p><div class="s-test-author"><div class="s-test-av">${esc((data[`t${n}n`] || '?').slice(0, 2).toUpperCase())}</div><div><div class="s-test-name">${esc(data[`t${n}n`])}</div><div class="s-test-role">${esc(data[`t${n}r`])}</div></div></div></div>`).join('')}</div></div>`
    case 'pricing':
      return `<div class="s-pricing"><h2>${esc(data.title)}</h2><div class="s-price-grid">${[1, 2, 3].map((n) => `<div class="s-price-card ${n === 2 ? 'featured' : ''}"><div class="s-price-name">${esc(data[`p${n}n`])}</div><div class="s-price-num">${esc(data[`p${n}p`])}</div><div class="s-price-per">/month</div><ul class="s-price-features">${(data[`p${n}f`] || '').split(',').map((f) => `<li>${esc(f.trim())}</li>`).join('')}</ul></div>`).join('')}</div></div>`
    case 'cta':
      return `<div class="s-cta"><h2>${esc(data.headline)}</h2><p>${esc(data.sub)}</p><div class="s-cta-btn">${esc(data.cta)}</div></div>`
    case 'footer':
      return `<div class="s-footer"><div class="s-footer-logo">${esc(data.logo)}</div><div class="s-footer-links"><span>Privacy</span><span>Terms</span><span>Contact</span></div><div class="s-footer-copy">${esc(data.copy)}</div></div>`
    case 'gallery':
      return `<div class="s-gallery"><h2>${esc(data.title)}</h2><div class="s-gallery-grid">${[1, 2, 3, 4, 5, 6].filter((n) => data[`g${n}img`]).map((n) => `<img src="${esc(data[`g${n}img`])}" alt="" class="s-gallery-img">`).join('')}</div></div>`
    case 'team':
      return `<div class="s-team"><h2>${esc(data.title)}</h2><div class="s-team-grid">${[1, 2, 3].filter((n) => data[`m${n}n`]).map((n) => `<div class="s-team-card">${data[`m${n}img`] ? `<img src="${esc(data[`m${n}img`])}" alt="" class="s-team-img">` : '<div class="s-team-placeholder">👤</div>'}<div class="s-team-name">${esc(data[`m${n}n`])}</div><div class="s-team-role">${esc(data[`m${n}r`])}</div></div>`).join('')}</div></div>`
    case 'faq':
      return `<div class="s-faq"><h2>${esc(data.title)}</h2><div class="s-faq-list">${[1, 2, 3, 4].filter((n) => data[`q${n}q`]).map((n) => `<details class="s-faq-item"><summary>${esc(data[`q${n}q`])}</summary><p>${esc(data[`q${n}a`])}</p></details>`).join('')}</div></div>`
    case 'contact':
      return `<div class="s-contact"><h2>${esc(data.title)}</h2><p>${esc(data.sub)}</p><div class="s-contact-details">${data.email ? `<div>✉️ ${esc(data.email)}</div>` : ''}${data.phone ? `<div>📞 ${esc(data.phone)}</div>` : ''}${data.address ? `<div>📍 ${esc(data.address)}</div>` : ''}</div>${data.email ? `<a href="mailto:${esc(data.email)}" class="s-contact-btn">Send us an email</a>` : ''}</div>`
    case 'map':
      return `<div class="s-map"><h2>${esc(data.title)}</h2><iframe class="s-map-frame" src="https://www.google.com/maps?q=${encodeURIComponent(data.address || '')}&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div>`
    case 'logos':
      return `<div class="s-logos"><h2>${esc(data.title)}</h2><div class="s-logos-row">${[1, 2, 3, 4, 5, 6].filter((n) => data[`l${n}n`]).map((n) => `<div class="s-logo-item">${esc(data[`l${n}n`])}</div>`).join('')}</div></div>`
    case 'pagelinks':
      // Cards linking to other pages on this site — the way a parent
      // "category" page (e.g. Services) fans out to its own dedicated
      // sub-pages instead of cramming every service into one long list.
      return `<div class="s-pagelinks"><h2>${esc(data.title)}</h2><div class="s-pagelinks-grid">${[1, 2, 3, 4, 5, 6].filter((n) => data[`c${n}n`]).map((n) => `<a href="/${esc(data[`c${n}s`] || '')}" class="s-pagelinks-card">${data[`c${n}img`] ? `<img src="${esc(data[`c${n}img`])}" alt="" style="width:100%;height:140px;object-fit:cover;border-radius:12px;margin-bottom:14px;display:block">` : ''}<h3>${esc(data[`c${n}n`])}</h3><p>${esc(data[`c${n}d`])}</p></a>`).join('')}</div></div>`
  }
}

// Shared heading treatment, mixed into every rule below that styles a
// heading/display element — font-family/weight/letter-spacing/transform all
// come from preset vars, with fallbacks matching the "modern" preset so a
// site with no preset set (or the raw-HTML/template path, which never sets
// these) still renders exactly as before.
const H = `font-family:var(--b-font-heading,'Inter',sans-serif);letter-spacing:var(--b-heading-ls,normal);text-transform:var(--b-heading-tt,none)`

export const EXPORT_CSS = `
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:var(--b-font-body,'Inter',sans-serif)}
.s-nav{background:var(--b-primary);color:white;padding:16px 48px;display:flex;align-items:center;justify-content:space-between}
.s-nav-logo{font-size:20px;font-weight:var(--b-heading-weight,800);${H}}
.s-nav-links{display:flex;gap:28px;font-size:13px;opacity:0.8}
.s-nav-links a{color:inherit;text-decoration:none}
.s-nav-links a:hover{opacity:0.7}
.s-hero{background:var(--b-hero-bg);color:white;padding:96px 64px;text-align:center}
.s-hero h1{font-size:52px;font-weight:var(--b-heading-weight,800);margin-bottom:18px;line-height:1.15;${H}}
.s-hero p{font-size:19px;opacity:0.85;margin-bottom:36px;max-width:580px;margin-left:auto;margin-right:auto}
.s-hero-btn{background:var(--b-hero-btn-bg);color:white;padding:16px 44px;border-radius:var(--b-btn-radius,50px);font-size:16px;font-weight:700;display:inline-block}
.s-features{padding:88px 64px;background:#f8faff}
.s-features h2{text-align:center;font-size:38px;font-weight:var(--b-heading-weight,800);margin-bottom:56px;color:var(--b-primary);${H}}
.s-features-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:28px}
.s-feat-card{background:white;border-radius:var(--b-radius-lg,20px);border:var(--b-card-border,none);padding:36px;box-shadow:var(--b-shadow,0 4px 24px rgba(10,35,66,0.06));text-align:center}
.s-feat-icon{font-size:44px;margin-bottom:18px}
.s-feat-card h3{font-size:19px;font-weight:var(--b-heading-weight,700);margin-bottom:10px;color:var(--b-primary);${H}}
.s-feat-card p{font-size:14px;color:#64748b;line-height:1.65}
.s-stats{padding:56px 64px;background:white}
.s-stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:24px;text-align:center}
.s-stat-num{font-size:42px;font-weight:var(--b-heading-weight,800);color:var(--b-accent);${H}}
.s-stat-label{font-size:13px;color:#64748b;margin-top:6px}
.s-testimonial{padding:88px 64px;background:#f0f4ff}
.s-testimonial h2{text-align:center;font-size:38px;font-weight:var(--b-heading-weight,800);margin-bottom:48px;color:var(--b-primary);${H}}
.s-test-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
.s-test-card{background:white;border-radius:var(--b-radius-lg,16px);border:var(--b-card-border,none);padding:28px;box-shadow:var(--b-shadow,0 4px 16px rgba(10,35,66,0.06))}
.s-test-quote{font-size:14px;color:#64748b;line-height:1.7;margin-bottom:20px;font-style:italic}
.s-test-author{display:flex;align-items:center;gap:10px}
.s-test-av{width:36px;height:36px;border-radius:50%;background:var(--b-avatar-bg);display:flex;align-items:center;justify-content:center;color:white;font-size:13px;font-weight:700}
.s-test-name{font-size:13px;font-weight:var(--b-heading-weight,700);color:var(--b-primary);${H}}
.s-test-role{font-size:11px;color:#94a3b8}
.s-pricing{padding:88px 64px;background:white}
.s-pricing h2{text-align:center;font-size:38px;font-weight:var(--b-heading-weight,800);margin-bottom:48px;color:var(--b-primary);${H}}
.s-price-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
.s-price-card{border:2px solid #e2e8f0;border-radius:var(--b-radius-lg,20px);padding:36px;text-align:center}
.s-price-card.featured{border-color:var(--b-accent);background:#f0f4ff;transform:scale(1.04)}
.s-price-name{font-size:16px;font-weight:var(--b-heading-weight,700);color:var(--b-primary);margin-bottom:8px;${H}}
.s-price-num{font-size:42px;font-weight:var(--b-heading-weight,800);color:var(--b-accent);margin-bottom:4px;${H}}
.s-price-per{font-size:13px;color:#94a3b8;margin-bottom:24px}
.s-price-features{list-style:none;text-align:left;margin-bottom:28px}
.s-price-features li{font-size:13px;color:#64748b;padding:6px 0;border-bottom:1px solid #e2e8f0}
.s-cta{background:var(--b-cta-bg);color:white;padding:88px 64px;text-align:center}
.s-cta h2{font-size:42px;font-weight:var(--b-heading-weight,800);margin-bottom:18px;${H}}
.s-cta p{font-size:19px;opacity:0.88;margin-bottom:36px;max-width:560px;margin-left:auto;margin-right:auto}
.s-cta-btn{background:white;color:var(--b-accent);padding:16px 44px;border-radius:var(--b-btn-radius,50px);font-size:16px;font-weight:700;display:inline-block}
.s-footer{background:#0f0f1a;color:white;padding:48px 64px;display:flex;align-items:center;justify-content:space-between}
.s-footer-logo{font-size:18px;font-weight:var(--b-heading-weight,800);opacity:0.9;${H}}
.s-footer-links{display:flex;gap:24px;font-size:13px;opacity:0.5}
.s-footer-copy{font-size:12px;opacity:0.4}
.s-gallery{padding:88px 64px;background:white}
.s-gallery h2{text-align:center;font-size:38px;font-weight:var(--b-heading-weight,800);margin-bottom:48px;color:var(--b-primary);${H}}
.s-gallery-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.s-gallery-img{width:100%;height:220px;object-fit:cover;border-radius:var(--b-radius-lg,16px);display:block}
.s-team{padding:88px 64px;background:#f8faff}
.s-team h2{text-align:center;font-size:38px;font-weight:var(--b-heading-weight,800);margin-bottom:48px;color:var(--b-primary);${H}}
.s-team-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:28px}
.s-team-card{background:white;border-radius:var(--b-radius-lg,20px);border:var(--b-card-border,none);padding:32px;text-align:center;box-shadow:var(--b-shadow,0 4px 24px rgba(10,35,66,0.06))}
.s-team-img{width:100px;height:100px;object-fit:cover;border-radius:50%;margin:0 auto 18px;display:block}
.s-team-placeholder{width:100px;height:100px;border-radius:50%;background:#e2e8f0;display:flex;align-items:center;justify-content:center;font-size:40px;margin:0 auto 18px}
.s-team-name{font-size:17px;font-weight:var(--b-heading-weight,700);color:var(--b-primary);${H}}
.s-team-role{font-size:13px;color:#64748b;margin-top:4px}
.s-faq{padding:88px 64px;background:white;max-width:800px;margin:0 auto}
.s-faq h2{text-align:center;font-size:38px;font-weight:var(--b-heading-weight,800);margin-bottom:40px;color:var(--b-primary);${H}}
.s-faq-item{border-bottom:1px solid #e2e8f0;padding:20px 0}
.s-faq-item summary{font-size:17px;font-weight:var(--b-heading-weight,700);color:var(--b-primary);cursor:pointer;${H}}
.s-faq-item p{font-size:14px;color:#64748b;margin-top:12px;line-height:1.65}
.s-contact{padding:88px 64px;background:#f0f4ff;text-align:center}
.s-contact h2{font-size:38px;font-weight:var(--b-heading-weight,800);margin-bottom:14px;color:var(--b-primary);${H}}
.s-contact p{font-size:16px;color:#64748b;margin-bottom:28px;max-width:520px;margin-left:auto;margin-right:auto}
.s-contact-details{display:flex;justify-content:center;gap:32px;flex-wrap:wrap;font-size:15px;color:var(--b-primary);font-weight:600;margin-bottom:28px}
.s-contact-btn{background:var(--b-cta-bg);color:white;padding:16px 44px;border-radius:var(--b-btn-radius,50px);font-size:16px;font-weight:700;display:inline-block}
.s-map{padding:88px 64px;background:white;text-align:center}
.s-map h2{font-size:38px;font-weight:var(--b-heading-weight,800);margin-bottom:32px;color:var(--b-primary);${H}}
.s-map-frame{width:100%;max-width:900px;height:400px;border:0;border-radius:var(--b-radius-lg,16px)}
.s-logos{padding:64px;background:#f8faff}
.s-logos h2{text-align:center;font-size:28px;font-weight:var(--b-heading-weight,800);margin-bottom:36px;color:var(--b-primary);opacity:0.7;${H}}
.s-logos-row{display:flex;justify-content:center;align-items:center;gap:40px;flex-wrap:wrap}
.s-logo-item{font-size:20px;font-weight:800;color:#94a3b8;letter-spacing:0.02em}
.s-pagelinks{padding:88px 64px;background:#f8faff}
.s-pagelinks h2{text-align:center;font-size:38px;font-weight:var(--b-heading-weight,800);margin-bottom:48px;color:var(--b-primary);${H}}
.s-pagelinks-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
.s-pagelinks-card{background:white;border-radius:var(--b-radius-lg,20px);border:var(--b-card-border,none);padding:32px;box-shadow:var(--b-shadow,0 4px 24px rgba(10,35,66,0.06));text-decoration:none;color:inherit;display:block;transition:transform .15s}
.s-pagelinks-card:hover{transform:translateY(-4px)}
.s-pagelinks-card h3{font-size:19px;font-weight:var(--b-heading-weight,700);margin-bottom:10px;color:var(--b-primary);${H}}
.s-pagelinks-card p{font-size:14px;color:#64748b;line-height:1.65}
@media(max-width:768px){
  .s-gallery{padding:60px 24px}.s-gallery-grid{grid-template-columns:1fr}
  .s-team{padding:60px 24px}.s-team-grid{grid-template-columns:1fr}
  .s-faq{padding:60px 24px}
  .s-contact{padding:60px 24px}.s-contact-details{flex-direction:column;gap:12px}
  .s-map{padding:60px 24px}.s-map-frame{height:280px}
  .s-logos{padding:40px 24px}.s-logos-row{gap:24px}
  .s-pagelinks{padding:60px 24px}.s-pagelinks-grid{grid-template-columns:1fr}
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

// Theme values land inside a <style> block, where HTML-escaping alone
// doesn't stop CSS injection (e.g. "red; } body { display:none"). Since
// these are only ever meant to be hex colors, validate the format instead
// and fall back to the app default for anything else.
const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/
function sanitizeColor(value: string | undefined, fallback: string): string {
  return value && HEX_COLOR_RE.test(value) ? value : fallback
}

// A GA4 measurement ID, e.g. "G-ABC1234DEF". Validated (not just escaped)
// since it's used to build a script src URL, not just text content.
const GA4_ID_RE = /^G-[A-Z0-9]{4,}$/i
export function isValidGa4Id(value: string): boolean {
  return GA4_ID_RE.test(value)
}

export type SeoOptions = {
  metaTitle?: string | null
  metaDescription?: string | null
  analyticsId?: string | null
  faviconUrl?: string | null
}

// Free-tier sites always show this; paying accounts can toggle it off. A
// full-width bottom bar rather than a small corner pill — a badge easy to
// ignore doesn't give a free-tier owner any real reason to upgrade. Fixed
// position + inline styles + a very high z-index so it survives regardless
// of the site's own CSS (including raw-HTML template sites we don't control).
const BADGE_HTML = `<a href="https://bario.ca" target="_blank" rel="noopener" style="position:fixed;bottom:0;left:0;right:0;z-index:2147483647;background:#0b111c;color:#fff;font:700 13px/1 -apple-system,BlinkMacSystemFont,sans-serif;padding:13px 16px;text-decoration:none;display:flex;align-items:center;justify-content:center;gap:6px;box-shadow:0 -2px 20px rgba(0,0,0,.35);border-top:2px solid #f59e0b">⚡ Built with <span style="color:#f59e0b">Bario</span> — Create your own free website</a>`

// Renders ONE page of a (possibly multi-page) site: `pages` is the full
// page list (needed so the nav section can link to every page, including
// ones other than the one being rendered right now), `activeSlug` picks
// which page's sections make up the actual body of this document.
export function buildSiteHtml(name: string, pages: Page[], activeSlug: string, theme: Theme, seo?: SeoOptions, showBadge = true): string {
  const page = pages.find((p) => p.slug === activeSlug) ?? pages[0]
  const body = page.sections.map((s) => sectionToHtml(s.type, s.data, pages)).join('\n')
  const primary = sanitizeColor(theme.primary, '#0A2342')
  const accent = sanitizeColor(theme.accent, '#1a56db')
  const preset = STYLE_PRESETS[isStylePresetKey(theme.style) ? theme.style : DEFAULT_STYLE_PRESET]
  const title = seo?.metaTitle?.trim() || (page.slug ? `${page.name} — ${name}` : `${name} — Built with Bario`)
  const description = seo?.metaDescription?.trim()
  const analyticsId = seo?.analyticsId?.trim()
  const validAnalyticsId = analyticsId && GA4_ID_RE.test(analyticsId) ? analyticsId : null
  const faviconUrl = seo?.faviconUrl?.trim()
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
${description ? `<meta name="description" content="${esc(description)}">` : ''}
${faviconUrl ? `<link rel="icon" href="${esc(faviconUrl)}">` : ''}
<link href="${preset.googleFontsHref}" rel="stylesheet">
<style>:root{--b-primary:${primary};--b-accent:${accent};${Object.entries(backgroundVars(theme)).map(([k, v]) => `${k}:${v}`).join(';')};${presetVarsToCss(preset)}}${EXPORT_CSS}</style>
${validAnalyticsId ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${validAnalyticsId}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${validAnalyticsId}');</script>` : ''}
</head>
<body>
${body}
${showBadge ? BADGE_HTML : '<!-- Built with Bario — bario.ca -->'}
</body>
</html>`
}

// Injects (or strips) the badge on a raw-HTML template site. Idempotent —
// safe to call on every request rather than tracking whether it's already
// there, since the marker comment makes the injected copy identifiable.
const BADGE_MARKER = '<!-- bario-badge -->'
export function injectBadgeIntoHtml(html: string, showBadge: boolean): string {
  const withoutExisting = html.replace(
    new RegExp(`${BADGE_MARKER}[\\s\\S]*?<\\/a>`, 'i'),
    ''
  )
  if (!showBadge) return withoutExisting
  const fragment = `${BADGE_MARKER}${BADGE_HTML}`
  return /<\/body>/i.test(withoutExisting)
    ? withoutExisting.replace(/<\/body>/i, `${fragment}\n</body>`)
    : withoutExisting + fragment
}

// Templates arrive as a full, already-authored HTML document (their own
// <title>, styles, scripts). Rather than rebuild the page, this does
// targeted string-level surgery on <head> to layer optional SEO fields on
// top — same escaping/validation rules as buildSiteHtml.
export function injectSeoIntoHtml(html: string, seo: SeoOptions): string {
  let out = html

  const title = seo.metaTitle?.trim()
  if (title) {
    const titleTag = `<title>${esc(title)}</title>`
    out = /<title>[\s\S]*?<\/title>/i.test(out) ? out.replace(/<title>[\s\S]*?<\/title>/i, titleTag) : injectIntoHead(out, titleTag)
  }

  const description = seo.metaDescription?.trim()
  if (description) {
    const metaTag = `<meta name="description" content="${esc(description)}">`
    out = /<meta\s+name=["']description["'][^>]*>/i.test(out)
      ? out.replace(/<meta\s+name=["']description["'][^>]*>/i, metaTag)
      : injectIntoHead(out, metaTag)
  }

  const faviconUrl = seo.faviconUrl?.trim()
  if (faviconUrl) {
    out = injectIntoHead(out, `<link rel="icon" href="${esc(faviconUrl)}">`)
  }

  const analyticsId = seo.analyticsId?.trim()
  if (analyticsId && GA4_ID_RE.test(analyticsId)) {
    out = injectIntoHead(
      out,
      `<script async src="https://www.googletagmanager.com/gtag/js?id=${analyticsId}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${analyticsId}');</script>`
    )
  }

  return out
}

function injectIntoHead(html: string, fragment: string): string {
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${fragment}\n</head>`)
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => `${m}\n${fragment}`)
  return fragment + html
}
