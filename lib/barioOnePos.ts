import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { sanitizeForPdf } from '@/lib/invoices'
import { dateStr } from '@/lib/barioOnePayroll'
import type { BoOrganization, BoCustomer, BoPosSale, BoPosSaleItem } from '@/lib/db'

export type SaleLineInput = { productId?: string; description: string; quantity: number; unitPriceCents: number }

export function computeSaleTotals(items: SaleLineInput[], taxPercent: number, discountCents: number) {
  const subtotalCents = Math.round(items.reduce((sum, i) => sum + i.quantity * i.unitPriceCents, 0))
  const clampedDiscount = Math.min(Math.max(Math.round(discountCents), 0), subtotalCents)
  const discountedSubtotal = subtotalCents - clampedDiscount
  const taxCents = Math.round((discountedSubtotal * taxPercent) / 100)
  const totalCents = discountedSubtotal + taxCents
  return { subtotalCents, discountCents: clampedDiscount, taxCents, totalCents }
}

// 1 point per whole dollar of the final total — simple, standard loyalty
// convention. A configurable rate per org is real future work, not needed
// for a working v1.
export function loyaltyPointsForTotal(totalCents: number): number {
  return Math.floor(totalCents / 100)
}

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

export async function generateReceiptPdf(
  org: BoOrganization,
  sale: BoPosSale,
  items: BoPosSaleItem[],
  customer: BoCustomer | null
): Promise<Uint8Array> {
  // Receipts are narrow (like a real till receipt) rather than a full
  // Letter-size page — 300pt wide, tall enough for a handful of line items.
  const width = 300
  const height = 500 + items.length * 16
  const doc = await PDFDocument.create()
  const page = doc.addPage([width, height])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  const margin = 20
  let y = height - margin
  const draw = (text: string, size: number, useFont = font, align: 'left' | 'center' | 'right' = 'left') => {
    const clean = sanitizeForPdf(text)
    const textWidth = useFont.widthOfTextAtSize(clean, size)
    const x = align === 'center' ? (width - textWidth) / 2 : align === 'right' ? width - margin - textWidth : margin
    page.drawText(clean, { x, y, size, font: useFont, color: rgb(0.1, 0.1, 0.1) })
    y -= size + 6
  }
  const rowLR = (label: string, value: string, size = 9) => {
    draw(label, size, font)
    y += size + 6
    const clean = sanitizeForPdf(value)
    const textWidth = font.widthOfTextAtSize(clean, size)
    page.drawText(clean, { x: width - margin - textWidth, y, size, font, color: rgb(0.1, 0.1, 0.1) })
    y -= size + 6
  }

  draw(org.name, 14, bold, 'center')
  draw('RECEIPT', 9, font, 'center')
  draw(dateStr(sale.created_at), 8, font, 'center')
  y -= 6
  if (customer) draw(`Customer: ${customer.company_name || customer.contact_name}`, 8)
  y -= 4

  for (const item of items) {
    rowLR(`${item.quantity} x ${item.description}`, money(Math.round(item.quantity * item.unit_price_cents)), 9)
  }

  y -= 4
  rowLR('Subtotal', money(sale.subtotal_cents))
  if (sale.discount_cents > 0) rowLR('Discount', `-${money(sale.discount_cents)}`)
  if (sale.tax_cents > 0) rowLR('Tax', money(sale.tax_cents))
  y -= 4
  rowLR('TOTAL', money(sale.total_cents), 11)
  y -= 6
  draw(`Paid by ${sale.payment_method}`, 8, font, 'center')
  if (sale.loyalty_points_earned > 0) draw(`+${sale.loyalty_points_earned} loyalty points earned`, 8, font, 'center')
  y -= 10
  draw('Thank you!', 9, font, 'center')

  return doc.save()
}
