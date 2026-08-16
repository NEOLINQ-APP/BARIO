// Bario Dialer's business list — deliberately separate from
// lib/crmOutreach.ts's OUTREACH_CRMS, which assumes a real Twenty CRM
// backend (graphqlUrl, API key) behind every entry. Unique Group Inc. is
// Bario's own agency number, not a client CRM, so it has no CRM to talk
// to — but it still needs an entry here to place/receive calls through
// the Bario Dialer PWA. All three numbers + TwiML Applications already
// provisioned/verified live on the Unique Group Twilio (sub)account.
export type DialerBusiness = {
  key: string
  businessName: string
  twilioNumber: string
  forwardToNumber: string
  twimlAppSid: string
  // Set only for businesses that get their own self-serve client-facing
  // Dialer at /dialer/<key> (app/dialer/<key>/page.tsx), gated by this
  // passcode rather than a Bario admin login — see
  // app/api/dialer-access/check/route.ts. Unique Group has none: it's
  // Sherwin's own company, already reachable via the admin-only
  // /admin/dialer/unique he uses himself.
  clientPasscodeEnvVar?: string
}

export const DIALER_BUSINESSES: DialerBusiness[] = [
  {
    key: 'afc',
    businessName: 'AFC Logistics',
    twilioNumber: '+18253607175',
    forwardToNumber: '+17809778865',
    twimlAppSid: 'APee46b91de81c9f57efad2e042fbc3f19',
    clientPasscodeEnvVar: 'AFC_DIALER_PASSCODE',
  },
  {
    key: 'sunbuilt',
    businessName: 'Sunbuilt Group',
    twilioNumber: '+18254352121',
    forwardToNumber: '+14164572224',
    twimlAppSid: 'APe0558e2920449e49a09ded2f992dac81',
    clientPasscodeEnvVar: 'SUNBUILT_DIALER_PASSCODE',
  },
  {
    key: 'unique',
    businessName: 'Unique Group Inc.',
    twilioNumber: '+12367070808',
    forwardToNumber: '+17802410880',
    twimlAppSid: 'AP5f6f10b5122ffb7deb4863ba747197ea',
  },
  {
    key: 'bario',
    businessName: 'Bario.ca',
    twilioNumber: '+12365004678',
    forwardToNumber: '+18259639988',
    twimlAppSid: 'AP3987c6b53d478f20f20da8e7956a4057',
    clientPasscodeEnvVar: 'BARIO_DIALER_PASSCODE',
  },
]

export function findDialerBusiness(key: string): DialerBusiness | undefined {
  return DIALER_BUSINESSES.find((b) => b.key === key)
}
