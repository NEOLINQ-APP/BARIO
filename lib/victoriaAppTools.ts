import { randomUUID } from 'node:crypto'
import type Anthropic from '@anthropic-ai/sdk'
import { getFullCatalog } from '@/lib/invoiceCatalog'
import { computeTotals } from '@/lib/invoices'
import { generateImage, type ImagePurpose } from '@/lib/imageGen'
import { generateDrafts } from '@/lib/marketing/generate'
import { sendEmail } from '@/lib/email'
import { placeMikoOutboundCall, sendSms } from '@/lib/twilio'
import { ALL_PLATFORMS } from '@/lib/marketing/platforms'
import { runAgencyTask } from '@/lib/agentAgency/orchestrate'
import { researchLeads, addLeadsToOrg } from '@/lib/barioOneAssistantTools'
import type { MarketingPlatform } from '@/lib/db'

// House-account orgs Victoria is allowed to generate leads for on Sherwin's
// instruction -- deliberately just these two, not any Bario One customer
// org. The generate-leads admin route this mirrors (app/api/admin/
// bario-one/organizations/[id]/generate-leads) exists specifically to
// bypass paying customers' own LEAD_GEN_LIVE kill switch/quota for Bario's
// own house accounts; using it for a customer org here would circumvent
// protections built for their benefit, not Sherwin's.
const LEAD_GEN_ORG_SLUGS: Record<string, string> = { bario: 'bario-ca', unique: 'unique-group-inc' }

function isValidPhoneNumber(v: unknown): v is string {
  return typeof v === 'string' && /^\+?[0-9]{7,15}$/.test(v.trim())
}

// Same real number lib/victoriaFamilyTools.ts's alert_dad tool texts —
// Sherwin's own cell, the default target for schedule_reminder when he
// doesn't give a specific number (a wake-up call/reminder is normally for
// himself).
const SHERWIN_OWN_NUMBER = '+17802410880'

// Victoria's tool set for the assistant app (app/api/victoria/app/chat) —
// Sherwin's own single-operator work tool, texting/talking to Victoria to
// get real things done. Mirrors the risk-tiering already established
// elsewhere in this codebase: read tools execute immediately; anything
// financial (invoices) only ever proposes into invoice_change_requests
// (agent_name:'victoria_app', same table/approval flow Amber uses — see
// lib/amberTools.ts, which this deliberately does NOT import from since the
// two assistants serve different callers, but the underlying data/approval
// path is intentionally identical); social posts insert as a 'draft' row
// into marketing_posts, same as the existing admin marketing flow — still
// requires the existing, unmodified /admin/marketing Approve click to
// actually go live. Email is the one new capability (lib/email.ts's new
// generic sendEmail) — split into draft_email/send_email as two separate
// tools rather than one tool with a confirm flag, so a real send can only
// ever happen via a distinct tool call the system prompt gates on Sherwin's
// next actual message saying to go ahead.

