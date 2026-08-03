// Retail markup applied on top of Namecheap's wholesale price. Placeholder
// business decision, not final — 40% margin rounded up to a clean .99 price
// point (e.g. $14.18 wholesale -> $19.99 retail for a .com), matching how
// major registrars price a base TLD. Adjust MARKUP_MULTIPLIER (or replace
// this whole function with a per-TLD price table) once real pricing is
// decided — nothing else in the purchase flow needs to change to update it.
const MARKUP_MULTIPLIER = 1.4

export function retailPrice(wholesalePrice: number): number {
  const marked = wholesalePrice * MARKUP_MULTIPLIER
  return Math.ceil(marked) - 0.01
}
