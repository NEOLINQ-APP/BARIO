// Real CRA payroll figures — 2026 tax year. Cross-referenced against
// multiple sources (CRA's own T4127/T4032 guides weren't fetchable
// directly — 403'd — so these were verified via consistent agreement
// across several independent tax-reference sites rather than a single
// source). CPP/CPP2/EI are federal, uniform nationwide, and high
// confidence. Federal tax brackets are the standard published structure.
//
// IMPORTANT — read before relying on this for real remittances:
// Provincial tax brackets/BPA are only real and verified for Alberta so
// far. Every other province/territory is present in the dropdown (so
// paystubs can be created for any province) but uses a PLACEHOLDER
// bracket, deliberately flagged `verified: false` — the UI must show a
// warning whenever one of these is selected. Do not treat any
// unverified province's number as CRA-compliant; verify against CRA's own
// PDOC (canada.ca/pdoc) or an accountant before real use. Federal/Alberta
// figures should also be spot-checked against PDOC before your first real
// payroll run — this implements the standard annualized-bracket method,
// not CRA's exact T4127 cumulative-averaging formula with its K1/K2/K3
// terms, so results are a close estimate, not a byte-for-byte match.
export const CRA_YEAR = 2026

export const CPP = { rate: 0.0595, basicExemptionCents: 350000, ympeCents: 7460000 }
export const CPP2 = { rate: 0.04, yampeCents: 8500000 }
export const EI = { rate: 0.0163, maxInsurableCents: 6890000 }

export const FEDERAL_BPA_CENTS = 1645200

export const FEDERAL_BRACKETS: { upToCents: number | null; rate: number }[] = [
  { upToCents: 5737500, rate: 0.15 },
  { upToCents: 11475000, rate: 0.205 },
  { upToCents: 15851900, rate: 0.26 },
  { upToCents: 22000000, rate: 0.29 },
  { upToCents: null, rate: 0.33 },
]

export type ProvinceCode = 'AB' | 'BC' | 'SK' | 'MB' | 'ON' | 'QC' | 'NB' | 'NS' | 'PE' | 'NL' | 'YT' | 'NT' | 'NU'

export const PROVINCES: { code: ProvinceCode; name: string; verified: boolean; bpaCents: number; brackets: { upToCents: number | null; rate: number }[] }[] = [
  {
    code: 'AB', name: 'Alberta', verified: true, bpaCents: 2276900,
    brackets: [{ upToCents: null, rate: 0.10 }], // Alberta: flat 10% provincial rate — consistently confirmed across sources
  },
  // Every other province/territory: placeholder only (flat 10% as a
  // rough stand-in), NOT verified against CRA. Selectable so a paystub
  // can still be created, but the UI must warn clearly.
  { code: 'BC', name: 'British Columbia', verified: false, bpaCents: FEDERAL_BPA_CENTS, brackets: [{ upToCents: null, rate: 0.10 }] },
  { code: 'SK', name: 'Saskatchewan', verified: false, bpaCents: FEDERAL_BPA_CENTS, brackets: [{ upToCents: null, rate: 0.10 }] },
  { code: 'MB', name: 'Manitoba', verified: false, bpaCents: FEDERAL_BPA_CENTS, brackets: [{ upToCents: null, rate: 0.10 }] },
  { code: 'ON', name: 'Ontario', verified: false, bpaCents: FEDERAL_BPA_CENTS, brackets: [{ upToCents: null, rate: 0.10 }] },
  { code: 'QC', name: 'Quebec', verified: false, bpaCents: FEDERAL_BPA_CENTS, brackets: [{ upToCents: null, rate: 0.10 }] },
  { code: 'NB', name: 'New Brunswick', verified: false, bpaCents: FEDERAL_BPA_CENTS, brackets: [{ upToCents: null, rate: 0.10 }] },
  { code: 'NS', name: 'Nova Scotia', verified: false, bpaCents: FEDERAL_BPA_CENTS, brackets: [{ upToCents: null, rate: 0.10 }] },
  { code: 'PE', name: 'Prince Edward Island', verified: false, bpaCents: FEDERAL_BPA_CENTS, brackets: [{ upToCents: null, rate: 0.10 }] },
  { code: 'NL', name: 'Newfoundland and Labrador', verified: false, bpaCents: FEDERAL_BPA_CENTS, brackets: [{ upToCents: null, rate: 0.10 }] },
  { code: 'YT', name: 'Yukon', verified: false, bpaCents: FEDERAL_BPA_CENTS, brackets: [{ upToCents: null, rate: 0.10 }] },
  { code: 'NT', name: 'Northwest Territories', verified: false, bpaCents: FEDERAL_BPA_CENTS, brackets: [{ upToCents: null, rate: 0.10 }] },
  { code: 'NU', name: 'Nunavut', verified: false, bpaCents: FEDERAL_BPA_CENTS, brackets: [{ upToCents: null, rate: 0.10 }] },
]

