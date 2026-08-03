import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { sanitizeForPdf } from '@/lib/invoices'
import { getProvince } from '@/lib/payrollCRA'
import { getEmployerInfo, getDocumentLogoUrl } from '@/lib/platformSettings'
import type { Staff, Paystub } from '@/lib/db'

function money(cents: number) {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export async function generatePaystubPdf(sql: any, staff: Staff, stub: Paystub): Promise<Uint8Array> {
  const [employer, logoUrl] = await Promise.all([getEmployerInfo(sql), getDocumentLogoUrl(sql)])

  const doc = await PDFDocument.create()
  const page = doc.addPage([612, 792])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const margin = 50
  let y = 792 - margin

  const draw = (text: string, x: number, size: number, useFont = font, color = rgb(0.1, 0.1, 0.1)) => {
    page.drawText(sanitizeForPdf(text), { x, y, size, font: useFont, color })
  }
  const line = () => {
    page.drawLine({ start: { x: margin, y }, end: { x: 612 - margin, y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) })
  }

  let logoWidth = 0
  try {
    const logoBytes = await fetch(logoUrl).then((r) => r.arrayBuffer())
    const embed = logoUrl.endsWith('.jpg') || logoUrl.endsWith('.jpeg') ? doc.embedJpg.bind(doc) : doc.embedPng.bind(doc)
    const logoImage = await embed(logoBytes)
    const dim = logoImage.scale(24 / logoImage.width)
    page.drawImage(logoImage, { x: margin, y: y - 18, width: dim.width, height: dim.height })
    logoWidth = dim.width + 8
  } catch {
    // Non-fatal — the PDF still generates without the logo image.
  }
  draw(employer.name, margin + logoWidth, 20, bold, rgb(0.02, 0.5, 0.55))
  draw('PAY STATEMENT', 612 - margin - 140, 18, bold)
  y -= 20
  if (employer.address) {
    draw(employer.address, margin + logoWidth, 9, font, rgb(0.4, 0.4, 0.4))
    y -= 12
  }
  if (employer.businessNumber) {
    draw(`CRA Business Number: ${employer.businessNumber}`, margin + logoWidth, 9, font, rgb(0.4, 0.4, 0.4))
    y -= 12
  }
  y -= 8
  draw(`Pay period: ${stub.pay_period_start} to ${stub.pay_period_end}`, margin, 10, font, rgb(0.4, 0.4, 0.4))
  draw(`Pay date: ${stub.pay_date}`, 612 - margin - 140, 10, font, rgb(0.4, 0.4, 0.4))
  y -= 26

  draw('Employee', margin, 9, bold, rgb(0.4, 0.4, 0.4))
  y -= 14
  draw(staff.name, margin, 12, bold)
  y -= 14
  if (staff.address) {
    draw(staff.address, margin, 10)
    y -= 14
  }
  draw(`Province: ${getProvince(stub.province).name}`, margin, 10, font, rgb(0.4, 0.4, 0.4))
  y -= 24
  line()
  y -= 20

  draw('Earnings', margin, 10, bold, rgb(0.4, 0.4, 0.4))
  draw('Amount', 500, 10, bold, rgb(0.4, 0.4, 0.4))
  y -= 16
  draw('Gross pay', margin, 10)
  draw(money(stub.gross_pay_cents), 500, 10)
  y -= 16

  const bonuses = JSON.parse(stub.bonuses_json || '[]') as { label: string; amountCents: number }[]
  for (const b of bonuses) {
    draw(`  ${b.label}`, margin, 10, font, rgb(0.4, 0.4, 0.4))
    draw(money(b.amountCents), 500, 10)
    y -= 16
  }

  y -= 8
  line()
  y -= 20

  draw('Deductions', margin, 10, bold, rgb(0.4, 0.4, 0.4))
  y -= 16
  const deductionRows: [string, number][] = [
    ['CPP', stub.cpp_cents],
    ['CPP2', stub.cpp2_cents],
    ['EI', stub.ei_cents],
    ['Federal tax', stub.federal_tax_cents],
    ['Provincial tax', stub.provincial_tax_cents],
  ]
  for (const [label, cents] of deductionRows) {
    if (cents === 0) continue
    draw(label, margin, 10)
    draw(`-${money(cents)}`, 500, 10)
    y -= 16
  }

  const additional = JSON.parse(stub.additional_deductions_json || '[]') as { label: string; amountCents: number }[]
  for (const d of additional) {
    draw(d.label, margin, 10)
    draw(`-${money(d.amountCents)}`, 500, 10)
    y -= 16
  }

  y -= 8
  line()
  y -= 22
  draw('Net pay', margin, 13, bold)
  draw(money(stub.net_pay_cents), 500, 13, bold)
  y -= 36

  draw('Year-to-date', margin, 10, bold, rgb(0.4, 0.4, 0.4))
  y -= 16
  draw('YTD gross', margin, 10)
  draw(money(stub.ytd_gross_cents), 500, 10)
  y -= 16
  draw('YTD deductions', margin, 10)
  draw(money(stub.ytd_deductions_cents), 500, 10)
  y -= 16
  draw('YTD net', margin, 10)
  draw(money(stub.ytd_net_cents), 500, 10)
  y -= 30

  if (!getProvince(stub.province).verified) {
    draw(`Note: ${getProvince(stub.province).name}'s provincial tax figures are a placeholder, not yet verified against CRA — confirm before relying on this for real payroll.`, margin, 8, font, rgb(0.7, 0.3, 0.1))
  }

  return doc.save()
}