export const VICTORIA_APP_TOOLS: Anthropic.Tool[] = [
  {
    name: 'search_invoices',
    description: 'Search existing quotes/invoices by client name, invoice number, or status.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Client name, invoice number, or status (draft/sent/paid/void) to search for' } },
      required: ['query'],
    },
  },
  {
    name: 'get_invoice',
    description: 'Get full details (line items, totals) for one invoice by its number (e.g. INV-1000) or id.',
    input_schema: {
      type: 'object',
      properties: { numberOrId: { type: 'string' } },
      required: ['numberOrId'],
    },
  },
  {
    name: 'get_product_catalog',
    description: 'List real Bario products and current prices (hosting plans, VPS tiers, X-Drive storage, templates) to use as invoice line items.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'propose_new_invoice',
    description: "Propose creating a new quote/invoice. This does NOT create it — it submits the proposal for approval, applied the moment it's approved in /admin/invoices.",
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['invoice', 'quote'] },
        clientName: { type: 'string' },
        clientEmail: { type: 'string' },
        clientPhone: { type: 'string' },
        currency: { type: 'string', description: 'Defaults to CAD' },
        taxPercent: { type: 'number' },
        discountType: { type: 'string', enum: ['none', 'percent', 'fixed'] },
        discountValue: { type: 'number', description: 'Percent (0-100) if discountType is percent, cents if fixed' },
        notes: { type: 'string' },
        lineItems: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              description: { type: 'string' },
              quantity: { type: 'number' },
              unitPriceCents: { type: 'number' },
            },
            required: ['description', 'quantity', 'unitPriceCents'],
          },
        },
      },
      required: ['clientName', 'lineItems'],
    },
  },
  {
    name: 'propose_invoice_update',
    description: 'Propose a change to an existing invoice/quote (price, line items, discount, client info, etc). This does NOT apply the change — it submits it for approval.',
    input_schema: {
      type: 'object',
      properties: {
        numberOrId: { type: 'string' },
        summary: { type: 'string', description: 'One-sentence plain-language description of what is changing and why' },
        changes: { type: 'object', description: 'Only the fields being changed — same shape as propose_new_invoice minus type/lineItems requirement' },
      },
      required: ['numberOrId', 'summary', 'changes'],
    },
  },
  {
    name: 'generate_image',
    description: 'Generate a real image (logo, icon, avatar, or general graphic) from a text description. Returns a URL to the generated image, saved to X-Drive.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Detailed description of the image to generate' },
        purpose: { type: 'string', enum: ['logo', 'icon', 'avatar', 'general'] },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'draft_social_post',
    description: 'Draft a social media post for one or more platforms (twitter, facebook, instagram, linkedin, google_business). This only creates a DRAFT — it still needs a manual Approve in /admin/marketing before it actually posts live.',
    input_schema: {
      type: 'object',
      properties: {
        platforms: { type: 'array', items: { type: 'string', enum: ALL_PLATFORMS as unknown as string[] } },
        topic: { type: 'string', description: 'What the post should be about' },
      },
      required: ['platforms', 'topic'],
    },
  },
  {
    name: 'draft_email',
    description: "Draft an email (to/subject/body) and show it back for confirmation. This does NOT send anything — it's a preview only. Only call send_email after the user's next message explicitly confirms sending it.",
    input_schema: {
      type: 'object',
      properties: {
        to: { type: 'string' },
        subject: { type: 'string' },
        body: { type: 'string', description: 'Plain text body — will be converted to simple HTML paragraphs' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'make_call',
    description: "Have Victoria place a real outbound phone call, right now, from her own number, to any phone number Sherwin gives her — in chat or on the phone. She'll speak live to whoever answers. Executes immediately, no confirmation needed — only call this once Sherwin has actually asked her to call the number.",
    input_schema: {
      type: 'object',
      properties: {
        toNumber: { type: 'string', description: 'Phone number to call, e.g. +17801234567' },
        jobContext: { type: 'string', description: "Why she's calling and what she should say/accomplish — she'll use this to guide the conversation with whoever answers." },
      },
      required: ['toNumber', 'jobContext'],
    },
  },
  {
    name: 'send_text',
    description: 'Send a real SMS text message, right now, from Victoria\'s own number, to any phone number Sherwin gives her. Executes immediately, no confirmation needed — only call this once Sherwin has actually asked her to send it.',
    input_schema: {
      type: 'object',
      properties: {
        toNumber: { type: 'string', description: 'Phone number to text, e.g. +17801234567' },
        body: { type: 'string', description: 'The exact text message content to send' },
      },
      required: ['toNumber', 'body'],
    },
  },
  {
    name: 'schedule_reminder',
    description: "Schedule a real call or text for a FUTURE time — a wake-up call, a reminder call, a scheduled text. Unlike make_call/send_text (immediate only), this doesn't run now; a background check every few minutes fires it once the time arrives. runAt must be a real, absolute ISO 8601 datetime you've resolved from whatever he said (\"tomorrow at 7am\", \"in 20 minutes\") using the current date/time you were given — never pass a relative phrase.",
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['call', 'text'] },
        toNumber: { type: 'string', description: "Phone number to call/text, e.g. +17801234567. Omit to default to Sherwin's own number." },
        message: { type: 'string', description: 'For a text: the exact message to send. For a call: what Victoria should say/accomplish when she calls.' },
        runAt: { type: 'string', description: 'Absolute ISO 8601 datetime, e.g. "2026-08-21T07:00:00-06:00"' },
      },
      required: ['type', 'message', 'runAt'],
    },
  },
  {
    name: 'send_email',
    description: 'Actually send a real email. Only call this after the user has explicitly confirmed sending a drafted email in their own message — never on the same turn a draft was first shown.',
    input_schema: {
      type: 'object',
      properties: {
        to: { type: 'string' },
        subject: { type: 'string' },
        body: { type: 'string', description: 'Plain text body — will be converted to simple HTML paragraphs' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'generate_leads',
    description: "Research real, live leads and add them straight into one of Bario's own house-account CRMs (Bario.ca's own, or Unique Group Inc.'s) — real AI-powered web search, not made up. Only for Bario's own two house accounts, not any paying customer's CRM. Give a specific, real search query (e.g. \"small construction companies in Edmonton without a website\") and how many to find.",
    input_schema: {
      type: 'object',
      properties: {
        organization: { type: 'string', enum: ['bario', 'unique'], description: "'bario' for Bario.ca's own CRM, 'unique' for Unique Group Inc.'s" },
        query: { type: 'string' },
        count: { type: 'number', description: 'How many leads to find, default 5, max 10' },
      },
      required: ['organization', 'query'],
    },
  },
  {
    name: 'queue_coding_task',
    description:
      "Queue a real coding/engineering task for Claude to do on the BARIO codebase — fixing a bug, adding a feature, changing a page, etc. This does NOT do the work now: an hourly automated pass picks up queued tasks, does the real work, commits it (does not auto-deploy to production), and reports back as new messages in this same chat once it's done or has an update. Tell Sherwin it's queued and roughly when to expect the first update (next hourly pass), not that it's done. Only call this for genuine coding work — not for things Victoria can already do herself (invoices, email, calls, texts, images, social drafts).",
    input_schema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'A clear, specific, self-contained description of the coding task — Claude will see only this text, with no other context from this conversation.' },
      },
      required: ['task'],
    },
  },
  {
    name: 'dispatch_business_task',
    description:
      "Hand off a non-coding business task (research, drafting, analysis, planning — anything that isn't invoicing/email/calls/texts/images/social, which Victoria already does directly) to Bario's Router->Specialist->Critic->Delivery AI agency for a more thorough, reviewed answer than a quick chat reply. Runs synchronously and can take up to a minute or two — let Sherwin know it's working on it. Use for substantial asks, not quick questions Victoria can just answer herself.",
    input_schema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'A clear, specific, self-contained description of the task — the agency will see only this text.' },
      },
      required: ['task'],
    },
  },
]

