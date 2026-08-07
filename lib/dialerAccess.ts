import { findDialerBusiness } from './dialerBusinesses'

// Second auth path for the Dialer's own API routes (voice-token, call-log,
// crm-outreach contacts/create-contact), alongside the existing
// requireAdmin() session/API-key check — lets AFC/Sunbuilt's own staff
// (verified client-side via ClientDialerGate, no Bario account at all) use
// their business's Dialer. Deliberately scoped to exactly one businessKey
// per check: a valid AFC passcode must never satisfy a Sunbuilt request, so
// every call site passes the specific businessKey/crmKey it's about to act
// on, not just "is this header present."
export function verifyDialerPasscode(req: Request, businessKey: string | null | undefined): boolean {
  if (!businessKey) return false
  const business = findDialerBusiness(businessKey)
  const envVar = business?.clientPasscodeEnvVar
  const expected = envVar ? process.env[envVar] : undefined
  const provided = req.headers.get('x-dialer-passcode')
  return !!expected && !!provided && provided === expected
}