export function getProvince(code: string) {
  return PROVINCES.find((p) => p.code === code) ?? PROVINCES[0]
}

function taxFromBrackets(annualIncomeCents: number, brackets: { upToCents: number | null; rate: number }[]): number {
  let tax = 0
  let lower = 0
  for (const b of brackets) {
    const upper = b.upToCents ?? Infinity
    if (annualIncomeCents > lower) {
      tax += (Math.min(annualIncomeCents, upper) - lower) * b.rate
    }
    lower = upper
    if (annualIncomeCents <= upper) break
  }
  return tax
}

export type PayFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly'
export const PAY_PERIODS_PER_YEAR: Record<PayFrequency, number> = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 }

export type DeductionBreakdown = {
  cppCents: number
  cpp2Cents: number
  eiCents: number
  federalTaxCents: number
  provincialTaxCents: number
  totalDeductionsCents: number
  netPayCents: number
  pensionableThisPeriodCents: number
  insurableThisPeriodCents: number
}

// Standard annualized-bracket estimate: annualize this period's gross pay,
// compute annual CPP/CPP2/EI/federal/provincial tax, subtract the BPA
// credit at each level's lowest rate, then divide back down to one pay
// period. ytdPensionableCents/ytdInsurableCents let CPP/EI correctly stop
// once the year's maximum has already been reached from prior paystubs.
export function calculatePayDeductions(opts: {
  grossPayCents: number
  frequency: PayFrequency
  provinceCode: string
  ytdPensionableCents: number
  ytdInsurableCents: number
  federalClaimAmountCents?: number
  provincialClaimAmountCents?: number
}): DeductionBreakdown {
  const periods = PAY_PERIODS_PER_YEAR[opts.frequency]
  const province = getProvince(opts.provinceCode)

  const exemptionPerPeriod = CPP.basicExemptionCents / periods
  const pensionableThisPeriod = Math.max(opts.grossPayCents - exemptionPerPeriod, 0)
  const remainingYmpe = Math.max(CPP.ympeCents - opts.ytdPensionableCents, 0)
  const cppPensionable = Math.min(pensionableThisPeriod, remainingYmpe)
  const cppCents = Math.round(cppPensionable * CPP.rate)

  const remainingYampe = Math.max(CPP2.yampeCents - Math.max(opts.ytdPensionableCents, CPP.ympeCents), 0)
  const cpp2Pensionable = Math.max(Math.min(opts.grossPayCents, remainingYampe), 0)
  const cpp2Cents = opts.ytdPensionableCents >= CPP.ympeCents ? Math.round(cpp2Pensionable * CPP2.rate) : 0

  const remainingInsurable = Math.max(EI.maxInsurableCents - opts.ytdInsurableCents, 0)
  const eiInsurable = Math.min(opts.grossPayCents, remainingInsurable)
  const eiCents = Math.round(eiInsurable * EI.rate)

  const annualIncome = opts.grossPayCents * periods
  const federalClaim = opts.federalClaimAmountCents ?? FEDERAL_BPA_CENTS
  const provincialClaim = opts.provincialClaimAmountCents ?? province.bpaCents

  const annualFederalTax = Math.max(taxFromBrackets(annualIncome, FEDERAL_BRACKETS) - federalClaim * FEDERAL_BRACKETS[0].rate, 0)
  const annualProvincialTax = Math.max(taxFromBrackets(annualIncome, province.brackets) - provincialClaim * province.brackets[0].rate, 0)

  const federalTaxCents = Math.round(annualFederalTax / periods)
  const provincialTaxCents = Math.round(annualProvincialTax / periods)

  const totalDeductionsCents = cppCents + cpp2Cents + eiCents + federalTaxCents + provincialTaxCents
  return {
    cppCents, cpp2Cents, eiCents, federalTaxCents, provincialTaxCents,
    totalDeductionsCents,
    netPayCents: opts.grossPayCents - totalDeductionsCents,
    pensionableThisPeriodCents: Math.round(pensionableThisPeriod),
    insurableThisPeriodCents: Math.round(eiInsurable),
  }
}
