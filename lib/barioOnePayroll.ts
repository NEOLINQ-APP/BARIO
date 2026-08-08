import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { sanitizeForPdf } from '@/lib/invoices'
import type { BoOrganization, BoEmployee, BoPayRun, BoPayStub } from '@/lib/db'
import {
  FEDERAL_2026,
  PROVINCIAL_2026,
  QUEBEC_FEDERAL_ABATEMENT_RATE,
  CPP_2026,
  EI_2026,
  QPP_2026,
  EI_QUEBEC_2026,
  QPIP_2026,
  type ProvinceKey,
  type TaxBracket,
} from '@/lib/payrollTaxTables2026'

export const PROVINCE_KEYS: ProvinceKey[] = ['AB', 'BC', 'ON', 'SK', 'MB', 'QC']
export const PROVINCE_NAMES: Record<ProvinceKey, string> = {
  AB: 'Alberta', BC: 'British Columbia', ON: 'Ontario', SK: 'Saskatchewan', MB: 'Manitoba', QC: 'Quebec',
}

export type PayFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly'
export const PERIODS_PER_YEAR: Record<PayFrequency, number> = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 }

// A single 44hr/week overtime threshold is a real, defensible v1 default
// (matches Alberta's and Ontario's general Employment Standards baseline)
// but is NOT accurate for every province — BC, for instance, also has a
// daily 8hr threshold. Flagged here, not silently assumed complete.
export const DEFAULT_OVERTIME_THRESHOLD_HOURS_PER_WEEK = 44
export const OVERTIME_MULTIPLIER = 1.5

function progressiveBracketTax(annualIncome: number, brackets: TaxBracket[]): number {
  let tax = 0
  let lastCeiling = 0
  for (const bracket of brackets) {
    const ceiling = bracket.upTo ?? Infinity
    if (annualIncome <= lastCeiling) break
    const amountInBracket = Math.min(annualIncome, ceiling) - lastCeiling
    tax += amountInBracket * bracket.rate
    lastCeiling = ceiling
  }
  return tax
}

function ontarioSurtax(provincialTaxAfterCredit: number): number {
  const surtax = PROVINCIAL_2026.ON.surtax
  if (!surtax) return 0
  let total = 0
  for (const t of surtax.thresholds) {
    if (provincialTaxAfterCredit > t.upTo) total += (provincialTaxAfterCredit - t.upTo) * t.rate
  }
  return total
}

// Annualizes this period's gross (assumes consistent pay across the year
// — a real, flagged simplification; it does not track actual cumulative
// YTD tax/CPP/EI withheld across separate pay runs, which is what a real
// payroll system does for someone whose pay changes mid-year).
export function calculatePayDeductions(
  periodGrossCents: number,
  frequency: PayFrequency,
  province: ProvinceKey
): {
  federalTaxCents: number
  provincialTaxCents: number
  cppOrQppCents: number
  eiCents: number
  qpipCents: number
  totalDeductionsCents: number
  netPayCents: number
} {
  const periods = PERIODS_PER_YEAR[frequency]
  const annualGross = (periodGrossCents / 100) * periods

  // Federal tax
  const fedBpaCredit = FEDERAL_2026.basicPersonalAmount * FEDERAL_2026.brackets[0].rate
  let federalTaxAnnual = Math.max(0, progressiveBracketTax(annualGross, FEDERAL_2026.brackets) - fedBpaCredit)
  if (province === 'QC') federalTaxAnnual *= 1 - QUEBEC_FEDERAL_ABATEMENT_RATE

  // Provincial tax
  const prov = PROVINCIAL_2026[province]
  const provBpaCredit = prov.basicPersonalAmount * prov.brackets[0].rate
  let provincialTaxAnnual = Math.max(0, progressiveBracketTax(annualGross, prov.brackets) - provBpaCredit)
  if (province === 'ON') provincialTaxAnnual += ontarioSurtax(provincialTaxAnnual)

  // CPP/QPP (two-tier: base rate up to YMPE with a basic exemption, second
  // tier at a flat rate between YMPE and YAMPE with no exemption)
  const cppTable = province === 'QC' ? QPP_2026 : CPP_2026
  const pensionable1 = Math.max(0, Math.min(annualGross, cppTable.ympe) - cppTable.basicExemption)
  const cpp1Annual = Math.min(pensionable1 * cppTable.rate, cppTable.maxContribution)
  const pensionable2 = Math.max(0, Math.min(annualGross, cppTable.yampe) - cppTable.ympe)
  const cpp2Annual = Math.min(pensionable2 * cppTable.rate2, cppTable.maxContribution2)
  const cppOrQppAnnual = cpp1Annual + cpp2Annual

  // EI (reduced rate + QPIP for Quebec, since QPIP covers what EI's
  // parental-benefit portion covers elsewhere)
  const eiTable = province === 'QC' ? EI_QUEBEC_2026 : EI_2026
  const eiInsurable = Math.min(annualGross, eiTable.maxInsurableEarnings)
  const eiAnnual = Math.min(eiInsurable * eiTable.rate, eiTable.maxContribution)
  const qpipAnnual = province === 'QC' ? Math.min(annualGross, QPIP_2026.maxInsurableEarnings) * QPIP_2026.rate : 0

  const federalTaxCents = Math.round((federalTaxAnnual / periods) * 100)
  const provincialTaxCents = Math.round((provincialTaxAnnual / periods) * 100)
  const cppOrQppCents = Math.round((cppOrQppAnnual / periods) * 100)
  const eiCents = Math.round((eiAnnual / periods) * 100)
  const qpipCents = Math.round((qpipAnnual / periods) * 100)
  const totalDeductionsCents = federalTaxCents + provincialTaxCents + cppOrQppCents + eiCents + qpipCents

  return {
    federalTaxCents,
    provincialTaxCents,
    cppOrQppCents,
    eiCents,
    qpipCents,
    totalDeductionsCents,
    netPayCents: periodGrossCents - totalDeductionsCents,
  }
}

