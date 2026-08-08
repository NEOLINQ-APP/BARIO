// 2026 Canadian payroll tax tables — real, sourced rates, NOT reconstructed
// from memory. This file exists so the numbers are in exactly one place,
// dated and cited, and can be updated as a single annual change when 2027
// figures are published (every one of these thresholds/rates changes
// every year via federal/provincial indexation).
//
// IMPORTANT — read before trusting this for a real remittance: this
// implements the standard published bracket-and-credit method (the same
// arithmetic CRA's own T4127 formulas produce), but it is NOT CRA-
// certified payroll software. Real payroll providers go through a
// certification process for exact compliance (rounding conventions, mid-
// year rate changes, etc.). Treat this as a real, working estimate — good
// enough to run a business's payroll day to day — and have a bookkeeper/
// accountant verify before relying on it for CRA/Revenu Québec remittances
// or year-end T4/RL-1 filing.
//
// Sources (fetched live, 2026-08-08):
// - CPP/CPP2: multiple corroborating sources (Canadian Money Help, CPB
//   Canada, C-B-A.ca) citing CRA's 2026 maximum pensionable earnings
//   announcement — YMPE $74,600 (up from $71,300 in 2025), consistent
//   with CRA's known annual escalation.
// - EI: Canada.ca / ESDC news release "Canada Employment Insurance
//   Commission sets the 2026 Employment Insurance premium rate" — the
//   single most authoritative source used in this file.
// - QPP/QPIP: Revenu Québec + Retraite Québec + canada.ca 2026 QPIP
//   rates/multiples page.
// - Federal + all 5 non-Quebec provincial brackets/BPAs: TaxTips.ca's 2026
//   tax rate pages (a well-established, frequently-cited Canadian tax
//   reference site), cross-checked against Alberta.ca's own indexation
//   bill reference for Alberta specifically.
// - Quebec's own provincial brackets/BPA: TaxTips.ca, which itself flags
//   these as PROJECTED (not yet officially confirmed by Quebec's Ministry
//   of Finance at fetch time) — flagged here for the same reason, not
//   hidden.

export type TaxBracket = { upTo: number | null; rate: number } // upTo: null = no ceiling

export const FEDERAL_2026 = {
  brackets: [
    { upTo: 58523, rate: 0.14 },
    { upTo: 117045, rate: 0.205 },
    { upTo: 181440, rate: 0.26 },
    { upTo: 258482, rate: 0.2929 },
    { upTo: null, rate: 0.33 },
  ] as TaxBracket[],
  // Using the maximum BPA ($16,452, income <= $181,440) rather than
  // modelling its phase-out above that threshold — a real simplification
  // for very high earners, flagged rather than silently wrong.
  basicPersonalAmount: 16452,
}

export type ProvinceKey = 'AB' | 'BC' | 'ON' | 'SK' | 'MB' | 'QC'

export const PROVINCIAL_2026: Record<ProvinceKey, { brackets: TaxBracket[]; basicPersonalAmount: number; surtax?: { thresholds: { upTo: number; rate: number }[] } }> = {
  AB: {
    brackets: [
      { upTo: 61200, rate: 0.08 },
      { upTo: 154259, rate: 0.10 },
      { upTo: 185111, rate: 0.12 },
      { upTo: 246813, rate: 0.13 },
      { upTo: 370220, rate: 0.14 },
      { upTo: null, rate: 0.15 },
    ],
    basicPersonalAmount: 22769,
  },
  BC: {
    brackets: [
      { upTo: 50363, rate: 0.056 },
      { upTo: 100728, rate: 0.077 },
      { upTo: 115648, rate: 0.105 },
      { upTo: 140430, rate: 0.1229 },
      { upTo: 190405, rate: 0.147 },
      { upTo: 265545, rate: 0.168 },
      { upTo: null, rate: 0.205 },
    ],
    basicPersonalAmount: 13216,
  },
  ON: {
    brackets: [
      { upTo: 53891, rate: 0.0505 },
      { upTo: 107785, rate: 0.0915 },
      { upTo: 150000, rate: 0.1116 },
      { upTo: 220000, rate: 0.1216 },
      { upTo: null, rate: 0.1316 },
    ],
    basicPersonalAmount: 12989,
    // Ontario surtax: applied on top of provincial tax itself (a tax on
    // tax), not on income — 20% of provincial tax over $5,818, PLUS an
    // additional 36% of provincial tax over $7,446 (the two are additive
    // once both thresholds are crossed).
    surtax: { thresholds: [{ upTo: 5818, rate: 0.20 }, { upTo: 7446, rate: 0.36 }] },
  },
  SK: {
    brackets: [
      { upTo: 54532, rate: 0.105 },
      { upTo: 155805, rate: 0.125 },
      { upTo: null, rate: 0.145 },
    ],
    basicPersonalAmount: 20381,
  },
  MB: {
    brackets: [
      { upTo: 47000, rate: 0.108 },
      { upTo: 100000, rate: 0.1275 },
      { upTo: null, rate: 0.174 },
    ],
    basicPersonalAmount: 15780,
  },
  QC: {
    brackets: [
      { upTo: 54345, rate: 0.14 },
      { upTo: 108680, rate: 0.19 },
      { upTo: 132245, rate: 0.24 },
      { upTo: null, rate: 0.2575 },
    ],
    basicPersonalAmount: 18952,
  },
}

// Quebec residents' federal tax is reduced by this abatement (Quebec runs
// its own full provincial tax system instead of using the federal
// collection agreement other provinces use) — applied to federal tax
// AFTER the BPA credit, per TaxTips.ca's own documented methodology.
export const QUEBEC_FEDERAL_ABATEMENT_RATE = 0.165

export const CPP_2026 = {
  basicExemption: 3500,
  ympe: 74600, // Year's Maximum Pensionable Earnings
  rate: 0.0595, // CPP1, applies between basicExemption and ympe
  maxContribution: 4230.45,
  yampe: 85000, // Year's Additional Maximum Pensionable Earnings
  rate2: 0.04, // CPP2, applies between ympe and yampe, no exemption
  maxContribution2: 416,
}

export const EI_2026 = {
  maxInsurableEarnings: 68900,
  rate: 0.0163, // employee rate, non-Quebec
  maxContribution: 1123.07,
}

// Quebec Pension Plan replaces CPP for Quebec employees. Structured the
// same way as CPP (base + additional tier over the same YMPE/YAMPE), just
// a fractionally higher combined rate on the base tier.
export const QPP_2026 = {
  basicExemption: 3500,
  ympe: 74600,
  rate: 0.063, // 5.3% base + 1% additional, combined employee rate
  maxContribution: 4479.8, // (74600-3500) * 0.063, rounded to cents below
  yampe: 85000,
  rate2: 0.04,
  maxContribution2: 416,
}

// Quebec employees pay a reduced EI rate (QPIP covers parental leave
// instead) plus QPIP itself, rather than the full non-Quebec EI rate.
export const EI_QUEBEC_2026 = {
  maxInsurableEarnings: 68900,
  rate: 0.013,
  maxContribution: 895.70,
}

export const QPIP_2026 = {
  maxInsurableEarnings: 103000,
  rate: 0.00430,
}
