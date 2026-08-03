// Real, sourced pricing — not estimates picked out of the air.
//
// Claude Sonnet 5: $2.00/1M input, $10.00/1M output tokens — this is the
// intro rate in effect through 2026-08-31; standard rate after that is
// $3.00/$15.00. Update SONNET5_INPUT_PER_TOKEN/OUTPUT_PER_TOKEN once that
// date passes.
//
// Twilio: ConversationRelay is $0.07/min; underlying Canadian inbound
// voice minutes are ~$0.01/min — Victoria's numbers are all Canadian, so
// $0.08/min covers both. This is calculated from the real call duration
// logged here, not pulled from Twilio's own billing API, so treat it as a
// close calculation rather than a penny-for-penny reconciliation against
// your actual Twilio invoice.
const SONNET5_INPUT_PER_TOKEN = 2.0 / 1_000_000
const SONNET5_OUTPUT_PER_TOKEN = 10.0 / 1_000_000
const TWILIO_PER_MINUTE_CAD_DOLLARS = 0.08

export function computeClaudeCostCents(inputTokens: number, outputTokens: number): number {
  const dollars = inputTokens * SONNET5_INPUT_PER_TOKEN + outputTokens * SONNET5_OUTPUT_PER_TOKEN
  return Math.round(dollars * 100 * 100) / 100 // cents, kept to 2 decimal places of a cent for tiny per-call amounts
}

export function computeTwilioCostCents(durationSeconds: number): number {
  const minutes = durationSeconds / 60
  return Math.round(minutes * TWILIO_PER_MINUTE_CAD_DOLLARS * 100 * 100) / 100
}
