'use client'

import { useEffect, useRef, useState } from 'react'
import type { Device as DeviceType, Call as CallType } from '@twilio/voice-sdk'

type Attachment = { url: string; contentType: string; filename: string }
type Msg = { role: 'user' | 'assistant'; content: string; attachments?: Attachment[] }
type CallState = 'idle' | 'requesting' | 'ringing' | 'in-call' | 'ended'

function getSpeechRecognition(): (new () => any) | null {
  if (typeof window === 'undefined') return null
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null
}

export default function VictoriaFamilyChat({ memberKey }: { memberKey: string }) {
  const storageKey = `bario_victoria_family_token_${memberKey}`
  const [token, setToken] = useState<string | null>(null)
  const [checkedAuth, setCheckedAuth] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [memberName, setMemberName] = useState<string>('')

  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([])
  const [listening, setListening] = useState(false)
  const [speechSupported, setSpeechSupported] = useState(false)
  const [speakReplies, setSpeakReplies] = useState(false)
  const [ttsSupported, setTtsSupported] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<any>(null)

  const [callState, setCallState] = useState<CallState>('idle')
  const [callMuted, setCallMuted] = useState(false)
  const [callError, setCallError] = useState<string | null>(null)
  const [callSeconds, setCallSeconds] = useState(0)
  // Live speaker toggle, added 2026-08-16 — this app previously had no
  // speaker/earpiece control at all, only mute. Persisted per member
  // (matches the storageKey pattern above) so it stays how they left it
  // rather than reverting to earpiece on every new call.
  const SPEAKER_PREF_KEY = `bario_victoria_family_speaker_${memberKey}`
  const [speakerOn, setSpeakerOn] = useState(false)
  const [speakerSupported, setSpeakerSupported] = useState(true)
  const deviceRef = useRef<DeviceType | null>(null)
  const callRef = useRef<CallType | null>(null)

  useEffect(() => {
    setSpeakerOn(window.localStorage.getItem(SPEAKER_PREF_KEY) === 'true')
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const [locationSharing, setLocationSharing] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const watchIdRef = useRef<number | null>(null)

  // Read the access token from the link on first visit, persist it locally
  // so re-opening the installed app later (no query string, just the
  // manifest's start_url) still works. No token anywhere = invalid link.
  useEffect(() => {
    const url = new URL(window.location.href)
    const fromUrl = url.searchParams.get('token')
    const effective = fromUrl || window.localStorage.getItem(storageKey)
    if (fromUrl) {
      window.localStorage.setItem(storageKey, fromUrl)
      url.searchParams.delete('token')
      window.history.replaceState({}, '', url.toString())
    }
    setToken(effective)

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/victoria-app-sw.js').catch(() => {})
    }
    setSpeechSupported(!!getSpeechRecognition())
    setTtsSupported(typeof window !== 'undefined' && 'speechSynthesis' in window)
  }, [storageKey])

  // Once we have a token, verify it and load history+name in one call.
  useEffect(() => {
    if (!token) {
      setCheckedAuth(true)
      return
    }
    fetch(`/api/victoria/family/chat?member=${memberKey}&token=${token}`)
      .then((r) => {
        if (!r.ok) throw new Error('invalid')
        return r.json()
      })
      .then((data) => {
        setMemberName(data.memberName || '')
        if (Array.isArray(data.messages)) {
          setMessages(
            data.messages.length > 0
              ? data.messages
              : [{ role: 'assistant', content: `Hi — I'm Victoria. Ask me anything, anytime — restaurants, weather, safety, or just to talk. I'm always here for you.` }]
          )
        }
        setCheckedAuth(true)
      })
      .catch(() => {
        setAuthError('This link is no longer valid — ask your dad for a new one.')
        setCheckedAuth(true)
      })
  }, [token, memberKey])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (callState !== 'in-call') return
    setCallSeconds(0)
    const interval = setInterval(() => setCallSeconds((s) => s + 1), 1000)
    return () => clearInterval(interval)
  }, [callState])

  async function ensureDevice(): Promise<DeviceType> {
    if (deviceRef.current) return deviceRef.current
    const { Device } = await import('@twilio/voice-sdk')
    const res = await fetch('/api/victoria/family/voice-token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ member: memberKey, token }),
    })
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
      const call = await device.connect({ params: { member: memberKey } })
      callRef.current = call
      call.on('ringing', () => setCallState('ringing'))
      call.on('accept', () => {
        setCallState('in-call')
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

  function speak(text: string) {
    if (!ttsSupported) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1.05
    window.speechSynthesis.speak(utterance)
  }

  async function send(overrideText?: string) {
    const text = (overrideText ?? input).trim()
    if ((!text && pendingAttachments.length === 0) || busy || !token) return
    const attachments = pendingAttachments
    setMessages((m) => [...m, { role: 'user', content: text, attachments } as Msg])
    setInput('')
    setPendingAttachments([])
    setBusy(true)
    try {
      const res = await fetch('/api/victoria/family/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ member: memberKey, token, text, attachments }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      setMessages((m) => [...m, { role: 'assistant', content: data.reply }])
      if (speakReplies) speak(data.reply)
    } catch (err: any) {
      setMessages((m) => [...m, { role: 'assistant', content: `Something went wrong — ${err.message ?? 'try again'}.` }])
    }
    setBusy(false)
  }

  function sendVoiceTranscript(transcript: string) {
    send(transcript)
  }

  function toggleListening() {
    const SpeechRecognition = getSpeechRecognition()
    if (!SpeechRecognition) return
    if (listening) {
      recognitionRef.current?.stop()
      return
    }
    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-US'
    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript
      if (transcript) sendVoiceTranscript(transcript)
    }
    recognition.onend = () => setListening(false)
    recognition.onerror = () => setListening(false)
    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }

  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !token) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('member', memberKey)
      form.append('token', token)
      const res = await fetch('/api/victoria/family/upload', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Upload failed')
      setPendingAttachments((prev) => [...prev, { url: data.url, contentType: file.type, filename: file.name }])
    } catch (err: any) {
      setMessages((m) => [...m, { role: 'assistant', content: `Couldn't upload that — ${err.message ?? 'try again'}.` }])
    }
    setUploading(false)
  }

  // Off by default. Turning it on triggers a real browser location
  // permission prompt (there's no way around that, by design) and starts
  // sending updates only while this page is open — turning it off clears
  // whatever was stored server-side. Entirely her own choice.
  async function toggleLocationSharing() {
    if (!token) return
    if (locationSharing) {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
      setLocationSharing(false)
      await fetch('/api/victoria/family/location', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ member: memberKey, token, enabled: false }),
      })
      return
    }

    if (!('geolocation' in navigator)) {
      setLocationError('Location isn’t supported in this browser.')
      return
    }
    setLocationError(null)
    await fetch('/api/victoria/family/location', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ member: memberKey, token, enabled: true }),
    })
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        fetch('/api/victoria/family/location', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ member: memberKey, token, lat: pos.coords.latitude, lng: pos.coords.longitude }),
        }).catch(() => {})
      },
      () => setLocationError('Location permission was denied — turn it back on and allow access to share it.'),
      { enableHighAccuracy: false, maximumAge: 60000 }
    )
    setLocationSharing(true)
  }

  useEffect(() => {
    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current)
    }
  }, [])

  if (!checkedAuth) return null

  if (authError || !token) {
    return (
      <main className="min-h-screen bg-[#0b111c] flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-3xl mb-5 mx-auto">🔒</div>
          <p className="text-white font-semibold mb-1">Link not valid</p>
          <p className="text-sm text-slate-400">{authError ?? 'Ask your dad for a new link.'}</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-white dark:bg-[#0b111c] text-slate-900 dark:text-zinc-100 antialiased">
      <style>{`
        @keyframes victoria-float {
          0%, 100% { transform: translateY(0) rotate(0deg); filter: drop-shadow(0 0 6px rgba(56,189,248,0.5)); }
          50% { transform: translateY(-4px) rotate(3deg); filter: drop-shadow(0 0 14px rgba(56,189,248,0.85)); }
        }
        .victoria-avatar-animated { animation: victoria-float 3s ease-in-out infinite; }
      `}</style>
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/victoria-avatar-192.png" alt="Victoria" className="h-12 w-12 rounded-full victoria-avatar-animated" />
            <div>
              <h1 className="text-xl font-bold leading-tight">Victoria</h1>
              <p className="text-xs text-slate-500 dark:text-zinc-400">{memberName ? `${memberName}'s assistant, always on` : 'Always on'}</p>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-4">
          {callState === 'idle' ? (
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={startCall}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-semibold flex items-center gap-2"
              >
                📞 Call Victoria
              </button>
              <button
                onClick={toggleLocationSharing}
                className={`px-4 py-2 rounded-xl text-sm font-semibold border flex items-center gap-2 ${
                  locationSharing
                    ? 'bg-cyan-500/10 border-cyan-400 text-cyan-600 dark:text-cyan-300'
                    : 'border-slate-300 dark:border-zinc-700 text-slate-500 dark:text-zinc-400'
                }`}
              >
                📍 {locationSharing ? 'Sharing location with Dad' : 'Share my location with Dad'}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">
                  {callState === 'requesting' && 'Calling…'}
                  {callState === 'ringing' && 'Ringing…'}
                  {callState === 'in-call' && 'On the line with Victoria'}
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
                    <button
                      onClick={toggleCallMute}
                      className={`h-9 w-9 flex items-center justify-center rounded-xl border text-sm ${
                        callMuted ? 'border-amber-400 bg-amber-500/10 text-amber-600' : 'border-slate-300 dark:border-zinc-700 text-slate-500 dark:text-zinc-400'
                      }`}
                    >
                      {callMuted ? '🔇' : '🎤'}
                    </button>
                  )}
                  {callState === 'in-call' && speakerSupported && (
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
                  <button onClick={endCall} className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-400 text-white text-sm font-semibold">
                    Hang up
                  </button>
                </div>
              )}
            </div>
          )}
          {callError && <p className="text-xs text-red-500 dark:text-red-400 mt-2">{callError}</p>}
          {locationError && <p className="text-xs text-red-500 dark:text-red-400 mt-2">{locationError}</p>}
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] flex flex-col h-[34rem]">
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
                  {m.content}
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
              send()
            }}
            className="p-3 border-t border-slate-200 dark:border-zinc-800 flex items-center gap-2"
          >
            <input ref={fileRef} type="file" onChange={handleFilePick} className="hidden" accept="image/*,video/*,application/pdf" />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading || busy}
              title="Attach a photo, video, or file"
              className="shrink-0 h-9 w-9 flex items-center justify-center rounded-xl border border-slate-300 dark:border-zinc-700 text-slate-500 dark:text-zinc-400 disabled:opacity-50"
            >
              {uploading ? '…' : '📎'}
            </button>
            {speechSupported && (
              <button
                type="button"
                onClick={toggleListening}
                disabled={busy}
                title={listening ? 'Stop listening' : 'Speak instead of typing — sends automatically'}
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
                  if (speakReplies) window.speechSynthesis.cancel()
                  setSpeakReplies((v) => !v)
                }}
                title={speakReplies ? 'Victoria will stop speaking her replies' : 'Victoria will speak her replies out loud'}
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
              placeholder="Ask Victoria anything…"
              disabled={busy}
              className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-[#0b111c] border border-slate-300 dark:border-zinc-700 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500"
            />
            <button
              type="submit"
              disabled={busy || (!input.trim() && pendingAttachments.length === 0)}
              className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-sm font-semibold disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
