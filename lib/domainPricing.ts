// Retail markup applied on top of the registrar's wholesale price
// (ResellerClub as of 2026-08-12 — see lib/registrar.ts). Placeholder
// business decision, not final — 40% margin rounded up to a clean .99 price
// point (e.g. $22.56 CAD wholesale -> $31.99 CAD retail for a .com), matching
// how major registrars price a base TLD. Adjust MARKUP_MULTIPLIER (or replace
// this whole function with a per-TLD price table) once real pricing is
// decided — nothing else in the purchase flow needs to change to update it.
const MARKUP_MULTIPLIER = 1.4

export function retailPrice(wholesalePrice: number): number {
  const marked = wholesalePrice * MARKUP_MULTIPLIER
  return Math.ceil(marked) - 0.01
}
