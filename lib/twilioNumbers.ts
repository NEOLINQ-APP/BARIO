// Bario Voice's own number search/provisioning -- wraps Twilio's
// AvailablePhoneNumbers + IncomingPhoneNumbers APIs the same way
// lib/twilio.ts wraps Messages/Calls, so every result this returns is a
// plain phone number/city/region, never anything Twilio-branded, matching
// the existing white-label posture of the rest of Bario Voice.
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

export type NumberType = 'local' | 'tollfree'

export type AvailableNumber = {
  phoneNumber: string
  friendlyName: string
  locality: string | null
  region: string | null
}

// Country is fixed to CA (Canada) -- this project has never provisioned a
// US number, and Bario Voice is a Canadian product; widen this to accept a
// country param later if that ever changes.
export async function searchAvailableNumbers(type: NumberType, opts: { areaCode?: string; contains?: string } = {}): Promise<AvailableNumber[]> {
  const path = type === 'tollfree' ? 'TollFree' : 'Local'
  const params = new URLSearchParams({ SmsEnabled: 'true', VoiceEnabled: 'true', PageSize: '20' })
  if (opts.areaCode) params.set('AreaCode', opts.areaCode)
  if (opts.contains) params.set('Contains', opts.contains)

  const res = await fetch(`${TWILIO_API}/Accounts/${accountSid()}/AvailablePhoneNumbers/CA/${path}.json?${params}`, {
    headers: { Authorization: authHeader() },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.message || `Twilio search failed (${res.status})`)

  return (data.available_phone_numbers ?? []).map((n: any) => ({
    phoneNumber: n.phone_number,
    friendlyName: n.friendly_name,
    locality: n.locality || null,
    region: n.region || null,
  }))
}

// Actually purchases the number -- real, immediate, real recurring monthly
// cost on the Twilio account from this point on. voiceUrl left unset by
// default (caller wires it up afterward, e.g. the same dialer-inbound
// pattern lib/dialerBusinesses.ts's entries use) rather than assuming a
// shape here.
export async function provisionNumber(phoneNumber: string, friendlyName: string): Promise<{ sid: string; phoneNumber: string }> {
  const res = await fetch(`${TWILIO_API}/Accounts/${accountSid()}/IncomingPhoneNumbers.json`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ PhoneNumber: phoneNumber, FriendlyName: friendlyName }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.message || `Twilio purchase failed (${res.status})`)
  return { sid: data.sid, phoneNumber: data.phone_number }
}
