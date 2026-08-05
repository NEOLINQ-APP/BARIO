// Shared by every route that connects a caller to Victoria via
// ConversationRelay — answering a line directly (app/api/twilio/miko-voice)
// or picking up only after a forwarded call to a real person goes
// unanswered (app/api/twilio/miko-voice/dial-fallback) — so the greeting
// per business and the actual TwiML shape can't drift out of sync between
// those two call sites.
export const VICTORIA_GREETINGS: Record<string, string> = {
  afc: 'Hi, thank you for calling AFC Logistics! This is Victoria, how may I help you today?',
  sunbuilt: 'Hi, thank you for calling Sunbuilt Group! This is Victoria, how may I help you today?',
  unique: 'Hi, thank you for calling Unique Group! This is Victoria, how may I help you today?',
}

// Reverted to a single flat voice (no nested <Language> tags) as an
// emergency fix — a real user report came in that Victoria sounded male
// after the multi-language <Language>-tag restructuring, and this exact
// flat-attribute shape (ttsProvider/voice directly on <ConversationRelay>)
// is the one previously confirmed live to sound correct. The nested
// <Language> multi-voice syntax needs re-verification against a real call
// before it's reintroduced — see PENDING note in miko-voice server.js
// about multi-language support being temporarily voice-switch-only
// (transcription language still switches, but TTS stays on this one voice
// until the nested-tag approach is confirmed safe).
//
// 2026-08-04: switched to ElevenLabs, but the voice ID picked at the time
// (UgBBYS2sOqTuMpoF3BR0, claimed to be "Twilio's documented default") was
// actually male — a real live call caught this. EXAVITQu4vr4xnSDxMaL is
// the same ID used for the "Lindsay" persona in
// app/api/twilio/victoria-app-call/route.ts, independently confirmed
// female via its own real test call.
export function buildVictoriaConnectTwiml(greeting: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect action="https://www.bario.ca/api/twilio/victoria-handoff">
    <ConversationRelay
      url="wss://miko-voice.bario.ca/"
      welcomeGreeting="${greeting}"
      ttsProvider="ElevenLabs"
      voice="EXAVITQu4vr4xnSDxMaL"
    />
  </Connect>
</Response>`
}
