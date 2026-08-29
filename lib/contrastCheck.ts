// Real WCAG contrast checking for Sky's theme colors (2026-08-21) — the
// first concrete slice of the Visual QA spec the user asked for, triggered
// by a real reported failure class: white text on a white/light background.
//
// This doesn't need browser automation or screenshots. Sky's sections all
// render from ONE fixed, known stylesheet (`EXPORT_CSS` in renderSite.ts) —
// the only things that vary per site are `theme.primary`/`theme.accent`/
// `theme.backgroundStyle`. That means every text/background pair that could
// ever go wrong is enumerable ahead of time by reading that stylesheet, and
// every ratio is computable with plain math — no rendering required. See
// backgroundVars() in renderSite.ts for where solid-vs-gradient is decided;
// a gradient background is checked against BOTH of its stops, since text
// overlaid on a gradient needs to stay readable across its whole range.

export type Theme = { primary: string; accent: string; backgroundStyle?: 'solid' | 'gradient' }

// Relative luminance per WCAG 2.x (sRGB -> linear -> luminance).
function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex)
  if (!rgb) return 1 // fail open toward "looks like white" if a hex is somehow unparseable — never crashes the check
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex) || /^#([0-9a-fA-F]{3})$/.exec(hex)
  if (!m) return null
  let h = m[1]
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) }
}

export function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA)
  const lB = relativeLuminance(hexB)
  const lighter = Math.max(lA, lB)
  const darker = Math.min(lA, lB)
  return (lighter + 0.05) / (darker + 0.05)
}

// WCAG AA for normal text is 4.5:1; large text (≥24px, or ≥19px bold — most
// of the headings this checks) only needs 3:1. Using the stricter 4.5:1
// uniformly is a deliberate, simple choice — it errs toward catching a real
// problem rather than under-flagging a borderline large-text heading.
const MIN_CONTRAST = 4.5

export type ContrastFailure = {
  pair: string
  foreground: string
  background: string
  ratio: number
}

// Every real theme-dependent text/background combination in EXPORT_CSS —
// fixed-hex pairs (e.g. `.s-feat-card p { color:#64748b }` on `background:
// white`) are never included here since they can't break regardless of the
// site's theme; only pairs involving `--b-primary`/`--b-accent` can.
export function checkThemeContrast(theme: Theme): ContrastFailure[] {
  const failures: ContrastFailure[] = []
  const isSolid = theme.backgroundStyle === 'solid'
  const WHITE = '#ffffff'
  const LIGHT_BG_1 = '#f8faff' // .s-features/.s-team/.s-logos/.s-pagelinks
  const LIGHT_BG_2 = '#f0f4ff' // .s-testimonial/.s-contact

  const check = (label: string, fg: string, bg: string) => {
    const ratio = contrastRatio(fg, bg)
    if (ratio < MIN_CONTRAST) failures.push({ pair: label, foreground: fg, background: bg, ratio: Math.round(ratio * 100) / 100 })
  }

  // 1. White text on a primary-colored background (.s-nav always solid;
  // .s-hero solid uses primary alone, gradient uses primary->accent — check
  // both stops in gradient mode since text sits over the whole gradient).
  check('nav text on primary background', WHITE, theme.primary)
  check('hero text on hero background (primary stop)', WHITE, theme.primary)
  if (!isSolid) check('hero text on hero background (accent stop)', WHITE, theme.accent)

  // 2. White text on an accent-colored background (.s-hero-btn/.s-cta/
  // .s-contact-btn/.s-test-av — solid uses accent alone, gradient uses
  // accent->primary, same both-stops reasoning as above).
  check('button/CTA text on accent background', WHITE, theme.accent)
  if (!isSolid) check('button/CTA text on accent background (primary stop)', WHITE, theme.primary)

  // 3. Primary-colored text on the near-white backgrounds most section
  // headings sit on (.s-stats/.s-pricing/.s-gallery/.s-faq/.s-map use
  // white; .s-features/.s-team/.s-logos/.s-pagelinks use #f8faff;
  // .s-testimonial/.s-contact use #f0f4ff).
  check('heading text on white background', theme.primary, WHITE)
  check('heading text on light background (#f8faff)', theme.primary, LIGHT_BG_1)
  check('heading text on light background (#f0f4ff)', theme.primary, LIGHT_BG_2)

  // 4. Accent-colored text on white (.s-cta-btn, .s-stat-num).
  check('accent text on white background', theme.accent, WHITE)

  return failures
}

// Auto-fix — darkens a color just enough to clear MIN_CONTRAST against
// white, preserving hue/saturation (HSL lightness reduction only) rather
// than replacing it with an unrelated color. Bails out (returns the
// original) after a bounded number of steps rather than looping forever —
// a color that can't be darkened enough in HSL space this way is treated as
// unfixable-by-this-method, not worth an infinite loop over.
export function darkenUntilReadable(hex: string, against: string = '#ffffff', minRatio = MIN_CONTRAST): string {
  let current = hex
  for (let i = 0; i < 20; i++) {
    if (contrastRatio(current, against) >= minRatio) return current
    current = darkenHex(current, 0.06)
  }
  return current
}

function darkenHex(hex: string, amount: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b)
  return hslToHex(h, s, Math.max(0, l - amount))
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  const d = max - min
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }
  return { h, s, l }
}

function hslToHex(h: number, s: number, l: number): string {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  let r: number, g: number, b: number
  if (s === 0) {
    r = g = b = l
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1 / 3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1 / 3)
  }
  const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}
