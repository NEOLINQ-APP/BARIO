// Small fixed preset registry for the invoice/estimate/work-order theme
// picker (Phase C) — a QuickBooks-Simple-Start-style set of layout presets,
// not a freeform designer. Both generateBoInvoicePdf() and
// BarioOnePublicInvoice.tsx read this to stay visually in sync.

export type InvoiceThemeKey = 'classic' | 'modern' | 'bold' | 'minimal'

export const INVOICE_THEME_KEYS: InvoiceThemeKey[] = ['classic', 'modern', 'bold', 'minimal']

export type InvoiceTheme = {
  key: InvoiceThemeKey
  label: string
  description: string
  // Header style: 'left' = logo+name left-aligned classic letterhead,
  // 'centered' = logo+name centered, 'band' = a solid color band behind
  // the header using the org's accent color.
  headerStyle: 'left' | 'centered' | 'band'
  accentWeight: 'subtle' | 'bold'
}

export const INVOICE_THEMES: Record<InvoiceThemeKey, InvoiceTheme> = {
  classic: {
    key: 'classic', label: 'Classic', description: 'Traditional left-aligned letterhead, subtle accent color.',
    headerStyle: 'left', accentWeight: 'subtle',
  },
  modern: {
    key: 'modern', label: 'Modern', description: 'Centered logo and business name, clean spacing.',
    headerStyle: 'centered', accentWeight: 'subtle',
  },
  bold: {
    key: 'bold', label: 'Bold', description: 'A solid color band across the header using your accent color.',
    headerStyle: 'band', accentWeight: 'bold',
  },
  minimal: {
    key: 'minimal', label: 'Minimal', description: 'No accent color, just clean type.',
    headerStyle: 'left', accentWeight: 'subtle',
  },
}

export function isInvoiceThemeKey(v: unknown): v is InvoiceThemeKey {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(INVOICE_THEMES, v)
}

// Which optional fields show on a document — org-wide toggle, defaults all
// on so existing behavior (before this feature existed) doesn't change.
export type InvoiceFieldToggles = {
  showTaxNumber: boolean
  showDueDate: boolean
  showNotes: boolean
  showBusinessAddress: boolean
}

export const DEFAULT_FIELD_TOGGLES: InvoiceFieldToggles = {
  showTaxNumber: true,
  showDueDate: true,
  showNotes: true,
  showBusinessAddress: true,
}

export function parseFieldToggles(json: string | null | undefined): InvoiceFieldToggles {
  if (!json) return { ...DEFAULT_FIELD_TOGGLES }
  try {
    const parsed = JSON.parse(json)
    return { ...DEFAULT_FIELD_TOGGLES, ...parsed }
  } catch {
    return { ...DEFAULT_FIELD_TOGGLES }
  }
}

// #RRGGBB -> [0-1, 0-1, 0-1] for pdf-lib's rgb(). Falls back to a neutral
// dark gray on anything malformed rather than throwing mid-PDF-generation.
export function hexToRgbUnit(hex: string | null | undefined): [number, number, number] {
  const fallback: [number, number, number] = [0.02, 0.5, 0.55]
  if (!hex) return fallback
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!match) return fallback
  const int = parseInt(match[1], 16)
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255]
}