async function resolveInvoice(sql: any, numberOrId: string) {
  const rows = (await sql`SELECT * FROM invoices WHERE number = ${numberOrId} OR id = ${numberOrId}`) as unknown as any[]
  return rows[0] ?? null
}

function bodyToHtml(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((para) => `<p>${para.replace(/\n/g, '<br/>')}</p>`)
    .join('\n')
}

export async function executeVictoriaAppTool(sql: any, userId: string, name: string, args: any): Promise<unknown> {
  switch (name) {
    case 'search_invoices': {
      const q = `%${String(args.query ?? '').trim()}%`
      const rows = await sql`
        SELECT number, type, status, client_name, currency FROM invoices
        WHERE client_name ILIKE ${q} OR number ILIKE ${q} OR status ILIKE ${q}
        ORDER BY created_at DESC LIMIT 15
      `
      return { results: rows }
    }
    case 'get_invoice': {
      const invoice = await resolveInvoice(sql, args.numberOrId)
      if (!invoice) return { error: 'Not found' }
      const lineItems = (await sql`SELECT description, quantity, unit_price_cents FROM invoice_line_items WHERE invoice_id = ${invoice.id} ORDER BY sort_order`) as unknown as any[]
      const totals = computeTotals(
        lineItems.map((li) => ({ description: li.description, quantity: Number(li.quantity), unitPriceCents: li.unit_price_cents })),
        Number(invoice.tax_percent),
        { type: invoice.discount_type, value: Number(invoice.discount_value) }
      )
      return { invoice, lineItems, totals }
    }
    case 'get_product_catalog': {
      const catalog = await getFullCatalog(sql)
      return { catalog }
    }
    case 'propose_new_invoice': {
      const id = randomUUID()
      const summary = `New ${args.type === 'quote' ? 'quote' : 'invoice'} for ${args.clientName} — ${(args.lineItems ?? []).length} line item(s)`
      await sql`
        INSERT INTO invoice_change_requests (id, invoice_id, agent_name, change_type, summary, payload_json, status)
        VALUES (${id}, NULL, 'victoria_app', 'create', ${summary}, ${JSON.stringify(args)}, 'pending')
      `
      return { ok: true, changeRequestId: id, message: 'Submitted for approval in /admin/invoices — not yet created.' }
    }
    case 'propose_invoice_update': {
      const invoice = await resolveInvoice(sql, args.numberOrId)
      if (!invoice) return { error: 'Not found' }
      const id = randomUUID()
      await sql`
        INSERT INTO invoice_change_requests (id, invoice_id, agent_name, change_type, summary, payload_json, status)
        VALUES (${id}, ${invoice.id}, 'victoria_app', 'update', ${args.summary}, ${JSON.stringify(args.changes)}, 'pending')
      `
      return { ok: true, changeRequestId: id, message: 'Submitted for approval in /admin/invoices — not yet applied.' }
    }
    case 'generate_image': {
      try {
        const result = await generateImage(sql, userId, String(args.prompt ?? ''), (args.purpose as ImagePurpose) ?? 'general')
        return { ok: true, url: result.url }
      } catch (err) {
        console.error('generate_image failed', err)
        return { error: 'Image generation failed — try again or rephrase the description.' }
      }
    }
    case 'draft_social_post': {
      const platforms = (Array.isArray(args.platforms) ? args.platforms : []).filter((p: string) => ALL_PLATFORMS.includes(p as MarketingPlatform))
      if (!platforms.length) return { error: 'No valid platforms given' }
      const drafts = await generateDrafts(platforms, String(args.topic ?? ''))
      if (!drafts.length) return { error: 'No drafts were generated — try again' }
      for (const draft of drafts) {
        await sql`
          INSERT INTO marketing_posts (id, platform, content, status, created_by)
          VALUES (${randomUUID()}, ${draft.platform}, ${draft.content}, 'draft', ${userId})
        `
      }
      return { ok: true, drafts, message: 'Saved as drafts — still needs a manual Approve in /admin/marketing to actually post live.' }
    }
    case 'draft_email': {
      return { to: args.to, subject: args.subject, body: args.body, note: 'This is a preview only — nothing has been sent.' }
    }
    case 'make_call': {
      const toNumber = String(args.toNumber ?? '').trim()
      if (!isValidPhoneNumber(toNumber)) return { error: 'Not a valid phone number — ask Sherwin to confirm it.' }
      try {
        const result = await placeMikoOutboundCall({ toNumber, jobContext: String(args.jobContext ?? 'A check-in call.') })
        return { ok: true, sid: result.sid, status: result.status }
      } catch (err) {
        console.error('make_call failed', err)
        return { error: 'Failed to place the call — tell Sherwin something went wrong.' }
      }
    }
    case 'send_text': {
      const toNumber = String(args.toNumber ?? '').trim()
      if (!isValidPhoneNumber(toNumber)) return { error: 'Not a valid phone number — ask Sherwin to confirm it.' }
      const body = String(args.body ?? '').trim()
      if (!body) return { error: 'No message body given.' }
      try {
        const result = await sendSms(toNumber, body)
        return { ok: true, sid: result.sid }
      } catch (err) {
        console.error('send_text failed', err)
        return { error: 'Failed to send the text — tell Sherwin something went wrong.' }
      }
    }
    case 'schedule_reminder': {
      const type = args.type === 'text' ? 'text' : 'call'
      const toNumber = String(args.toNumber ?? SHERWIN_OWN_NUMBER).trim()
      if (!isValidPhoneNumber(toNumber)) return { error: 'Not a valid phone number — ask Sherwin to confirm it.' }
      const message = String(args.message ?? '').trim()
      if (!message) return { error: 'No message/context given for the reminder.' }
      const runAt = new Date(String(args.runAt ?? ''))
      if (isNaN(runAt.getTime())) return { error: 'runAt was not a valid datetime — resolve it to a real ISO 8601 timestamp before calling this.' }
      if (runAt.getTime() <= Date.now()) return { error: 'That time has already passed — ask Sherwin for a future time.' }
      await sql`
        INSERT INTO victoria_scheduled_actions (id, user_id, action_type, to_number, message, run_at)
        VALUES (${randomUUID()}, ${userId}, ${type}, ${toNumber}, ${message}, ${runAt.toISOString()})
      `
      return { ok: true, scheduledFor: runAt.toISOString() }
    }
    case 'generate_leads': {
      const orgKey = String(args.organization ?? '').trim()
      const slug = LEAD_GEN_ORG_SLUGS[orgKey]
      if (!slug) return { error: "organization must be 'bario' or 'unique'." }
      const query = String(args.query ?? '').trim()
      if (!query) return { error: 'No search query given — ask Sherwin what kind of leads he wants.' }
      const count = Number.isFinite(args.count) ? Math.min(Math.max(Math.round(args.count), 1), 10) : 5
      try {
        const orgRows = (await sql`SELECT id, name FROM bo_organizations WHERE slug = ${slug}`) as unknown as { id: string; name: string }[]
        const org = orgRows[0]
        if (!org) return { error: `Could not find the ${orgKey} organization — tell Sherwin something's wrong on the CRM side.` }
        const leads = await researchLeads(query, count)
        if (leads.length === 0) return { error: 'Could not find any real leads matching that — try a broader or more specific search.' }
        const added = await addLeadsToOrg(sql, org.id, leads, org.name)
        return { ok: true, organization: org.name, addedCount: added.length, leads: added.map((a) => a.customer) }
      } catch (err) {
        console.error('generate_leads failed', err)
        return { error: 'Lead research failed — tell Sherwin something went wrong.' }
      }
    }
    case 'send_email': {
      try {
        await sendEmail(String(args.to ?? ''), String(args.subject ?? ''), bodyToHtml(String(args.body ?? '')))
        return { ok: true, message: 'Sent.' }
      } catch (err) {
        console.error('send_email failed', err)
        return { error: 'Failed to send — tell the user something went wrong.' }
      }
    }
    case 'queue_coding_task': {
      const task = String(args.task ?? '').trim()
      if (!task) return { error: 'No task description given.' }
      const id = randomUUID()
      await sql`
        INSERT INTO coding_task_requests (id, user_id, task, status)
        VALUES (${id}, ${userId}, ${task}, 'pending')
      `
      return { ok: true, taskId: id, message: 'Queued — picked up on the next hourly automated pass, not immediately.' }
    }
    case 'dispatch_business_task': {
      const task = String(args.task ?? '').trim()
      if (!task) return { error: 'No task description given.' }
      try {
        const result = await runAgencyTask(task)
        return { ok: true, delivery: result.finalDelivery, revisions: result.revisions }
      } catch (err) {
        console.error('dispatch_business_task failed', err)
        return { error: 'The agency run failed — tell Sherwin something went wrong and offer to try again.' }
      }
    }
    default:
      return { error: `Unknown tool: ${name}` }
  }
}
