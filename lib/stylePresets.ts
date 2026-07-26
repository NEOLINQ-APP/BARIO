// Named visual "personalities" for a site — layered on top of the theme's
// primary/accent colors. Each preset is just a set of CSS custom property
// values (font pairing, corner radius, shadow/border treatment), consumed by
// both the live builder canvas (Builder.tsx) and the published-site renderer
// (renderSite.ts), so a site looks identical in the editor and once exported.
// This intentionally stays inside the existing structured section system —
// no freeform CSS/HTML generation — so every preset is safe, fast, and
// fully compatible with the click-to-edit canvas.

export type StylePresetKey = 'modern' | 'elegant' | 'bold' | 'minimal' | 'friendly'

export type StylePreset = {
  label: string
  /** Shown to the AI so it can pick a preset that fits the business. */
  vibe: string
  /** Google Fonts stylesheet URL loaded for this preset. */
  googleFontsHref: string
  vars: Record<string, string>
}

export const STYLE_PRESETS: Record<StylePresetKey, StylePreset> = {
  modern: {
    label: 'Modern',
    vibe: 'Clean, professional, tech-forward. The safe default for most businesses — SaaS, agencies, general services.',
    googleFontsHref: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap',
    vars: {
      '--b-font-heading': "'Inter', sans-serif",
      '--b-font-body': "'Inter', sans-serif",
      '--b-radius-lg': '20px',
      '--b-radius-sm': '12px',
      '--b-btn-radius': '50px',
      '--b-shadow': '0 4px 24px rgba(10,35,66,0.06)',
      '--b-card-border': 'none',
      '--b-heading-weight': '800',
      '--b-heading-tt': 'none',
      '--b-heading-ls': 'normal',
    },
  },
  elegant: {
    label: 'Elegant',
    vibe: 'Refined and upscale — serif display headings, sharp corners, subtle borders instead of shadows. Best for law firms, real estate, weddings, fine dining, luxury/premium brands.',
    googleFontsHref: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800&family=Inter:wght@400;500;600&display=swap',
    vars: {
      '--b-font-heading': "'Playfair Display', serif",
      '--b-font-body': "'Inter', sans-serif",
      '--b-radius-lg': '6px',
      '--b-radius-sm': '4px',
      '--b-btn-radius': '4px',
      '--b-shadow': 'none',
      '--b-card-border': '1px solid rgba(15,23,42,0.1)',
      '--b-heading-weight': '700',
      '--b-heading-tt': 'none',
      '--b-heading-ls': '0.01em',
    },
  },
  bold: {
    label: 'Bold',
    vibe: 'High-energy and vivid — big rounded shapes, heavy shadows, punchy type. Best for fitness, entertainment, events, sports, youth-focused brands.',
    googleFontsHref: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap',
    vars: {
      '--b-font-heading': "'Poppins', sans-serif",
      '--b-font-body': "'Poppins', sans-serif",
      '--b-radius-lg': '28px',
      '--b-radius-sm': '16px',
      '--b-btn-radius': '50px',
      '--b-shadow': '0 12px 32px rgba(10,35,66,0.16)',
      '--b-card-border': 'none',
      '--b-heading-weight': '800',
      '--b-heading-tt': 'none',
      '--b-heading-ls': 'normal',
    },
  },
  minimal: {
    label: 'Minimal',
    vibe: 'Understated and technical — tight type, flat surfaces, thin borders, no shadows. Best for developer tools, architecture/design studios, minimalist product brands.',
    googleFontsHref: 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap',
    vars: {
      '--b-font-heading': "'Manrope', sans-serif",
      '--b-font-body': "'Manrope', sans-serif",
      '--b-radius-lg': '8px',
      '--b-radius-sm': '6px',
      '--b-btn-radius': '8px',
      '--b-shadow': 'none',
      '--b-card-border': '1px solid #e2e8f0',
      '--b-heading-weight': '700',
      '--b-heading-tt': 'none',
      '--b-heading-ls': '-0.01em',
    },
  },
  friendly: {
    label: 'Friendly',
    vibe: 'Warm and playful — rounded pill shapes, soft shadows, a rounded display font. Best for daycares/education, pet services, cafes, community/nonprofit, family businesses.',
    googleFontsHref: 'https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=Nunito:wght@400;600;700&display=swap',
    vars: {
      '--b-font-heading': "'Baloo 2', cursive",
      '--b-font-body': "'Nunito', sans-serif",
      '--b-radius-lg': '28px',
      '--b-radius-sm': '18px',
      '--b-btn-radius': '999px',
      '--b-shadow': '0 8px 24px rgba(249,115,22,0.12)',
      '--b-card-border': 'none',
      '--b-heading-weight': '800',
      '--b-heading-tt': 'none',
      '--b-heading-ls': 'normal',
    },
  },
}

export const STYLE_PRESET_KEYS = Object.keys(STYLE_PRESETS) as StylePresetKey[]
export const DEFAULT_STYLE_PRESET: StylePresetKey = 'modern'

export function isStylePresetKey(value: unknown): value is StylePresetKey {
  return typeof value === 'string' && (STYLE_PRESET_KEYS as string[]).includes(value)
}

/** Inline `key:value;` string for embedding preset vars in a raw <style> block (published HTML). */
export function presetVarsToCss(preset: StylePreset): string {
  return Object.entries(preset.vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(';')
}
