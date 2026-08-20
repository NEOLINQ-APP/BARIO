import { getSetting, setSetting } from '@/lib/platformSettings'

// Configurable lead-score weights (spec: "Make the scoring engine
// configurable. Do not hard-code these weights into the frontend.") —
// stored as one JSON blob under platform_settings, editable via
// getLeadScoreWeights()/setLeadScoreWeights() without a redeploy. Defaults
// below mirror the 100-point model from the original spec (FIT 40 / NEED 20
// / INTENT 20 / TIMING 10 / DATA QUALITY 10).
export type LeadScoreWeights = {
  fit: {
    locationMatch: number
    serviceMatch: number
    customerTypeMatch: number
    businessIcpMatch: number
    providerCapacity: number
  }
  need: {
    strongNeed: number
    problemIdentified: number
    goalIdentified: number
  }
  intent: {
    quoteRequested: number
    appointmentRequested: number
    readyToPurchase: number
    emergencyUrgency: number
  }
  timing: {
    today: number
    thisWeek: number
    thisMonth: number
    oneToThreeMonths: number
    future: number
  }
  dataQuality: {
    validPhone: number
    validEmail: number
    location: number
    need: number
    source: number
  }
}

export const DEFAULT_LEAD_SCORE_WEIGHTS: LeadScoreWeights = {
  fit: { locationMatch: 10, serviceMatch: 10, customerTypeMatch: 5, businessIcpMatch: 10, providerCapacity: 5 },
  need: { strongNeed: 10, problemIdentified: 5, goalIdentified: 5 },
  intent: { quoteRequested: 5, appointmentRequested: 5, readyToPurchase: 5, emergencyUrgency: 5 },
  timing: { today: 10, thisWeek: 7, thisMonth: 5, oneToThreeMonths: 3, future: 1 },
  dataQuality: { validPhone: 3, validEmail: 2, location: 2, need: 2, source: 1 },
}

const SETTING_KEY = 'lead_score_weights'

export async function getLeadScoreWeights(sql: any): Promise<LeadScoreWeights> {
  const raw = await getSetting(sql, SETTING_KEY)
  if (!raw) return DEFAULT_LEAD_SCORE_WEIGHTS
  try {
    // Shallow-merge over the default so a partially-saved config (e.g. an
    // older version missing a newly-added weight) never produces an
    // undefined weight mid-calculation.
    const parsed = JSON.parse(raw)
    return {
      fit: { ...DEFAULT_LEAD_SCORE_WEIGHTS.fit, ...parsed.fit },
      need: { ...DEFAULT_LEAD_SCORE_WEIGHTS.need, ...parsed.need },
      intent: { ...DEFAULT_LEAD_SCORE_WEIGHTS.intent, ...parsed.intent },
      timing: { ...DEFAULT_LEAD_SCORE_WEIGHTS.timing, ...parsed.timing },
      dataQuality: { ...DEFAULT_LEAD_SCORE_WEIGHTS.dataQuality, ...parsed.dataQuality },
    }
  } catch {
    return DEFAULT_LEAD_SCORE_WEIGHTS
  }
}

export async function setLeadScoreWeights(sql: any, weights: LeadScoreWeights): Promise<void> {
  await setSetting(sql, SETTING_KEY, JSON.stringify(weights))
}
