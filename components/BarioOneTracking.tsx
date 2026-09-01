'use client'

import { useEffect, useRef, useState } from 'react'

type Appointment = {
  id: string
  title: string
  location: string | null
  starts_at: string
  status: string
  arrived_at: string | null
  contact_name: string | null
}

type DriverPin = {
  employee_id: string
  employee_name: string
  lat: number
  lng: number
  accuracy_meters: number | null
  updated_at: string
  appointment_id: string | null
  appointment_title: string | null
  appointment_location: string | null
  arrived_at: string | null
  appointment_status: string | null
}

declare global {
  interface Window {
    L: any
  }
}

function loadLeaflet(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.L) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const css = document.createElement('link')
    css.rel = 'stylesheet'
    css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'
    document.head.appendChild(css)

    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load map library'))
    document.body.appendChild(script)
  })
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  return `${Math.floor(seconds / 3600)}h ago`
}

function LiveMap({ drivers }: { drivers: DriverPin[] }) {
  const mapRef = useRef<HTMLDivElement>(null)
  const leafletMapRef = useRef<any>(null)
  const markersRef = useRef<Record<string, any>>({})
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadLeaflet().then(() => {
      if (cancelled || !mapRef.current || leafletMapRef.current) return
      const L = window.L
      leafletMapRef.current = L.map(mapRef.current).setView([53.5461, -113.4938], 11) // Edmonton default
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(leafletMapRef.current)
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!ready || !leafletMapRef.current || !window.L) return
    const L = window.L
    const map = leafletMapRef.current
    const seen = new Set<string>()

    drivers.forEach((d) => {
      seen.add(d.employee_id)
      const popupHtml = `<strong>${d.employee_name}</strong><br/>${
        d.appointment_title ? (d.arrived_at ? `Arrived at ${d.appointment_title}` : `En route to ${d.appointment_title}`) : 'No active job'
      }<br/><span style="color:#888">Updated ${timeAgo(d.updated_at)}</span>`

      if (markersRef.current[d.employee_id]) {
        markersRef.current[d.employee_id].setLatLng([d.lat, d.lng]).setPopupContent(popupHtml)
      } else {
        markersRef.current[d.employee_id] = L.marker([d.lat, d.lng]).addTo(map).bindPopup(popupHtml)
      }
    })

    Object.keys(markersRef.current).forEach((id) => {
      if (!seen.has(id)) {
        map.removeLayer(markersRef.current[id])
        delete markersRef.current[id]
      }
    })

    if (drivers.length > 0) {
      const bounds = L.latLngBounds(drivers.map((d) => [d.lat, d.lng]))
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 })
    }
  }, [ready, drivers])

  return <div ref={mapRef} className="h-[420px] w-full rounded-xl border border-slate-300 dark:border-zinc-800" />
}

function DriverShareControl() {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [sharing, setSharing] = useState(false)
  const [status, setStatus] = useState<string>('')
  const watchIdRef = useRef<number | null>(null)

  useEffect(() => {
    fetch('/api/bario-one/appointments?status=scheduled')
      .then((r) => r.json())
      .then((d) => setAppointments(d.appointments ?? []))
      .catch(() => {})
  }, [])

  function startSharing() {
    if (!selectedId) {
      setStatus('Pick which job you’re heading to first.')
      return
    }
    if (!navigator.geolocation) {
      setStatus('Your browser does not support location sharing.')
      return
    }
    setSharing(true)
    setStatus('Sharing location…')
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        fetch('/api/bario-one/driver/ping', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            appointmentId: selectedId,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          }),
        })
          .then((r) => r.json())
          .then((d) => {
            if (d.justArrived) setStatus('Arrival logged — you’re marked as on site.')
            else setStatus(`Sharing location… last update ${new Date().toLocaleTimeString()}`)
          })
          .catch(() => {})
      },
      () => setStatus('Location permission denied — sharing needs it to work.'),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
    )
  }

  function stopSharing() {
    if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current)
    watchIdRef.current = null
    setSharing(false)
    setStatus('Stopped sharing.')
  }

  useEffect(() => () => stopSharing(), []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4">
      <h2 className="font-semibold mb-2">Share my location</h2>
      <p className="text-sm text-slate-500 dark:text-zinc-400 mb-3">
        Pick the job you're heading to, then start sharing — your location updates automatically while this page stays open, and arrival is logged automatically once you're on site.
      </p>
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          disabled={sharing}
          className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm min-w-[240px]"
        >
          <option value="">Select a job…</option>
          {appointments.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title} — {new Date(a.starts_at).toLocaleString()}
            </option>
          ))}
        </select>
        {!sharing ? (
          <button onClick={startSharing} className="rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-4 py-2">
            Start sharing
          </button>
        ) : (
          <button onClick={stopSharing} className="rounded-lg bg-slate-600 hover:bg-slate-700 text-white text-sm font-medium px-4 py-2">
            Stop sharing
          </button>
        )}
      </div>
      {status && <p className="text-xs text-slate-500 dark:text-zinc-400 mt-2">{status}</p>}
    </div>
  )
}

export default function BarioOneTracking() {
  const [drivers, setDrivers] = useState<DriverPin[] | null>(null)
  const [canViewMap, setCanViewMap] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function poll() {
      try {
        const res = await fetch('/api/bario-one/driver/locations')
        if (res.status === 403) {
          if (!cancelled) setCanViewMap(false)
          return
        }
        const data = await res.json()
        if (!cancelled) setDrivers(data.drivers ?? [])
      } catch {
        // silent — next poll retries
      }
    }
    poll()
    const interval = setInterval(poll, 15000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  return (
    <div className="space-y-6">
      {canViewMap && (
        <div>
          <h2 className="font-semibold mb-2">Live vehicle map</h2>
          {drivers === null ? (
            <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>
          ) : drivers.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-zinc-400">No one is currently sharing their location.</p>
          ) : (
            <LiveMap drivers={drivers} />
          )}
        </div>
      )}
      <DriverShareControl />
    </div>
  )
}
