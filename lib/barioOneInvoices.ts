import { randomBytes } from 'node:crypto'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { computeTotals, sanitizeForPdf, type Discount, type LineItemInput } from '@/lib/invoices'
import type { BoOrganization, BoCustomer, BoInvoice, BoInvoiceItem } from '@/lib/db'

export { computeTotals }

// Same scan-based approach as the platform's own nextInvoiceNumber() in
// lib/invoices.ts, just scoped to one org+type instead of globally — real
// businesses expect their own invoice numbers to start at 1, not share a
// platform-wide counter. Fine for the same reason the original comment
// gives: low-volume, one-at-a-time creation, not a high-concurrency ticket
// counter.
export async function nextBoInvoiceNumber(sql: any, organizationId: string, type: 'estimate' | 'quote' | 'invoice'): Promise<string> {
  const prefix = type === 'estimate' ? 'EST' : type === 'quote' ? 'QUO' : 'INV'
  const rows = (await sql`
    SELECT number FROM bo_invoices WHERE organization_id = ${organizationId} AND type = ${type}
  `) as unknown as { number: string }[]
  let max = 999
  for (const row of rows) {
    const match = row.number.match(/^[A-Z]+-(\d+)$/)
    if (match) {
      const n = parseInt(match[1], 10)
      if (n > max) max = n
    }
  }
  return `${prefix}-${max + 1}`
}

export function newPublicToken(): string {
  return randomBytes(16).toString('hex')
}

function discountOf(invoice: BoInvoice): Discount {
  return { type: invoice.discount_type, value: Number(invoice.discount_value) }
}

function toLineItemInputs(items: BoInvoiceItem[]): LineItemInput[] {
  return items.map((li) => ({ description: li.description, quantity: Number(li.quantity), unitPriceCents: li.unit_price_cents }))
}

function money(cents: number, currency: string) {
  return `${(cents / 100).toFixed(2)} ${currency}`
}

// Same layout/logic as lib/invoices.ts's generateInvoicePdf, adapted for a
// tenant org's own branding (logo/name/address) as the "from" party and a
// bo_customer as the "bill to" party, instead of Bario's own fixed identity.
export async function generateBoInvoicePdf(
  org: BoOrganization,
  customer: BoCustomer,
  invoice: BoInvoice,
  lineItems: BoInvoiceItem[]
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([612, 792])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  const margin = 50
  let y = 792 - margin

  const draw = (text: string, x: number, size: number, useFont = font, color = rgb(0.1, 0.1, 0.1)) => {
    page.drawText(sanitizeForPdf(text), { x, y, size, font: useFont, color })
  }

  let logoWidth = 0
  if (org.branding_logo_url) {
    try {
      const logoBytes = await fetch(org.branding_logo_url).then((r) => r.arrayBuffer())
      const embed = org.branding_logo_url.endsWith('.jpg') || org.branding_logo_url.endsWith('.jpeg') ? doc.embedJpg.bind(doc) : doc.embedPng.bind(doc)
      const logoImage = await embed(logoBytes)
      const logoDim = logoImage.scale(26 / logoImage.width)
      page.drawImage(logoImage, { x: margin, y: y - 20, width: logoDim.width, height: logoDim.height })
      logoWidth = logoDim.width + 8
    } catch {
      // Non-fatal — the PDF still generates correctly without the logo image.
    }
  }

  draw(org.name, margin + logoWidth, 20, bold, rgb(0.02, 0.5, 0.55))
  draw(invoice.type.toUpperCase(), 612 - margin - 100, 20, bold)
  y -= 18
  if (org.business_email) {
    draw(org.business_email, margin + logoWidth, 9, font, rgb(0.4, 0.4, 0.4))
    y -= 12
  }
  if (org.business_phone) {
    draw(org.business_phone, margin + logoWidth, 9, font, rgb(0.4, 0.4, 0.4))
    y -= 12
  }
  if (org.tax_number) {
    draw(`Tax #: ${org.tax_number}`, margin + logoWidth, 9, font, rgb(0.4, 0.4, 0.4))
  }
  draw(invoice.number, 612 - margin - 100, 12, font, rgb(0.4, 0.4, 0.4))
  y -= 40

  draw('Bill to:', margin, 10, bold, rgb(0.4, 0.4, 0.4))
  y -= 14
  draw(customer.company_name || customer.contact_name, margin, 12, bold)
  y -= 16
  if (customer.company_name) {
    draw(customer.contact_name, margin, 10)
    y -= 14
  }
  if (customer.email) {
    draw(customer.email, margin, 10)
    y -= 14
  }
  if (customer.address) {
    for (const line of customer.address.split('\n')) {
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
    toLineItemInputs(lineItems),
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
    draw(`${invoice.tax_label} (${Number(invoice.tax_percent)}%)`, 460, 10, font, rgb(0.4, 0.4, 0.4))
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
