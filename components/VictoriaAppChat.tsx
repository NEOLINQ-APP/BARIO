'use client'

import { useEffect, useRef, useState } from 'react'
import type { Device as DeviceType, Call as CallType } from '@twilio/voice-sdk'
import ThemeToggle from '@/components/ThemeToggle'

type Attachment = { url: string; contentType: string; filename: string }
type Msg = { role: 'user' | 'assistant'; content: string; attachments?: Attachment[] }
type ToolLogEntry = { tool: string; args: unknown; result: unknown }
type CallState = 'idle' | 'requesting' | 'ringing' | 'in-call' | 'ended'

// Same fix as VictoriaFamilyChat.tsx: Victoria's replies use **bold**
// markdown, but this bubble rendered raw text (literal asterisks) with no
// markdown parsing at all.
function renderContent(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    return part
  })
}

function greetingFor(name: string): Msg {
  return {
    role: 'assistant',
    content: `Hi — I'm ${name}. Ask me to create an invoice, generate an image, draft a social post, send an email, or read over a document/image you attach. What do you need?`,
  }
}

const GREETING: Msg = greetingFor('Victoria')

// Real, tested/reasonable ElevenLabs voices — mirrors
// app/api/twilio/victoria-app-call/route.ts's PERSONA_VOICES exactly (that
// route is the actual source of truth for the voice itself; this is just
// the picker UI's label list). Priyanka/Koko intentionally left out until
// real accent-matched voice ids are confirmed.
const PERSONAS: { key: string; name: string; note: string }[] = [
  { key: 'victoria', name: 'Victoria', note: 'American accent' },
  { key: 'charlotte', name: 'Charlotte', note: 'British accent' },
  { key: 'layla', name: 'Layla', note: 'American accent' },
  { key: 'lindsay', name: 'Lindsay', note: 'American accent' },
  { key: 'jade', name: 'Jade', note: 'American accent' },
  { key: 'miko', name: 'Miko', note: 'CRM & customers' },
  { key: 'amber', name: 'Amber', note: 'Invoices & billing' },
]

// Web Speech API — real but genuinely inconsistent support (unsupported in
// Firefox entirely, historically flaky in Safari/iOS). Feature-detected;
// the mic button simply doesn't render if unavailable, no broken promise.
function getSpeechRecognition(): (new () => any) | null {
  if (typeof window === 'undefined') return null
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null
}

