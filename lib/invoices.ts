import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { getStripe } from '@/lib/stripe'
import { getDocumentLogoUrl } from '@/lib/platformSettings'
import type { Invoice, InvoiceLineItem } from '@/lib/db'

export type LineItemInput = { description: string; quantity: number; unitPriceCents: number }

// discount_value's unit depends on discount_type, matching how the rest of
// this schema stores money — 'percent' is a plain percentage (0-100, same
// convention as tax_percent), 'fixed' is already in cents (same convention
// as unit_price_cents) rather than dollars.
export type Discount = { type: 'none' | 'percent' | 'fixed'; value: number }

export function computeTotals(lineItems: LineItemInput[], taxPercent: number, discount: Discount = { type: 'none', value: 0 }) {
  const subtotalCents = Math.round(lineItems.reduce((sum, li) => sum + li.quantity * li.unitPriceCents, 0))

  let discountCents = 0
  if (discount.type === 'percent') discountCents = Math.round((subtotalCents * discount.value) / 100)
  else if (discount.type === 'fixed') discountCents = Math.round(discount.value)
  discountCents = Math.min(Math.max(discountCents, 0), subtotalCents)

  const discountedSubtotalCents = subtotalCents - discountCents
  const taxCents = Math.round((discountedSubtotalCents * taxPercent) / 100)
  const totalCents = discountedSubtotalCents + taxCents
  return { subtotalCents, discountCents, discountedSubtotalCents, taxCents, totalCents }
}

function discountOf(invoice: Invoice): Discount {
  return { type: invoice.discount_type, value: Number(invoice.discount_value) }
}

// Simple sequential numbering (INV-0001 / QUO-0001) — fine for a low-volume
// manual tool; a real concurrent-safe sequence isn't worth the complexity
// here since invoices are created one at a time by a single admin.
// Real numbering starts at 1000 — anything below that (e.g. INV-0001, a
// leftover from initial testing before real launch) is ignored when
// computing the next number, so the sequence effectively restarts clean
// rather than continuing from test data.
export async function nextInvoiceNumber(sql: any, type: 'invoice' | 'quote'): Promise<string> {
  const prefix = type === 'quote' ? 'QUO' : 'INV'
  const rows = (await sql`SELECT number FROM invoices WHERE type = ${type}`) as unknown as { number: string }[]
  let max = 999
  for (const row of rows) {
    const match = row.number.match(/^[A-Z]+-(\d+)$/)
    if (match) {
      const n = parseInt(match[1], 10)
      if (n >= 1000 && n > max) max = n
    }
  }
  return `${prefix}-${max + 1}`
}

export async function createInvoicePaymentSession(invoice: Invoice, lineItems: InvoiceLineItem[], origin: string): Promise<string> {
  const stripe = getStripe()

  const items = lineItems.map((li) => ({
    price_data: {
      currency: invoice.currency.toLowerCase(),
      unit_amount: li.unit_price_cents,
      product_data: { name: li.description },
    },
    quantity: Math.round(Number(li.quantity)),
  }))

  const taxPercent = Number(invoice.tax_percent)
  const discount = discountOf(invoice)
  const { discountCents, taxCents } = computeTotals(
    lineItems.map((li) => ({ description: li.description, quantity: Number(li.quantity), unitPriceCents: li.unit_price_cents })),
    taxPercent,
    discount
  )

  if (taxCents > 0) {
    items.push({
      price_data: {
        currency: invoice.currency.toLowerCase(),
        unit_amount: taxCents,
        product_data: { name: `Tax (${taxPercent}%)` },
      },
      quantity: 1,
    })
  }

  // Stripe Checkout line items can't go negative — a discount can't be
  // modeled as a negative-amount line the way tax is added as a positive
  // one. The real mechanism is a one-time Stripe coupon applied to the
  // whole session via `discounts`. Always created as a fixed amount_off
  // (never percent_off), even when the invoice's own discount is a
  // percentage — computeTotals already resolved that percentage against
  // the pre-tax subtotal above, and a Stripe percent_off coupon would
  // instead apply against the session's full total (including the tax
  // line item just added), which would discount more than intended.
  let discounts: { coupon: string }[] | undefined
  if (discountCents > 0) {
    const coupon = await stripe.coupons.create({
      amount_off: discountCents,
      currency: invoice.currency.toLowerCase(),
      duration: 'once',
      name: `${invoice.number} discount`,
    })
    discounts = [{ coupon: coupon.id }]
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: invoice.client_email ?? undefined,
    metadata: { invoiceId: invoice.id },
    line_items: items,
    ...(discounts ? { discounts } : {}),
    success_url: `${origin}/invoice/${invoice.public_token}?paid=1`,
    cancel_url: `${origin}/invoice/${invoice.public_token}`,
  })
  return session.url!
}

function money(cents: number, currency: string) {
  return `${(cents / 100).toFixed(2)} ${currency}`
}

// pdf-lib's StandardFonts only support WinAnsi encoding (Latin-1 range) —
// any admin- or client-supplied text (a name, a line item description)
// containing a character outside that range would otherwise throw and
// 500 the whole PDF. Normalizes common Word/browser "smart" punctuation to
// its ASCII equivalent first (the most likely real-world case), then falls
// back to '?' for anything still unencodable — full Unicode font embedding
// is a real option later if non-Latin-script clients need it, not needed
// for v1.
export function sanitizeForPdf(text: string): string {
  const normalized = text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
  return Array.from(normalized)
    .map((ch) => (ch.codePointAt(0)! <= 0xff ? ch : '?'))
    .join('')
}

