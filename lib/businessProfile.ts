import type { BusinessProfileRow } from '@/lib/db'

export type EmployeeEntry = { name: string; role: string }
export type FaqEntry = { question: string; answer: string }

export type BusinessProfile = {
  id: string
  ownerUserId: string | null
  lookupKey: string | null
  name: string
  about: string
  services: string[]
  hours: string | null
  serviceArea: string[]
  employees: EmployeeEntry[]
  faq: FaqEntry[]
  policies: string | null
  pricingNotes: string | null
}

function safeJsonArray<T>(raw: string): T[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function parseBusinessProfile(row: BusinessProfileRow): BusinessProfile {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    lookupKey: row.lookup_key,
    name: row.name,
    about: row.about,
    services: safeJsonArray<string>(row.services_json),
    hours: row.hours,
    serviceArea: safeJsonArray<string>(row.service_area_json),
    employees: safeJsonArray<EmployeeEntry>(row.employees_json),
    faq: safeJsonArray<FaqEntry>(row.faq_json),
    policies: row.policies,
    pricingNotes: row.pricing_notes,
  }
}

export function emptyBusinessProfile(): Omit<BusinessProfile, 'id' | 'ownerUserId' | 'lookupKey'> {
  return { name: '', about: '', services: [], hours: null, serviceArea: [], employees: [], faq: [], policies: null, pricingNotes: null }
}