export default function VictoriaAppChat() {
  const [messages, setMessages] = useState<Msg[]>([GREETING])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([])
  const [lastToolLog, setLastToolLog] = useState<ToolLogEntry[]>([])
  const [listening, setListening] = useState(false)
  const [speechSupported, setSpeechSupported] = useState(false)
  const [speakReplies, setSpeakReplies] = useState(false)
  const [ttsSupported, setTtsSupported] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const contactsFileRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<any>(null)
  // Tracks whether the mic was turned off by the user (the button) vs. the
  // browser's own recognition session ending on its own — Chrome in
  // particular ends a SpeechRecognition session after each finalized phrase
  // (or after a silence gap) even with continuous=true, which without this
  // flag reads as "conversation keeps getting cut off." onend below
  // auto-restarts unless this is true, so the mic behaves like a real
  // toggle: stays listening across pauses until you actually click it off.
  const micManuallyStoppedRef = useRef(true)

  const [personaKey, setPersonaKey] = useState('victoria')
  const currentPersona = PERSONAS.find((p) => p.key === personaKey) ?? PERSONAS[0]
  const [callState, setCallState] = useState<CallState>('idle')
  const [callMuted, setCallMuted] = useState(false)
  const [callError, setCallError] = useState<string | null>(null)
  const [callSeconds, setCallSeconds] = useState(0)
  // Persisted (not just component state) — real user complaint: speaker
  // mode was reverting to earpiece on every new call, forcing a re-tap
  // each time. Twilio's speakerDevices selection lives on the Device/Call
  // pairing, not something that survives a fresh device.connect() call on
  // its own, so this needs to be explicitly re-applied per call (see
  // startCall below), not just remembered as a UI checkbox.
  const SPEAKER_PREF_KEY = 'victoria-app-speaker-on'
  const [speakerOn, setSpeakerOn] = useState(false)
  const [speakerSupported, setSpeakerSupported] = useState(true)
  const deviceRef = useRef<DeviceType | null>(null)
  const callRef = useRef<CallType | null>(null)

  const [contactsOpen, setContactsOpen] = useState(false)
  const [contactsBusy, setContactsBusy] = useState(false)
  const [contactsStatus, setContactsStatus] = useState<string | null>(null)
  const [contactPickerSupported, setContactPickerSupported] = useState(false)

  useEffect(() => {
    // Android Chrome/Edge only — no iOS Safari support, and even there it
    // requires a manual per-use tap (no silent bulk read). Feature-detected
    // so the button simply doesn't render anywhere else; file upload below
    // is the path that works everywhere.
    setContactPickerSupported(
      typeof navigator !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window
    )
  }, [])

  useEffect(() => {
    setSpeakerOn(window.localStorage.getItem(SPEAKER_PREF_KEY) === 'true')
  }, [])

  async function applySpeakerPreference(device: DeviceType, on: boolean): Promise<boolean> {
    if (!device?.audio?.isOutputSelectionSupported) return false
    try {
      if (on) {
        const devices = Array.from(device.audio.availableOutputDevices.values())
        const speaker = devices.find((d: any) => /speaker/i.test(d.label))
        await device.audio.speakerDevices.set(speaker ? speaker.deviceId : 'default')
      } else {
        await device.audio.speakerDevices.set('default')
      }
      return true
    } catch {
      return false
    }
  }

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/victoria-app-sw.js').catch(() => {})
    }
    setSpeechSupported(!!getSpeechRecognition())
    setTtsSupported(typeof window !== 'undefined' && 'speechSynthesis' in window)

    // Load persisted history — without this, past conversation (and
    // anything narrated in from a Claude Code session via the admin
    // narrate route) never showed up; the page always started blank.
    fetch('/api/victoria/app/chat')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.messages) && data.messages.length > 0) setMessages(data.messages)
      })
      .catch(() => {})
  }, [])

  // Reflect the picked persona in the greeting — only while the chat is
  // still at its untouched default (real conversation history, once
  // loaded/started, is never rewritten out from under the user).
  useEffect(() => {
    setMessages((prev) => (prev.length === 1 && prev[0].role === 'assistant' ? [greetingFor(currentPersona.name)] : prev))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personaKey])

  useEffect(() => {
    if (callState !== 'in-call') return
    setCallSeconds(0)
    const interval = setInterval(() => setCallSeconds((s) => s + 1), 1000)
    return () => clearInterval(interval)
  }, [callState])

  // Real live voice — reuses the exact same Twilio Voice SDK mechanism the
  // Bario Dialer already uses (device.connect()), just pointed at a
  // dedicated TwiML Application that connects straight into the same
  // ConversationRelay backend powering the real phone line, instead of
  // building a separate browser-native speech pipeline from scratch.
  async function ensureDevice(): Promise<DeviceType> {
    if (deviceRef.current) return deviceRef.current
    const { Device } = await import('@twilio/voice-sdk')
    const res = await fetch('/api/victoria/app/voice-token', { method: 'POST' })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Could not get a calling token')
    const device = new Device(data.token, { logLevel: 'error' })
    deviceRef.current = device
    return device
  }

  function endCall() {
    callRef.current?.disconnect()
    callRef.current = null
    setCallState('ended')
    setCallMuted(false)
    setTimeout(() => setCallState('idle'), 1200)
  }

  async function startCall() {
    setCallError(null)
    setCallState('requesting')
    try {
      const device = await ensureDevice()
      const call = await device.connect({ params: { persona: personaKey } })
      callRef.current = call
      call.on('ringing', () => setCallState('ringing'))
      call.on('accept', () => {
        setCallState('in-call')
        // Re-apply the persisted speaker preference for THIS call — the
        // whole reason it kept "turning off": each new call needs this
        // re-applied, it doesn't carry over from a previous one even on
        // the same cached Device.
        if (speakerOn) applySpeakerPreference(device, true)
      })
      call.on('disconnect', () => endCall())
      call.on('cancel', () => endCall())
      call.on('reject', () => endCall())
      call.on('error', (err: any) => {
        setCallError(err?.message ?? 'Call error')
        endCall()
      })
    } catch (err: any) {
      setCallError(err.message ?? 'Could not place the call — check microphone permission and try again.')
      setCallState('idle')
    }
  }

  function toggleCallMute() {
    if (!callRef.current) return
    const next = !callMuted
    callRef.current.mute(next)
    setCallMuted(next)
  }

  // Real, but a genuine platform gap: depends on
  // HTMLAudioElement.setSinkId(), which iOS Safari does not implement at
  // all (Apple's own limitation, not fixable here) — works on Android
  // Chrome/Edge. On iPhone, use the call's native audio-route control
  // (the speaker icon that appears in iOS's own in-call UI / Control
  // Center) instead — that works regardless of this button.
  async function toggleSpeaker() {
    const device = deviceRef.current
    if (!device?.audio?.isOutputSelectionSupported) {
      setSpeakerSupported(false)
      setCallError('Speaker switching isn’t supported in this browser — use your phone’s own call audio button instead.')
      return
    }
    const next = !speakerOn
    const ok = await applySpeakerPreference(device, next)
    if (!ok) {
      setSpeakerSupported(false)
      setCallError('Speaker switching isn’t supported in this browser — use your phone’s own call audio button instead.')
      return
    }
    setSpeakerOn(next)
    window.localStorage.setItem(SPEAKER_PREF_KEY, String(next))
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // On some WebKit versions, speaking an utterance with no explicit .voice
  // set silently produces no audio rather than falling back audibly --
  // getVoices() can also return [] until 'voiceschanged' has fired once.
  function getPreferredVoice(): SpeechSynthesisVoice | null {
    const voices = window.speechSynthesis.getVoices()
    if (!voices.length) return null
    return voices.find((v) => v.lang?.toLowerCase().startsWith('en')) ?? voices[0]
  }

  function speak(text: string) {
    if (!ttsSupported) return
    window.speechSynthesis.cancel() // don't stack replies if one's still talking
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1.05
    const voice = getPreferredVoice()
    if (voice) {
      utterance.voice = voice
      window.speechSynthesis.speak(utterance)
    } else {
      let spoken = false
      const trySpeak = () => {
        if (spoken) return
        spoken = true
        const v = getPreferredVoice()
        if (v) utterance.voice = v
        window.speechSynthesis.speak(utterance)
      }
      window.speechSynthesis.addEventListener('voiceschanged', trySpeak, { once: true })
      setTimeout(trySpeak, 300)
    }
  }

  // iOS Safari silently drops speechSynthesis.speak() calls not triggered
  // synchronously inside a real user gesture -- by the time speak() runs
  // after `await fetch(...)` in send(), that window has closed. Fix: unlock
  // the API synchronously inside the actual tap that started this turn.
  function primeSpeech() {
    if (!ttsSupported || !speakReplies) return
    try {
      const unlock = new SpeechSynthesisUtterance(' ')
      unlock.volume = 0
      window.speechSynthesis.speak(unlock)
    } catch {}
  }

  async function send(overrideText?: string) {
    const text = (overrideText ?? input).trim()
    if ((!text && pendingAttachments.length === 0) || busy) return
    const attachments = pendingAttachments
    const next = [...messages, { role: 'user', content: text, attachments } as Msg]
    setMessages(next)
    setInput('')
    setPendingAttachments([])
    setBusy(true)
    try {
      const res = await fetch('/api/victoria/app/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, attachments }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      setMessages((m) => [...m, { role: 'assistant', content: data.reply }])
      setLastToolLog(data.toolLog ?? [])
      if (speakReplies) speak(data.reply)
    } catch (err: any) {
      setMessages((m) => [...m, { role: 'assistant', content: `Error: ${err.message ?? 'something went wrong'}` }])
    }
    setBusy(false)
  }

  function sendVoiceTranscript(transcript: string) {
    send(transcript)
  }

  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('folder', 'victoria-app-uploads')
      const res = await fetch('/api/media', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Upload failed')
      setPendingAttachments((prev) => [...prev, { url: data.url, contentType: file.type, filename: file.name }])
    } catch (err: any) {
      setMessages((m) => [...m, { role: 'assistant', content: `Couldn't upload that file — ${err.message ?? 'please try again'}.` }])
    }
    setUploading(false)
  }

  async function handleContactsFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setContactsBusy(true)
    setContactsStatus(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/victoria-app/contacts/import', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Import failed')
      setContactsStatus(`Added ${data.imported} contact${data.imported === 1 ? '' : 's'}${data.skipped ? ` (${data.skipped} already saved)` : ''}.`)
    } catch (err: any) {
      setContactsStatus(`Couldn't import that file — ${err.message ?? 'please try again'}.`)
    }
    setContactsBusy(false)
  }

  async function handleContactPickerImport() {
    setContactsBusy(true)
    setContactsStatus(null)
    try {
      const picked = await (navigator as any).contacts.select(['name', 'tel'], { multiple: true })
      const contacts = picked
        .map((c: any) => ({ name: (c.name?.[0] || '').trim(), phoneNumber: (c.tel?.[0] || '').trim() }))
        .filter((c: { name: string; phoneNumber: string }) => c.name && c.phoneNumber)
      if (contacts.length === 0) {
        setContactsStatus('No contacts with both a name and phone number were selected.')
        setContactsBusy(false)
        return
      }
      const res = await fetch('/api/victoria-app/contacts/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contacts }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Import failed')
      setContactsStatus(`Added ${data.imported} contact${data.imported === 1 ? '' : 's'}${data.skipped ? ` (${data.skipped} already saved)` : ''}.`)
    } catch (err: any) {
      // AbortError fires on a plain cancel — not a real failure worth showing.
      if (err?.name !== 'AbortError') setContactsStatus(`Couldn't import contacts — ${err.message ?? 'please try again'}.`)
    }
    setContactsBusy(false)
  }

  // Guards against the new auto-restart-on-end behavior leaving a
  // recognition session (and its restart loop) running after the page
  // itself goes away.
  useEffect(() => {
    return () => {
      micManuallyStoppedRef.current = true
      recognitionRef.current?.stop()
    }
  }, [])

  function startRecognitionSession() {
    const SpeechRecognition = getSpeechRecognition()
    if (!SpeechRecognition) return

    const recognition = new SpeechRecognition()
    // continuous=true keeps the mic open across multiple phrases instead of
    // stopping after the first one — combined with the auto-restart in
    // onend below, this is what makes the mic stay on until the user
    // actually clicks it off, rather than needing to be re-clicked after
    // every single thing said.
    recognition.continuous = true
    recognition.interimResults = false
    recognition.lang = 'en-US'
    recognition.onresult = (event: any) => {
      // continuous mode can report more than one finalized result per
      // session (e.g. after a longer pause) — send each new one, not just
      // the first, so nothing said gets silently dropped.
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          const transcript = result[0]?.transcript
          if (transcript) sendVoiceTranscript(transcript)
        }
      }
    }
    recognition.onend = () => {
      if (micManuallyStoppedRef.current) {
        setListening(false)
        return
      }
      // The browser ended the session on its own (silence gap, internal
      // timeout) but the user never clicked to stop — transparently start
      // a fresh session so listening continues without their input.
      startRecognitionSession()
    }
    recognition.onerror = (event: any) => {
      // 'no-speech'/'aborted' are routine (a pause, or this same
      // restart-on-end path) and shouldn't end listening — only a real
      // failure (e.g. permission revoked) should.
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        micManuallyStoppedRef.current = true
        setListening(false)
      }
    }
    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }

  function toggleListening() {
    if (listening) {
      micManuallyStoppedRef.current = true
      recognitionRef.current?.stop()
      return
    }
    primeSpeech()
    micManuallyStoppedRef.current = false
    startRecognitionSession()
  }

  return (
    <main className="h-[100dvh] overflow-hidden bg-white dark:bg-[#0b111c] text-slate-900 dark:text-zinc-100 antialiased flex flex-col">
      <div className="max-w-3xl w-full mx-auto px-6 pt-6 pb-3 flex flex-col flex-1 min-h-0">
        <div className="flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/victoria-avatar-192.png" alt={currentPersona.name} className="h-10 w-10 rounded-full" />
            <div>
              <h1 className="text-xl font-bold leading-tight">{currentPersona.name}</h1>
              <p className="text-xs text-slate-500 dark:text-zinc-400">Your assistant, always on</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setContactsOpen((v) => !v)}
              title="Import phone contacts into Victoria"
              className={`h-9 w-9 flex items-center justify-center rounded-xl border text-sm ${
                contactsOpen ? 'border-cyan-400 bg-cyan-500/10 text-cyan-600' : 'border-slate-300 dark:border-zinc-700 text-slate-500 dark:text-zinc-400'
              }`}
            >
              👤
            </button>
            <ThemeToggle />
          </div>
        </div>

        {contactsOpen && (
          <div className="mt-4 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-4">
            <div className="text-sm font-semibold">Import contacts</div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
              Add people to {currentPersona.name}&apos;s contact list so she can call or text them by name. Export contacts from
              your phone as a vCard (.vcf) or CSV file, then upload it here.
            </p>
            <input ref={contactsFileRef} type="file" onChange={handleContactsFilePick} className="hidden" accept=".vcf,.csv,text/vcard,text/csv" />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                onClick={() => contactsFileRef.current?.click()}
                disabled={contactsBusy}
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-sm font-semibold disabled:opacity-50"
              >
                {contactsBusy ? 'Importing…' : 'Upload file'}
              </button>
              {contactPickerSupported && (
                <button
                  onClick={handleContactPickerImport}
                  disabled={contactsBusy}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-zinc-700 text-sm font-semibold disabled:opacity-50"
                >
                  Pick from phone
                </button>
              )}
            </div>
            {contactsStatus && <p className="text-xs text-slate-600 dark:text-zinc-300 mt-2">{contactsStatus}</p>}
          </div>
        )}

        <div className="mt-4 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-4">
          {callState === 'idle' ? (
            <div className="flex items-center gap-3 flex-wrap">
              <select
                value={personaKey}
                onChange={(e) => setPersonaKey(e.target.value)}
                className="px-3 py-2 rounded-xl bg-white dark:bg-[#0b111c] border border-slate-300 dark:border-zinc-700 text-sm"
              >
                {PERSONAS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.name} — {p.note}
                  </option>
                ))}
              </select>
              <button
                onClick={startCall}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-semibold flex items-center gap-2"
              >
                📞 Call {currentPersona.name}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">
                  {callState === 'requesting' && 'Calling…'}
                  {callState === 'ringing' && 'Ringing…'}
                  {callState === 'in-call' && `On the line with ${currentPersona.name}`}
                  {callState === 'ended' && 'Call ended'}
                </div>
                {callState === 'in-call' && (
                  <div className="text-xs text-slate-500 dark:text-zinc-400 tabular-nums">
                    {String(Math.floor(callSeconds / 60)).padStart(2, '0')}:{String(callSeconds % 60).padStart(2, '0')}
                  </div>
                )}
              </div>
              {(callState === 'in-call' || callState === 'ringing' || callState === 'requesting') && (
                <div className="flex items-center gap-2">
                  {callState === 'in-call' && (
                    <>
                      <button
                        onClick={toggleCallMute}
                        className={`h-9 w-9 flex items-center justify-center rounded-xl border text-sm ${
                          callMuted ? 'border-amber-400 bg-amber-500/10 text-amber-600' : 'border-slate-300 dark:border-zinc-700 text-slate-500 dark:text-zinc-400'
                        }`}
                      >
                        {callMuted ? '🔇' : '🎤'}
                      </button>
                      {speakerSupported && (
                        <button
                          onClick={toggleSpeaker}
                          title="Speaker"
                          className={`h-9 w-9 flex items-center justify-center rounded-xl border text-sm ${
                            speakerOn ? 'border-cyan-400 bg-cyan-500/10 text-cyan-600' : 'border-slate-300 dark:border-zinc-700 text-slate-500 dark:text-zinc-400'
                          }`}
                        >
                          {speakerOn ? '🔊' : '🔈'}
                        </button>
                      )}
                    </>
                  )}
                  <button onClick={endCall} className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-400 text-white text-sm font-semibold">
                    Hang up
                  </button>
                </div>
              )}
            </div>
          )}
          {callError && <p className="text-xs text-red-500 dark:text-red-400 mt-2">{callError}</p>}
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`max-w-[85%] ${m.role === 'user' ? 'ml-auto' : ''}`}>
                <div
                  className={`text-sm px-3 py-2 rounded-xl whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-cyan-500 text-slate-950'
                      : 'bg-white dark:bg-[#0b111c] text-slate-900 dark:text-zinc-100 border border-slate-200 dark:border-zinc-800'
                  }`}
                >
                  {renderContent(m.content)}
                </div>
                {m.attachments && m.attachments.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1 justify-end">
                    {m.attachments.map((a, j) => (
                      <span key={j} className="text-xs px-2 py-1 rounded-lg bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border border-cyan-500/20">
                        📎 {a.filename}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <div className="text-sm bg-white dark:bg-[#0b111c] border border-slate-200 dark:border-zinc-800 text-slate-500 dark:text-zinc-400 px-3 py-2 rounded-xl max-w-[85%]">
                Working…
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {pendingAttachments.length > 0 && (
            <div className="px-3 pt-2 flex flex-wrap gap-1.5 border-t border-slate-200 dark:border-zinc-800">
              {pendingAttachments.map((a, i) => (
                <span key={i} className="text-xs px-2 py-1 rounded-lg bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border border-cyan-500/20 flex items-center gap-1">
                  📎 {a.filename}
                  <button onClick={() => setPendingAttachments((prev) => prev.filter((_, j) => j !== i))} className="text-cyan-700/60 dark:text-cyan-300/60 hover:text-cyan-700 dark:hover:text-cyan-300">
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault()
              primeSpeech()
              send()
            }}
            className="p-3 border-t border-slate-200 dark:border-zinc-800 flex flex-wrap items-center gap-2"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            <input ref={fileRef} type="file" onChange={handleFilePick} className="hidden" accept="image/*,application/pdf" />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading || busy}
              title="Attach a file"
              className="shrink-0 h-9 w-9 flex items-center justify-center rounded-xl border border-slate-300 dark:border-zinc-700 text-slate-500 dark:text-zinc-400 disabled:opacity-50"
            >
              {uploading ? '…' : '📎'}
            </button>
            {speechSupported && (
              <button
                type="button"
                onClick={toggleListening}
                disabled={busy}
                title={listening ? 'Stop listening (mic stays on until you click this)' : 'Speak instead of typing — stays on and sends each thing you say automatically'}
                className={`shrink-0 h-9 w-9 flex items-center justify-center rounded-xl border text-sm disabled:opacity-50 ${
                  listening ? 'border-red-400 bg-red-500/10 text-red-500' : 'border-slate-300 dark:border-zinc-700 text-slate-500 dark:text-zinc-400'
                }`}
              >
                🎙️
              </button>
            )}
            {ttsSupported && (
              <button
                type="button"
                onClick={() => {
                  if (speakReplies) {
                    window.speechSynthesis.cancel()
                  } else {
                    try {
                      const unlock = new SpeechSynthesisUtterance(' ')
                      unlock.volume = 0
                      window.speechSynthesis.speak(unlock)
                    } catch {}
                  }
                  setSpeakReplies((v) => !v)
                }}
                title={speakReplies ? `${currentPersona.name} will stop speaking her replies` : `${currentPersona.name} will speak her replies out loud`}
                className={`shrink-0 h-9 w-9 flex items-center justify-center rounded-xl border text-sm ${
                  speakReplies ? 'border-cyan-400 bg-cyan-500/10 text-cyan-600' : 'border-slate-300 dark:border-zinc-700 text-slate-500 dark:text-zinc-400'
                }`}
              >
                {speakReplies ? '🔊' : '🔈'}
              </button>
            )}
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Ask ${currentPersona.name} anything…`}
              disabled={busy}
              className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-white dark:bg-[#0b111c] border border-slate-300 dark:border-zinc-700 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500"
            />
            <button
              type="submit"
              disabled={busy || (!input.trim() && pendingAttachments.length === 0)}
              className="shrink-0 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-sm font-semibold disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>

        {lastToolLog.length > 0 && (
          <div className="mt-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-4">
            <div className="text-xs font-semibold text-slate-500 dark:text-zinc-400 mb-2">Actions this turn</div>
            <div className="space-y-1">
              {lastToolLog.map((t, i) => (
                <div key={i} className="text-xs font-mono text-slate-500 dark:text-zinc-400">
                  {t.tool}({JSON.stringify(t.args)}) → {JSON.stringify(t.result).slice(0, 140)}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
