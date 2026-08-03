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
}

export const DIALER_BUSINESSES: DialerBusiness[] = [
  {
    key: 'afc',
    businessName: 'AFC Logistics',
    twilioNumber: '+18253607175',
    forwardToNumber: '+17809778865',
    twimlAppSid: 'APee46b91de81c9f57efad2e042fbc3f19',
  },
  {
    key: 'sunbuilt',
    businessName: 'Sunbuilt Group',
    twilioNumber: '+18254352121',
    forwardToNumber: '+14164572224',
    twimlAppSid: 'APe0558e2920449e49a09ded2f992dac81',
  },
  {
    key: 'unique',
    businessName: 'Unique Group Inc.',
    twilioNumber: '+12367070808',
    forwardToNumber: '+17802410880',
    twimlAppSid: 'AP5f6f10b5122ffb7deb4863ba747197ea',
  },
]

export function findDialerBusiness(key: string): DialerBusiness | undefined {
  return DIALER_BUSINESSES.find((b) => b.key === key)
}
