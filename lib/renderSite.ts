// Shared HTML rendering for a site's sections + theme. Used by both the
// builder's "Export HTML" button (client-side) and the live /site/[domain]
// page (server-side), so a published site always matches what gets exported.

export type SectionType = 'nav' | 'hero' | 'features' | 'stats' | 'testimonial' | 'pricing' | 'cta' | 'footer'
export type SectionData = Record<string, string>
export type Section = { type: SectionType; data: SectionData }
export type Theme = { primary: string; accent: string }

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

function sectionToHtml(type: SectionType, data: SectionData): string {
  switch (type) {
    case 'nav':
      return `<div class="s-nav"><div class="s-nav-logo">${esc(data.logo)}</div><div class="s-nav-links"><span>Home</span><span>About</span><span>Services</span><span>Contact</span></div></div>`
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
  }
}

export const EXPORT_CSS = `
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',sans-serif}
.s-nav{background:var(--b-primary);color:white;padding:16px 48px;display:flex;align-items:center;justify-content:space-between}
.s-nav-logo{font-size:20px;font-weight:800}
.s-nav-links{display:flex;gap:28px;font-size:13px;opacity:0.8}
.s-hero{background:linear-gradient(135deg,var(--b-primary) 0%,#1e3a6e 60%,var(--b-accent) 100%);color:white;padding:96px 64px;text-align:center}
.s-hero h1{font-size:52px;font-weight:800;margin-bottom:18px;line-height:1.15}
.s-hero p{font-size:19px;opacity:0.85;margin-bottom:36px;max-width:580px;margin-left:auto;margin-right:auto}
.s-hero-btn{background:linear-gradient(135deg,#fbbf24,#f97316);color:white;padding:16px 44px;border-radius:50px;font-size:16px;font-weight:700;display:inline-block}
.s-features{padding:88px 64px;background:#f8faff}
.s-features h2{text-align:center;font-size:38px;font-weight:800;margin-bottom:56px;color:var(--b-primary)}
.s-features-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:28px}
.s-feat-card{background:white;border-radius:20px;padding:36px;box-shadow:0 4px 24px rgba(10,35,66,0.06);text-align:center}
.s-feat-icon{font-size:44px;margin-bottom:18px}
.s-feat-card h3{font-size:19px;font-weight:700;margin-bottom:10px;color:var(--b-primary)}
.s-feat-card p{font-size:14px;color:#64748b;line-height:1.65}
.s-stats{padding:56px 64px;background:white}
.s-stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:24px;text-align:center}
.s-stat-num{font-size:42px;font-weight:800;color:var(--b-accent)}
.s-stat-label{font-size:13px;color:#64748b;margin-top:6px}
.s-testimonial{padding:88px 64px;background:#f0f4ff}
.s-testimonial h2{text-align:center;font-size:38px;font-weight:800;margin-bottom:48px;color:var(--b-primary)}
.s-test-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
.s-test-card{background:white;border-radius:16px;padding:28px;box-shadow:0 4px 16px rgba(10,35,66,0.06)}
.s-test-quote{font-size:14px;color:#64748b;line-height:1.7;margin-bottom:20px;font-style:italic}
.s-test-author{display:flex;align-items:center;gap:10px}
.s-test-av{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,var(--b-accent),var(--b-primary));display:flex;align-items:center;justify-content:center;color:white;font-size:13px;font-weight:700}
.s-test-name{font-size:13px;font-weight:700;color:var(--b-primary)}
.s-test-role{font-size:11px;color:#94a3b8}
.s-pricing{padding:88px 64px;background:white}
.s-pricing h2{text-align:center;font-size:38px;font-weight:800;margin-bottom:48px;color:var(--b-primary)}
.s-price-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
.s-price-card{border:2px solid #e2e8f0;border-radius:20px;padding:36px;text-align:center}
.s-price-card.featured{border-color:var(--b-accent);background:#f0f4ff;transform:scale(1.04)}
.s-price-name{font-size:16px;font-weight:700;color:var(--b-primary);margin-bottom:8px}
.s-price-num{font-size:42px;font-weight:800;color:var(--b-accent);margin-bottom:4px}
.s-price-per{font-size:13px;color:#94a3b8;margin-bottom:24px}
.s-price-features{list-style:none;text-align:left;margin-bottom:28px}
.s-price-features li{font-size:13px;color:#64748b;padding:6px 0;border-bottom:1px solid #e2e8f0}
.s-cta{background:linear-gradient(135deg,var(--b-accent),var(--b-primary));color:white;padding:88px 64px;text-align:center}
.s-cta h2{font-size:42px;font-weight:800;margin-bottom:18px}
.s-cta p{font-size:19px;opacity:0.88;margin-bottom:36px;max-width:560px;margin-left:auto;margin-right:auto}
.s-cta-btn{background:white;color:var(--b-accent);padding:16px 44px;border-radius:50px;font-size:16px;font-weight:700;display:inline-block}
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

// Theme values land inside a <style> block, where HTML-escaping alone
// doesn't stop CSS injection (e.g. "red; } body { display:none"). Since
// these are only ever meant to be hex colors, validate the format instead
// and fall back to the app default for anything else.
const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/
function sanitizeColor(value: string | undefined, fallback: string): string {
  return value && HEX_COLOR_RE.test(value) ? value : fallback
}

export function buildSiteHtml(name: string, sections: Section[], theme: Theme): string {
  const body = sections.map((s) => sectionToHtml(s.type, s.data)).join('\n')
  const primary = sanitizeColor(theme.primary, '#0A2342')
  const accent = sanitizeColor(theme.accent, '#1a56db')
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(name)} — Built with Bario</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>:root{--b-primary:${primary};--b-accent:${accent}}${EXPORT_CSS}</style>
</head>
<body>
${body}
<!-- Built with Bario — bario.ca -->
</body>
</html>`
}
