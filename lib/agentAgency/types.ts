// Shared types for the AI Agent Agency framework (lib/agentAgency/) — a
// reusable, general-purpose multi-agent harness (Router -> Specialist ->
// Critic -> Delivery) installed for future BARIO projects to reach for,
// not wired into any specific existing feature yet. Victoria/Amber/the CRM
// copilots are purpose-built for their own product surfaces and don't need
// this; this is for a future "take on an arbitrary task" use case.

export const SPECIALISTS = [
  'research',
  'writer',
  'coder',
  'data_analyst',
  'designer',
  'marketer',
  'sales',
  'support',
  'ops_automation',
  'legal_review',
  'finance',
  'recruiter',
  'project_manager',
] as const

export type Specialist = (typeof SPECIALISTS)[number]

export type RouterResult = {
  intent: string
  specialist: Specialist
  complexity: 'trivial' | 'standard' | 'complex'
  needsTools: string[]
  clarifyingQuestions: string[]
  routeToHuman: boolean
}

export type CriticVerdict = 'SHIP' | 'REVISE' | 'REJECT'

export type CriticResult = {
  verdict: CriticVerdict
  blockers: string[]
  improvements: string[]
  scores: { coverage: number; accuracy: number; clarity: number; completeness: number; safety: number }
}

export type AgencyRunResult = {
  routing: RouterResult
  specialistOutput: string
  critique: CriticResult
  revisions: number
  finalDelivery: string
}

// Real model-tier mapping (per the prompt pack's own recommendation:
// cheap for Router, mid for most Specialists, high-tier reasoning for
// Orchestrator/Critic and for Engineer/Finance/Research specialists) —
// mapped onto Claude's actual model lineup rather than left abstract.
export const AGENCY_MODELS = {
  router: 'claude-haiku-4-5',
  specialistDefault: 'claude-sonnet-5',
  specialistHighTier: 'claude-opus-5', // coder, finance, research
  critic: 'claude-opus-5',
  delivery: 'claude-sonnet-5',
} as const

export const HIGH_TIER_SPECIALISTS: Specialist[] = ['coder', 'finance', 'research']
