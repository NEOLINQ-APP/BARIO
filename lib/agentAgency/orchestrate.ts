import Anthropic from '@anthropic-ai/sdk'
import {
  GLOBAL_PREAMBLE,
  ROUTER_PROMPT,
  ROUTER_TOOL,
  CRITIC_PROMPT,
  CRITIC_TOOL,
  DELIVERY_PROMPT,
  SPECIALIST_PROMPTS,
  TOOL_USE_CONTRACT,
} from './prompts'
import { AGENCY_MODELS, HIGH_TIER_SPECIALISTS, type AgencyRunResult, type CriticResult, type RouterResult, type Specialist } from './types'

// Real, runnable Router -> Specialist -> Critic (revise loop, max 2) ->
// Delivery harness — installed as reusable infrastructure for a future
// BARIO project that needs to hand an arbitrary task to a specialist AI
// with a review pass, not wired into any specific existing product surface
// (Victoria/Amber/etc. are purpose-built for their own surfaces already).

const MAX_REVISIONS = 2

let _client: Anthropic | undefined
function client(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _client
}

async function route(task: string): Promise<RouterResult> {
  const response = await client().messages.create({
    model: AGENCY_MODELS.router,
    max_tokens: 500,
    system: ROUTER_PROMPT,
    messages: [{ role: 'user', content: task }],
    tools: [ROUTER_TOOL],
    tool_choice: { type: 'tool', name: 'classify_request' },
  })
  const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
  const input = toolUse?.input as any
  return {
    intent: input?.intent ?? 'unknown',
    specialist: (input?.specialist ?? 'writer') as Specialist,
    complexity: input?.complexity ?? 'standard',
    needsTools: input?.needsTools ?? [],
    clarifyingQuestions: input?.clarifyingQuestions ?? [],
    routeToHuman: !!input?.routeToHuman,
  }
}

async function runSpecialist(specialist: Specialist, task: string, priorAttempt?: string, blockers?: string[]): Promise<string> {
  const model = HIGH_TIER_SPECIALISTS.includes(specialist) ? AGENCY_MODELS.specialistHighTier : AGENCY_MODELS.specialistDefault
  const system = `${GLOBAL_PREAMBLE(15, 20, 'no hard deadline')}\n\n${SPECIALIST_PROMPTS[specialist]}\n\n${TOOL_USE_CONTRACT}`

  const userContent =
    priorAttempt && blockers?.length
      ? `Original task: ${task}\n\nYour previous attempt:\n${priorAttempt}\n\nThe Critic found these blockers — fix them and resubmit the full deliverable:\n${blockers.map((b) => `- ${b}`).join('\n')}`
      : task

  const response = await client().messages.create({
    model,
    max_tokens: 4000,
    system,
    messages: [{ role: 'user', content: userContent }],
  })
  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
  return textBlock?.text ?? ''
}

async function critique(task: string, deliverable: string): Promise<CriticResult> {
  const response = await client().messages.create({
    model: AGENCY_MODELS.critic,
    max_tokens: 1500,
    system: CRITIC_PROMPT,
    messages: [{ role: 'user', content: `Original task:\n${task}\n\nDeliverable to review:\n${deliverable}` }],
    tools: [CRITIC_TOOL],
    tool_choice: { type: 'tool', name: 'submit_critique' },
  })
  const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
  const input = toolUse?.input as any
  return {
    verdict: input?.verdict ?? 'REVISE',
    blockers: input?.blockers ?? [],
    improvements: input?.improvements ?? [],
    scores: input?.scores ?? { coverage: 0, accuracy: 0, clarity: 0, completeness: 0, safety: 0 },
  }
}

async function deliver(task: string, approvedDeliverable: string): Promise<string> {
  const response = await client().messages.create({
    model: AGENCY_MODELS.delivery,
    max_tokens: 3000,
    system: DELIVERY_PROMPT,
    messages: [{ role: 'user', content: `Original task:\n${task}\n\nApproved deliverable:\n${approvedDeliverable}` }],
  })
  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
  return textBlock?.text ?? approvedDeliverable
}

export async function runAgencyTask(task: string): Promise<AgencyRunResult> {
  const routing = await route(task)

  if (routing.routeToHuman) {
    return {
      routing,
      specialistOutput: '',
      critique: { verdict: 'REJECT', blockers: ['Routed to human — out of scope for autonomous handling.'], improvements: [], scores: { coverage: 0, accuracy: 0, clarity: 0, completeness: 0, safety: 0 } },
      revisions: 0,
      finalDelivery: `This task was flagged for human handling rather than autonomous agents: ${routing.intent}. Reason: involves liability, irreversible spend, or a decision serious enough to need a person.`,
    }
  }

  let output = await runSpecialist(routing.specialist, task)
  let review = await critique(task, output)
  let revisions = 0

  while (review.verdict === 'REVISE' && revisions < MAX_REVISIONS) {
    output = await runSpecialist(routing.specialist, task, output, review.blockers)
    review = await critique(task, output)
    revisions++
  }

  const finalDelivery = review.verdict === 'REJECT' ? `Rejected after ${revisions} revision(s): ${review.blockers.join('; ')}` : await deliver(task, output)

  return { routing, specialistOutput: output, critique: review, revisions, finalDelivery }
}
