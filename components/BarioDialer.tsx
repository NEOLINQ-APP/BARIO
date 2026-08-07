'use client'

import { useEffect, useRef, useState } from 'react'
import type { Device as DeviceType, Call as CallType } from '@twilio/voice-sdk'

const BUSINESSES = [
  { key: 'afc', label: 'AFC Logistics' },
  { key: 'sunbuilt', label: 'Sunbuilt Group' },
  { key: 'unique', label: 'Unique Group Inc.' },
]

type CallState = 'idle' | 'requesting' | 'ringing' | 'incoming' | 'in-call' | 'ended'
type Tab = 'dial' | 'contacts' | 'internal' | 'recents'
type Contact = { personId: string; name: string; companyName: string | null; phone: string }
type CallLogRow = { id: string; to_number: string; contact_name: string | null; status: string; duration_seconds: number | null; started_at: string }

// Bario Dialer — an installable PWA (see public/dialer-manifest.json) that
// places real outbound calls from the browser via Twilio's Voice SDK,
// showing the correct business's number as caller ID. No phone of the
// staff member's own ever rings — this is a genuine WebRTC softphone, not
// the earlier phone-bridge click-to-call. Contacts pulls straight from
// that business's Twenty CRM (no separate address book to maintain);
// Recents is a real, persisted call log, not just in-memory session state.
// The Voice SDK Device is created once and kept registered for the whole
// time the app is open (not per-call) so it can also receive Internal
// calls from the other two Bario Dialer apps at any moment.
export default function BarioDialer({
  initialNumber,
  lockedBusinessKey,
  swScope,
}: {
  initialNumber?: string
  lockedBusinessKey?: string
  swScope?: string
}) {
  const [businessKey, setBusinessKey] = useState(lockedBusinessKey ?? 'afc')
  const [tab, setTab] = useState<Tab>('dial')
  const [number, setNumber] = useState(initialNumber ?? '')
  const [activeContactName, setActiveContactName] = useState<string | null>(null)
  const [callState, setCallState] = useState<CallState>('idle')
  const [muted, setMuted] = useState(false)
  const [speakerOn, setSpeakerOn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [seconds, setSeconds] = useState(0)
  const [installPromptEvent, setInstallPromptEvent] = useState<any>(null)
  const [installed, setInstalled] = useState(false)
  // Real bug fix (2026-08-04): a real user reported "they can hear me, I
  // can't hear them" on outbound calls — the classic signature of Chrome/
  // Safari/Firefox's autoplay policy silently blocking the remote-audio
  // element Twilio's SDK creates. Root cause: the Device below was being
  // constructed+registered in a useEffect on mount, with zero prior user
  // interaction (needed so the app can receive Internal calls at any time,
  // not just while actively dialing) — but per Twilio's own documented
  // autoplay workaround, the fix is that the Device must not be set up
  // until the user has interacted with the page at least once. Gating
  // construction behind this one-tap screen satisfies that requirement
  // while still registering immediately after, preserving the
  // always-ready-for-Internal-calls behavior for the rest of the session.
  const [readyToInit, setReadyToInit] = useState(false)
  // Real-time call quality signal (Twilio's Call 'warning' event — jitter,
  // packet loss, RTT, etc.) surfaced directly in the in-call screen. Added
  // after a real report of one-way audio that a first fix (the
  // readyToInit gate above) didn't resolve — this exists so the NEXT
  // occurrence produces actual evidence (which warning fired, when)
  // instead of another guess, especially useful on mobile where there's no
  // devtools console to check.
  const [callWarning, setCallWarning] = useState<string | null>(null)

  const [contacts, setContacts] = useState<Contact[] | null>(null)
  const [contactsLoading, setContactsLoading] = useState(false)
  const [deviceContactsSupported, setDeviceContactsSupported] = useState(false)

  const [showAddContact, setShowAddContact] = useState(false)
  const [newFirstName, setNewFirstName] = useState('')
  const [newLastName, setNewLastName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newCompany, setNewCompany] = useState('')
  const [savingContact, setSavingContact] = useState(false)
  const [saveContactError, setSaveContactError] = useState<string | null>(null)

  const [recents, setRecents] = useState<CallLogRow[] | null>(null)
  const [recentsLoading, setRecentsLoading] = useState(false)

  const deviceRef = useRef<DeviceType | null>(null)
  const deviceBusinessKeyRef = useRef<string | null>(null)
  const callRef = useRef<CallType | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const callLogIdRef = useRef<string | null>(null)

  useEffect(() => {
    navigator.serviceWorker?.register('/dialer-sw.js', swScope ? { scope: swScope } : undefined).catch(() => {})

    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true
    setInstalled(standalone)

    const onBeforeInstall = (e: any) => {
      e.preventDefault()
      setInstallPromptEvent(e)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', () => setInstalled(true))

    // Contact Picker API — real, but only actually works on Android
    // Chrome/Edge. iOS Safari and every desktop browser lack it entirely
    // (an Apple/browser-vendor platform gap, not something fixable here),
    // so the "Import from phone" button only renders where it can work.
    setDeviceContactsSupported('contacts' in navigator && 'ContactsManager' in window)

    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [])

  useEffect(() => {
    if (callState === 'in-call') {
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
      setSeconds(0)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [callState])

  // Keep one Device registered for the current business identity so this
  // app can receive Internal calls from the other two Bario Dialer apps
  // even when nobody is actively dialing out. Recreated whenever the
  // business changes (only relevant in the unlocked/dropdown mode). Gated
  // on readyToInit (see its declaration above) so this never runs before
  // the user's first tap on this page load.
  useEffect(() => {
    if (!readyToInit) return
    ensureDevice().catch(() => {})
    return () => {
      deviceRef.current?.destroy()
      deviceRef.current = null
      deviceBusinessKeyRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessKey, readyToInit])

  async function promptInstall() {
    if (!installPromptEvent) return
    installPromptEvent.prompt()
    await installPromptEvent.userChoice
    setInstallPromptEvent(null)
  }

  function normalizeNumber(raw: string): string {
    const digitsOnly = raw.replace(/[^\d+*#]/g, '')
    if (digitsOnly.startsWith('+')) return digitsOnly
    if (/^\d{10}$/.test(digitsOnly)) return `+1${digitsOnly}`
    if (/^1\d{10}$/.test(digitsOnly)) return `+${digitsOnly}`
    return digitsOnly
  }

  function goToDial(prefillNumber?: string, contactName?: string | null) {
    if (prefillNumber) setNumber(prefillNumber)
    setActiveContactName(contactName ?? null)
    setTab('dial')
  }

  async function loadContacts() {
    if (businessKey === 'unique') { setContacts([]); return } // no CRM behind Unique Group's own number
    setContactsLoading(true)
    try {
      const res = await fetch(`/api/admin/crm-outreach/contacts?crmKey=${businessKey}`)
      const data = await res.json()
      const group = data.results?.find((r: any) => r.crm === businessKey)
      setContacts(group?.contacts ?? [])
    } catch {
      setContacts([])
    } finally {
      setContactsLoading(false)
    }
  }

  async function importFromPhone() {
    try {
      const props = ['name', 'tel']
      const opts = { multiple: false }
      const selected = await (navigator as any).contacts.select(props, opts)
      const picked = selected?.[0]
      if (picked?.tel?.[0]) goToDial(picked.tel[0], picked.name?.[0] ?? null)
    } catch {
      // User cancelled the native picker, or the browser denied it — not a
      // real error to surface, just a no-op.
    }
  }

  async function loadRecents() {
    setRecentsLoading(true)
    try {
      const res = await fetch(`/api/admin/dialer/call-log?businessKey=${businessKey}`)
      const data = await res.json()
      setRecents(data.calls ?? [])
    } catch {
      setRecents([])
    } finally {
      setRecentsLoading(false)
    }
  }

  useEffect(() => {
    if (tab === 'contacts' && contacts === null) loadContacts()
    if (tab === 'recents') loadRecents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, businessKey])

  function openAddContact() {
    setNewFirstName('')
    setNewLastName(activeContactName ?? '')
    setNewPhone(number || '')
    setNewEmail('')
    setNewCompany('')
    setSaveContactError(null)
    setShowAddContact(true)
  }

  async function saveNewContact() {
    const phone = normalizeNumber(newPhone.trim())
    if ((!newFirstName.trim() && !newLastName.trim()) || !phone) {
      setSaveContactError('A name and phone number are required')
      return
    }
    setSavingContact(true)
    setSaveContactError(null)
    try {
      const res = await fetch('/api/admin/crm-outreach/create-contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          crmKey: businessKey,
          firstName: newFirstName.trim(),
          lastName: newLastName.trim(),
          phone,
          email: newEmail.trim(),
          companyName: newCompany.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not save that contact')
      setShowAddContact(false)
      setContacts(null)
      loadContacts()
    } catch (err: any) {
      setSaveContactError(err.message ?? 'Could not save that contact')
    } finally {
      setSavingContact(false)
    }
  }

  // Creates (or reuses) a single Twilio Voice SDK Device for the current
  // business identity and keeps it registered, so it can both place calls
  // and receive Internal ones. Real API-key-signed Access Token — see
  // app/api/twilio/voice-token/route.ts for why the account-SID-signed
  // approach this used to use doesn't actually work.
  async function ensureDevice(): Promise<DeviceType> {
    if (deviceRef.current && deviceBusinessKeyRef.current === businessKey) return deviceRef.current
    if (deviceRef.current) {
      deviceRef.current.destroy()
      deviceRef.current = null
    }

    const { Device } = await import('@twilio/voice-sdk')
    const res = await fetch('/api/twilio/voice-token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ businessKey }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Could not get a calling token')

    const device = new Device(data.token, { logLevel: 'error' })

    device.on('incoming', (call) => {
      callRef.current = call
      const from = call.parameters?.From ?? ''
      const match = from.match(/^client:admin-(\w+)$/)
      const label = match ? BUSINESSES.find((b) => b.key === match[1])?.label : null
      const displayName = label ? `${label} (Internal)` : from || 'Incoming call'
      setActiveContactName(displayName)
      setCallState('incoming')

      fetch('/api/admin/dialer/call-log', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ businessKey, toNumber: from || 'incoming', contactName: displayName }),
      })
        .then((r) => r.json())
        .then((d) => { callLogIdRef.current = d.id ?? null })
        .catch(() => {})

      call.on('accept', () => setCallState('in-call'))
      call.on('disconnect', () => endCall('completed'))
      call.on('cancel', () => endCall('cancelled'))
      call.on('reject', () => endCall('rejected'))
      call.on('error', (err: any) => {
        setError(err?.message ?? 'Call error')
        endCall('failed')
      })
      call.on('warning', (name: string) => setCallWarning(name))
      call.on('warning-cleared', () => setCallWarning(null))
    })

    await device.register()
    deviceRef.current = device
    deviceBusinessKeyRef.current = businessKey
    return device
  }

  async function startOutgoingCall(to: string, contactName: string | null) {
    setError(null)
    setCallWarning(null)
    setCallState('requesting')

    try {
      const device = await ensureDevice()

      const logRes = await fetch('/api/admin/dialer/call-log', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ businessKey, toNumber: to, contactName }),
      })
      const logData = await logRes.json().catch(() => ({}))
      callLogIdRef.current = logData.id ?? null

      const call = await device.connect({ params: { To: to, business: businessKey } })
      callRef.current = call

      call.on('ringing', () => setCallState('ringing'))
      call.on('accept', () => setCallState('in-call'))
      call.on('disconnect', () => endCall('completed'))
      call.on('cancel', () => endCall('cancelled'))
      call.on('reject', () => endCall('rejected'))
      call.on('error', (err: any) => {
        setError(err?.message ?? 'Call error')
        endCall('failed')
      })
      call.on('warning', (name: string) => setCallWarning(name))
      call.on('warning-cleared', () => setCallWarning(null))
    } catch (err: any) {
      setError(err.message ?? 'Could not place the call — check microphone permission and try again.')
      setCallState('idle')
    }
  }

  async function placeCall() {
    const cleaned = normalizeNumber(number.trim())
    if (!cleaned) return
    await startOutgoingCall(cleaned, activeContactName)
  }

  // Internal calling — rings another Bario Dialer app (client-to-client
  // over Twilio's WebRTC signaling) instead of a real phone number. Needs
  // only wifi/data on both ends, no carrier minutes, and works even if the
  // target business has no phone forwarding set up at all.
  async function placeInternalCall(targetKey: string) {
    const target = BUSINESSES.find((b) => b.key === targetKey)
    const label = target ? `${target.label} (Internal)` : 'Internal call'
    setActiveContactName(label)
    await startOutgoingCall(`internal:${targetKey}`, label)
  }

  function acceptIncomingCall() {
    callRef.current?.accept()
  }

  function declineIncomingCall() {
    callRef.current?.reject()
  }

  function endCall(status: string) {
    callRef.current?.disconnect()
    callRef.current = null

    if (callLogIdRef.current) {
      fetch('/api/admin/dialer/call-log', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: callLogIdRef.current, status, durationSeconds: seconds }),
      }).catch(() => {})
      callLogIdRef.current = null
    }

    setCallState('ended')
    setMuted(false)
    setSpeakerOn(false)
    setCallWarning(null)
    setTimeout(() => { setCallState('idle'); setActiveContactName(null) }, 1500)
  }

  function toggleMute() {
    if (!callRef.current) return
    const next = !muted
    callRef.current.mute(next)
    setMuted(next)
  }

  // Best-effort — depends on HTMLAudioElement.setSinkId(), which iOS
  // Safari does not implement at all (Apple platform gap, not fixable
  // here). Works on Android Chrome/Edge, which is what this was verified
  // against. Falls back to surfacing an error rather than pretending it
  // worked if the browser can't do output-device selection.
  async function toggleSpeaker() {
    const device = deviceRef.current
    if (!device?.audio?.isOutputSelectionSupported) {
      setError('Speaker switching is not supported on this browser')
      return
    }
    try {
      const next = !speakerOn
      if (next) {
        const devices = Array.from(device.audio.availableOutputDevices.values())
        const speaker = devices.find((d) => /speaker/i.test(d.label))
        await device.audio.speakerDevices.set(speaker ? speaker.deviceId : 'default')
      } else {
        await device.audio.speakerDevices.set('default')
      }
      setSpeakerOn(next)
    } catch {
      setError('Speaker switching is not supported on this browser')
    }
  }

  const business = BUSINESSES.find((b) => b.key === businessKey)!
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')
  const inCallView = callState !== 'idle'

  if (!readyToInit) {
    return (
      <div className="h-[100dvh] overflow-hidden overscroll-none bg-[#0b111c] text-white flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-3xl mb-4">📞</div>
        <h2 className="text-lg font-semibold mb-2">Bario Dialer</h2>
        <p className="text-sm text-slate-400 mb-6 max-w-xs">
          Tap below to enable calling. This one tap is required by your browser so call audio is allowed to play.
        </p>
        <button
          onClick={() => setReadyToInit(true)}
          className="px-8 py-3.5 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 text-[#04101f] font-semibold text-base"
        >
          Enable Calling
        </button>
      </div>
    )
  }

  return (
    <div className="h-[100dvh] overflow-hidden overscroll-none bg-[#0b111c] text-white flex flex-col items-center px-6 pt-8 pb-6">
      <div className="w-full max-w-md flex flex-col flex-1 min-h-0">
        <div className="flex items-center justify-between mb-3 shrink-0">
          <span className="text-base font-semibold text-slate-400">{business.label}</span>
          {!installed && installPromptEvent && (
            <button onClick={promptInstall} className="text-sm px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 text-[#04101f] font-semibold">
              Install App
            </button>
          )}
        </div>

        {!lockedBusinessKey && !inCallView && (
          <select
            value={businessKey}
            onChange={(e) => setBusinessKey(e.target.value)}
            className="w-full mb-3 px-3 py-3 rounded-xl bg-[#111a2c] border border-[#22304a] text-base shrink-0"
          >
            {BUSINESSES.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
          </select>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain flex flex-col justify-center">
          {tab === 'dial' && callState === 'idle' && (
            <>
              <div className="flex items-center justify-center gap-1 min-h-20 mt-2 mb-1 px-2">
                <span
                  className={`font-bold tabular-nums text-white text-center whitespace-nowrap ${
                    number.length > 12 ? 'text-2xl' : number.length > 9 ? 'text-3xl' : number.length > 6 ? 'text-4xl' : 'text-5xl'
                  }`}
                >
                  {number || <span className="text-slate-500 text-2xl font-medium">Enter a number</span>}
                </span>
              </div>
              {activeContactName && <p className="text-center text-lg font-semibold text-slate-300 mb-2">{activeContactName}</p>}

              <div className="grid grid-cols-3 gap-3 mb-4 justify-items-center">
                {[
                  ['1', ''], ['2', 'ABC'], ['3', 'DEF'],
                  ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'],
                  ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'],
                  ['*', ''], ['0', ''], ['#', ''],
                ].map(([digit, sub]) => (
                  <button
                    key={digit}
                    onClick={() => { setNumber((n) => n + digit); setActiveContactName(null) }}
                    className="w-[4.5rem] h-[4.5rem] rounded-full bg-[#111a2c] border border-[#22304a] flex flex-col items-center justify-center active:bg-[#1a2740] transition-colors"
                  >
                    <span className="text-4xl font-bold text-white leading-none">{digit}</span>
                    {sub ? (
                      <span className="text-[0.65rem] font-semibold tracking-widest text-slate-400 mt-1 leading-none">{sub}</span>
                    ) : (
                      <span className="h-[0.65rem] mt-1" aria-hidden="true" />
                    )}
                  </button>
                ))}
              </div>

              {error && <p className="text-sm font-medium text-red-400 mb-2 text-center">{error}</p>}

              <div className="relative flex items-center justify-center mb-1 h-20">
                <button
                  onClick={placeCall}
                  disabled={!number.trim()}
                  aria-label="Call"
                  className="w-20 h-20 rounded-full bg-emerald-600 disabled:bg-[#111a2c] disabled:opacity-50 flex items-center justify-center text-4xl shadow-lg shadow-emerald-600/20"
                >
                  📞
                </button>
                {number && (
                  <button
                    onClick={() => setNumber((n) => n.slice(0, -1))}
                    aria-label="Delete last digit"
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-14 h-14 flex items-center justify-center text-4xl text-slate-300"
                  >
                    ⌫
                  </button>
                )}
              </div>
            </>
          )}

          {tab === 'contacts' && callState === 'idle' && showAddContact && (
            <div className="pt-2">
              <p className="text-sm font-semibold text-slate-300 mb-3">New Contact — {business.label}</p>
              <div className="space-y-2 mb-3">
                <input
                  value={newFirstName}
                  onChange={(e) => setNewFirstName(e.target.value)}
                  placeholder="First name"
                  className="w-full px-3 py-2.5 rounded-xl bg-[#111a2c] border border-[#22304a] text-base"
                />
                <input
                  value={newLastName}
                  onChange={(e) => setNewLastName(e.target.value)}
                  placeholder="Last name"
                  className="w-full px-3 py-2.5 rounded-xl bg-[#111a2c] border border-[#22304a] text-base"
                />
                <input
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="Phone number"
                  inputMode="tel"
                  className="w-full px-3 py-2.5 rounded-xl bg-[#111a2c] border border-[#22304a] text-base tabular-nums"
                />
                <input
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="Email (optional)"
                  inputMode="email"
                  className="w-full px-3 py-2.5 rounded-xl bg-[#111a2c] border border-[#22304a] text-base"
                />
                <input
                  value={newCompany}
                  onChange={(e) => setNewCompany(e.target.value)}
                  placeholder="Company (optional)"
                  className="w-full px-3 py-2.5 rounded-xl bg-[#111a2c] border border-[#22304a] text-base"
                />
              </div>
              {saveContactError && <p className="text-sm font-medium text-red-400 mb-3 text-center">{saveContactError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => setShowAddContact(false)}
                  className="flex-1 py-2.5 rounded-xl bg-[#111a2c] border border-[#22304a] text-white font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={saveNewContact}
                  disabled={savingContact}
                  className="flex-1 py-2.5 rounded-xl bg-blue-500 disabled:opacity-50 text-white font-semibold"
                >
                  {savingContact ? 'Saving…' : 'Save Contact'}
                </button>
              </div>
            </div>
          )}

          {tab === 'contacts' && callState === 'idle' && !showAddContact && (
            <div className="pt-2">
              {businessKey !== 'unique' && (
                <button onClick={openAddContact} className="w-full mb-2 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-semibold">
                  ＋ Add Contact
                </button>
              )}
              {deviceContactsSupported && (
                <button onClick={importFromPhone} className="w-full mb-3 py-2.5 rounded-xl bg-[#111a2c] border border-[#22304a] text-sm font-medium">
                  📱 Import from phone contacts
                </button>
              )}
              {contactsLoading && <p className="text-sm text-slate-500 text-center py-8">Loading contacts…</p>}
              {contacts?.length === 0 && !contactsLoading && (
                <p className="text-sm text-slate-500 text-center py-8">
                  {businessKey === 'unique' ? 'Unique Group Inc. has no CRM contacts.' : 'No contacts with a phone number yet.'}
                </p>
              )}
              <div className="space-y-1 max-h-[26rem] overflow-y-auto">
                {contacts?.map((c) => (
                  <button
                    key={c.personId}
                    onClick={() => goToDial(c.phone, c.name)}
                    className="w-full text-left px-4 py-3.5 rounded-xl bg-[#111a2c] border border-[#22304a] flex items-center justify-between"
                  >
                    <span>
                      <span className="block text-lg font-semibold text-white">{c.name}</span>
                      <span className="block text-base font-medium text-slate-300 tabular-nums">{c.companyName ?? c.phone}</span>
                      {c.companyName && <span className="block text-base font-medium text-slate-400 tabular-nums">{c.phone}</span>}
                    </span>
                    <span className="text-emerald-500 text-3xl">📞</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {tab === 'internal' && callState === 'idle' && (
            <div className="pt-2">
              <p className="text-sm font-medium text-slate-400 mb-3 text-center">
                Ring another Bario Dialer app directly over the internet — no phone number, no carrier charges, just wifi or data.
              </p>
              <div className="space-y-1">
                {BUSINESSES.filter((b) => b.key !== businessKey).map((b) => (
                  <button
                    key={b.key}
                    onClick={() => placeInternalCall(b.key)}
                    className="w-full text-left px-4 py-3.5 rounded-xl bg-[#111a2c] border border-[#22304a] flex items-center justify-between"
                  >
                    <span>
                      <span className="block text-lg font-semibold text-white">{b.label}</span>
                      <span className="block text-sm font-medium text-slate-400">Internal app call</span>
                    </span>
                    <span className="text-emerald-500 text-3xl">📞</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {tab === 'recents' && callState === 'idle' && (
            <div className="pt-2">
              {recentsLoading && <p className="text-sm text-slate-500 text-center py-8">Loading…</p>}
              {recents?.length === 0 && !recentsLoading && <p className="text-sm text-slate-500 text-center py-8">No calls yet.</p>}
              <div className="space-y-1 max-h-[30rem] overflow-y-auto">
                {recents?.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => goToDial(r.to_number.startsWith('internal:') || r.to_number.startsWith('client:') ? undefined : r.to_number, r.contact_name)}
                    className="w-full text-left px-4 py-3.5 rounded-xl bg-[#111a2c] border border-[#22304a] flex items-center justify-between"
                  >
                    <span>
                      <span className="block text-lg font-semibold text-white">{r.contact_name ?? r.to_number}</span>
                      {r.contact_name && <span className="block text-base font-medium text-slate-300 tabular-nums">{r.to_number}</span>}
                      <span className="block text-sm font-medium text-slate-500">
                        {new Date(r.started_at).toLocaleString()} · {r.status}
                        {r.duration_seconds != null ? ` · ${Math.floor(r.duration_seconds / 60)}:${String(r.duration_seconds % 60).padStart(2, '0')}` : ''}
                      </span>
                    </span>
                    <span className="text-emerald-500 text-3xl">📞</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {(callState === 'requesting' || callState === 'ringing') && (
            <div className="text-center py-6">
              <p className="text-base font-medium text-slate-400 mb-2">{callState === 'requesting' ? 'Connecting…' : 'Ringing…'}</p>
              <p className="text-3xl font-bold text-white mb-8 tabular-nums">{activeContactName ?? number}</p>
              <div className="flex justify-center">
                <button
                  onClick={() => endCall('cancelled')}
                  aria-label="End call"
                  className="w-20 h-20 rounded-full bg-red-600 flex items-center justify-center text-4xl shadow-lg shadow-red-600/20"
                >
                  <span className="inline-block rotate-[135deg]">📞</span>
                </button>
              </div>
            </div>
          )}

          {callState === 'incoming' && (
            <div className="text-center py-6">
              <p className="text-base font-medium text-slate-400 mb-2">Incoming call</p>
              <p className="text-3xl font-bold text-white mb-8 tabular-nums">{activeContactName ?? 'Unknown caller'}</p>
              <div className="flex gap-6 justify-center">
                <button
                  onClick={declineIncomingCall}
                  aria-label="Decline call"
                  className="w-20 h-20 rounded-full bg-red-600 flex items-center justify-center text-4xl shadow-lg shadow-red-600/20"
                >
                  <span className="inline-block rotate-[135deg]">📞</span>
                </button>
                <button
                  onClick={acceptIncomingCall}
                  aria-label="Accept call"
                  className="w-20 h-20 rounded-full bg-emerald-600 flex items-center justify-center text-4xl shadow-lg shadow-emerald-600/20"
                >
                  📞
                </button>
              </div>
            </div>
          )}

          {callState === 'in-call' && (
            <div className="text-center py-6">
              <p className="text-base font-medium text-slate-400 mb-2">In call with</p>
              <p className="text-3xl font-bold text-white mb-1 tabular-nums">{activeContactName ?? number}</p>
              <p className="text-4xl font-bold font-mono mb-8 tabular-nums">{mm}:{ss}</p>
              {!speakerOn && (
                <p className="text-xs text-amber-400 mb-3 max-w-xs mx-auto">
                  🔈 Speaker is off — on a phone, audio plays through the earpiece only. Tap Speaker below if you can&apos;t hear the other party.
                </p>
              )}
              {callWarning && (
                <p className="text-xs text-red-400 mb-3">⚠ Call quality warning: {callWarning}</p>
              )}
              <div className="flex gap-3 justify-center mb-6">
                <button onClick={toggleSpeaker} className={`px-5 py-4 rounded-xl text-lg font-semibold ${speakerOn ? 'bg-blue-500 text-white' : 'bg-[#111a2c] border border-[#22304a] text-white'}`}>
                  {speakerOn ? '🔊 Speaker' : '🔈 Speaker'}
                </button>
                <button onClick={toggleMute} className={`px-5 py-4 rounded-xl text-lg font-semibold ${muted ? 'bg-amber-500 text-black' : 'bg-[#111a2c] border border-[#22304a] text-white'}`}>
                  {muted ? 'Unmute' : 'Mute'}
                </button>
              </div>
              <div className="flex justify-center">
                <button
                  onClick={() => endCall('completed')}
                  aria-label="Hang up"
                  className="w-20 h-20 rounded-full bg-red-600 flex items-center justify-center text-4xl shadow-lg shadow-red-600/20"
                >
                  <span className="inline-block rotate-[135deg]">📞</span>
                </button>
              </div>
            </div>
          )}

          {callState === 'ended' && (
            <p className="text-center text-base text-slate-500 py-6">Call ended.</p>
          )}
        </div>

        {!inCallView && (
          <div className="grid grid-cols-4 gap-2 pt-4 mt-4 border-t border-[#1a2438] shrink-0">
            {([['dial', '🔢', 'Dial'], ['contacts', '👤', 'Contacts'], ['internal', '🌐', 'Internal'], ['recents', '🕑', 'Recents']] as const).map(([key, icon, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex flex-col items-center gap-1 py-3 rounded-2xl border transition-colors ${
                  tab === key
                    ? 'bg-gradient-to-r from-cyan-400/20 to-blue-500/20 border-blue-400 text-blue-300'
                    : 'bg-[#111a2c] border-[#22304a] text-slate-300'
                }`}
              >
                <span className="text-3xl leading-none">{icon}</span>
                <span className="text-sm font-semibold">{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