export function calculateOvertimeCents(regularHours: number, hourlyRateCents: number, thresholdHours = DEFAULT_OVERTIME_THRESHOLD_HOURS_PER_WEEK): { regularCents: number; overtimeCents: number } {
  const otHours = Math.max(0, regularHours - thresholdHours)
  const normalHours = regularHours - otHours
  return {
    regularCents: Math.round(normalHours * hourlyRateCents),
    overtimeCents: Math.round(otHours * hourlyRateCents * OVERTIME_MULTIPLIER),
  }
}

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

// postgres.js returns DATE columns as native JS Date objects server-side
// (unlike after a NextResponse.json() round-trip, where they've already
// become ISO strings) — this file works directly on raw DB rows, so a
// plain .slice(0, 10) on these fields throws. Safe against either shape.
export function dateStr(d: string | Date): string {
  return new Date(d).toISOString().slice(0, 10)
}

// Same real, working PDF style as lib/barioOneInvoices.ts's invoice PDF —
// a clean one-pager built with pdf-lib, business identity from the org,
// not a generic template.
export async function generatePayStubPdf(org: BoOrganization, employee: BoEmployee, payRun: BoPayRun, stub: BoPayStub): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([612, 792])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  const margin = 50
  let y = 792 - margin
  const draw = (text: string, x: number, size: number, useFont = font, color = rgb(0.1, 0.1, 0.1)) => {
    page.drawText(sanitizeForPdf(text), { x, y, size, font: useFont, color })
  }
  const row = (label: string, value: string, x = margin, valueX = 460) => {
    draw(label, x, 10, font, rgb(0.4, 0.4, 0.4))
    draw(value, valueX, 10)
    y -= 16
  }

  draw(org.name, margin, 20, bold, rgb(0.02, 0.5, 0.55))
  draw('PAY STATEMENT', 612 - margin - 150, 18, bold)
  y -= 30

  draw(`Employee: ${employee.name}`, margin, 11, bold)
  y -= 16
  if (employee.position) { draw(employee.position, margin, 10, font, rgb(0.4, 0.4, 0.4)); y -= 16 }
  draw(`Pay period: ${dateStr(payRun.pay_period_start)} to ${dateStr(payRun.pay_period_end)}`, margin, 10)
  y -= 14
  draw(`Pay date: ${dateStr(payRun.pay_date)}`, margin, 10)
  y -= 14
  draw(`Province: ${PROVINCE_NAMES[stub.province as ProvinceKey] ?? stub.province}`, margin, 10)
  y -= 30

  page.drawLine({ start: { x: margin, y }, end: { x: 612 - margin, y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) })
  y -= 20
  draw('Earnings', margin, 11, bold)
  y -= 18
  if (Number(stub.regular_hours) > 0) row(`Regular (${Number(stub.regular_hours).toFixed(2)} hrs)`, money(stub.regular_cents))
  if (Number(stub.overtime_hours) > 0) row(`Overtime (${Number(stub.overtime_hours).toFixed(2)} hrs)`, money(stub.overtime_cents))
  if (stub.regular_hours === 0 && stub.overtime_hours === 0) row('Salary', money(stub.regular_cents))
  if (stub.vacation_pay_cents > 0) row('Vacation pay', money(stub.vacation_pay_cents))
  row('Gross pay', money(stub.gross_cents))

  y -= 14
  page.drawLine({ start: { x: margin, y }, end: { x: 612 - margin, y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) })
  y -= 20
  draw('Deductions', margin, 11, bold)
  y -= 18
  row('Federal tax', money(stub.federal_tax_cents))
  row('Provincial tax', money(stub.provincial_tax_cents))
  row(stub.province === 'QC' ? 'QPP' : 'CPP', money(stub.cpp_or_qpp_cents))
  row('EI', money(stub.ei_cents))
  if (stub.qpip_cents > 0) row('QPIP', money(stub.qpip_cents))

  y -= 14
  page.drawLine({ start: { x: margin, y }, end: { x: 612 - margin, y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) })
  y -= 24
  draw('Net pay', margin, 14, bold)
  draw(money(stub.net_pay_cents), 460, 14, bold, rgb(0.02, 0.5, 0.55))

  return doc.save()
}