// Generates a clean one-page PDF server-side (pdf-lib works identically in
// Node as in the browser — already a project dependency, used client-side
// for Bario Studio's print-PDF export).
export async function generateInvoicePdf(sql: any, invoice: Invoice, lineItems: InvoiceLineItem[]): Promise<Uint8Array> {
  const logoUrl = await getDocumentLogoUrl(sql)
  const doc = await PDFDocument.create()
  const page = doc.addPage([612, 792]) // US Letter
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  const margin = 50
  let y = 792 - margin

  const draw = (text: string, x: number, size: number, useFont = font, color = rgb(0.1, 0.1, 0.1)) => {
    page.drawText(sanitizeForPdf(text), { x, y, size, font: useFont, color })
  }

  // Fetched from a URL (Bario's own by default, or a custom-uploaded one —
  // see lib/platformSettings.ts) rather than read off disk — Vercel's
  // serverless function filesystem doesn't reliably expose public/ at a
  // fixed path, whereas a URL always works the same way in dev and prod.
  let logoWidth = 0
  try {
    const logoBytes = await fetch(logoUrl).then((r) => r.arrayBuffer())
    const embed = logoUrl.endsWith('.jpg') || logoUrl.endsWith('.jpeg') ? doc.embedJpg.bind(doc) : doc.embedPng.bind(doc)
    const logoImage = await embed(logoBytes)
    const logoDim = logoImage.scale(26 / logoImage.width)
    page.drawImage(logoImage, { x: margin, y: y - 20, width: logoDim.width, height: logoDim.height })
    logoWidth = logoDim.width + 8
  } catch {
    // Non-fatal — the PDF still generates correctly without the logo image.
  }

  draw('Bario', margin + logoWidth, 24, bold, rgb(0.02, 0.5, 0.55))
  draw(invoice.type === 'quote' ? 'QUOTE' : 'INVOICE', 612 - margin - 100, 20, bold)
  y -= 20
  draw('bario.ca', margin + logoWidth, 10, font, rgb(0.4, 0.4, 0.4))
  draw(invoice.number, 612 - margin - 100, 12, font, rgb(0.4, 0.4, 0.4))
  y -= 40

  draw('Bill to:', margin, 10, bold, rgb(0.4, 0.4, 0.4))
  y -= 14
  draw(invoice.client_name, margin, 12, bold)
  y -= 16
  if (invoice.client_email) {
    draw(invoice.client_email, margin, 10)
    y -= 14
  }
  if (invoice.client_address) {
    for (const line of invoice.client_address.split('\n')) {
      draw(line, margin, 10)
      y -= 14
    }
  }

  const rightX = 612 - margin - 150
  let ry = 792 - margin - 20
  page.drawText(`Date: ${new Date(invoice.created_at).toLocaleDateString()}`, { x: rightX, y: ry, size: 10, font })
  ry -= 14
  if (invoice.due_date) {
    page.drawText(`Due: ${new Date(invoice.due_date).toLocaleDateString()}`, { x: rightX, y: ry, size: 10, font })
    ry -= 14
  }
  page.drawText(`Status: ${invoice.status.toUpperCase()}`, { x: rightX, y: ry, size: 10, font: bold })

  y -= 30
  page.drawLine({ start: { x: margin, y }, end: { x: 612 - margin, y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) })
  y -= 20

  draw('Description', margin, 10, bold, rgb(0.4, 0.4, 0.4))
  draw('Qty', 400, 10, bold, rgb(0.4, 0.4, 0.4))
  draw('Unit price', 460, 10, bold, rgb(0.4, 0.4, 0.4))
  draw('Amount', 540, 10, bold, rgb(0.4, 0.4, 0.4))
  y -= 16
  page.drawLine({ start: { x: margin, y }, end: { x: 612 - margin, y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) })
  y -= 18

  for (const li of lineItems) {
    const qty = Number(li.quantity)
    const amount = Math.round(qty * li.unit_price_cents)
    draw(li.description, margin, 10)
    draw(String(qty), 400, 10)
    draw(money(li.unit_price_cents, invoice.currency), 460, 10)
    draw(money(amount, invoice.currency), 540, 10)
    y -= 18
  }

  const { subtotalCents, discountCents, taxCents, totalCents } = computeTotals(
    lineItems.map((li) => ({ description: li.description, quantity: Number(li.quantity), unitPriceCents: li.unit_price_cents })),
    Number(invoice.tax_percent),
    discountOf(invoice)
  )

  y -= 10
  page.drawLine({ start: { x: 400, y }, end: { x: 612 - margin, y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) })
  y -= 20
  draw('Subtotal', 460, 10, font, rgb(0.4, 0.4, 0.4))
  draw(money(subtotalCents, invoice.currency), 540, 10)
  y -= 16
  if (discountCents > 0) {
    const label = invoice.discount_type === 'percent' ? `Discount (${Number(invoice.discount_value)}%)` : 'Discount'
    draw(label, 460, 10, font, rgb(0.4, 0.4, 0.4))
    draw(`-${money(discountCents, invoice.currency)}`, 540, 10)
    y -= 16
  }
  if (Number(invoice.tax_percent) > 0) {
    draw(`Tax (${Number(invoice.tax_percent)}%)`, 460, 10, font, rgb(0.4, 0.4, 0.4))
    draw(money(taxCents, invoice.currency), 540, 10)
    y -= 16
  }
  draw('Total', 460, 12, bold)
  draw(money(totalCents, invoice.currency), 540, 12, bold)
  y -= 30

  if (invoice.notes) {
    page.drawLine({ start: { x: margin, y }, end: { x: 612 - margin, y }, thickness: 1, color: rgb(0.9, 0.9, 0.9) })
    y -= 20
    draw('Notes', margin, 10, bold, rgb(0.4, 0.4, 0.4))
    y -= 14
    for (const line of invoice.notes.split('\n')) {
      draw(line, margin, 10)
      y -= 14
    }
  }

  return doc.save()
}
