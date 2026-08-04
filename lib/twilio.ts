// Mirrors lib/hetzner.ts's/lib/runpod.ts's structure — auth-header helper
// that throws early, one shared fetch wrapper, one exported function per
// operation. Twilio's REST API uses HTTP Basic Auth (Account SID as
// username, Auth Token as password), not a Bearer token.
const TWILIO_API = 'https://api.twilio.com/2010-04-01'

function accountSid(): string {
  const sid = process.env.TWILIO_ACCOUNT_SID
  if (!sid) throw new Error('TWILIO_ACCOUNT_SID is not set')
  return sid
}

function authHeader(): string {
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!token) throw new Error('TWILIO_AUTH_TOKEN is not set')
  return 'Basic ' + Buffer.from(`${accountSid()}:${token}`).toString('base64')
}

async function twilioFetch(path: string, body: Record<string, string>) {
  const res = await fetch(`${TWILIO_API}/Accounts/${accountSid()}${path}`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.message || `Twilio API error (${res.status})`)
  return data
}

// Click-to-call: rings the staff member's real phone first (from), and once
// they answer, app/api/twilio/click-to-call-connect bridges them to the
// lead's number — the lead sees the business's own Twilio number as caller
// ID, never the staff member's personal cell. A human places every call;
// nothing here auto-dials on its own.
export async function placeClickToCall(opts: {
  businessTwilioNumber: string
  staffNumber: string
  leadNumber: string
}): Promise<{ sid: string; status: string }> {
  const connectUrl = `https://www.bario.ca/api/twilio/click-to-call-connect?to=${encodeURIComponent(opts.leadNumber)}`
  const data = await twilioFetch('/Calls.json', {
    To: opts.staffNumber,
    From: opts.businessTwilioNumber,
    Url: connectUrl,
  })
  return { sid: data.sid, status: data.status }
}

// Sends a real SMS from Victoria's own number — used by the miko-sms text
// route's take_message tool to alert Mr. Mendoza when someone not in her
// known contacts texts in, mirroring the voice line's own take_message tool.
export async function sendVictoriaSms(toNumber: string, body: string): Promise<{ sid: string }> {
  const VICTORIA_NUMBER = '+18254650880'
  const data = await twilioFetch('/Messages.json', { To: toNumber, From: VICTORIA_NUMBER, Body: body })
  return { sid: data.sid }
}

// Generic SMS sender for features that don't have their own dedicated
// Twilio number (e.g. the Social Dispatcher's Lead Ads notifications —
// regular Bario customers don't get a business Twilio number the way
// AFC/Sunbuilt/Unique do). Defaults From to Victoria's number since it's
// already the general "Bario notifies you" line.
export async function sendSms(toNumber: string, body: string, fromNumber = '+18254650880'): Promise<{ sid: string }> {
  const data = await twilioFetch('/Messages.json', { To: toNumber, From: fromNumber, Body: body })
  return { sid: data.sid }
}

// Places a real outbound call FROM Miko's dedicated AI voice line — unlike
// placeClickToCall (which bridges two humans), this one connects the
// answering party directly to Miko itself, live, via ConversationRelay.
// jobContext travels through as a base64 query param (see
// app/api/twilio/miko-voice/outbound-twiml/route.ts) rather than embedded
// directly in the Calls.create `Twiml` param, so arbitrary free-text job
// descriptions don't need to survive XML-escaping twice.
export async function placeMikoOutboundCall(opts: {
  toNumber: string
  jobContext: string
}): Promise<{ sid: string; status: string }> {
  const MIKO_VOICE_NUMBER = '+18254650880'
  const encodedCtx = Buffer.from(JSON.stringify({ jobContext: opts.jobContext })).toString('base64url')
  const twimlUrl = `https://www.bario.ca/api/twilio/miko-voice/outbound-twiml?ctx=${encodedCtx}`
  const data = await twilioFetch('/Calls.json', {
    To: opts.toNumber,
    From: MIKO_VOICE_NUMBER,
    Url: twimlUrl,
  })
  return { sid: data.sid, status: data.status }
}
