// Geocoding + arrival-detection for Bario One field tracking. Uses OSM's
// free Nominatim geocoder rather than Google Maps -- no API key/billing
// setup exists yet for this in Bario's own Vercel env (Google Maps keys
// found elsewhere, e.g. spott.ca's, belong to a different app/billing
// account and shouldn't be borrowed across products). Nominatim's usage
// policy requires a real identifying User-Agent and caps at ~1 req/sec,
// which is trivially fine here since an address is only ever geocoded
// once per appointment (cached onto bo_appointments.service_lat/lng), not
// on every location ping.
const ARRIVAL_RADIUS_METERS = 150
const NOMINATIM_USER_AGENT = 'BarioOneFieldTracking/1.0 (https://bario.ca; support@bario.ca)'

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!address.trim()) return null
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`
    const res = await fetch(url, { headers: { 'User-Agent': NOMINATIM_USER_AGENT }, signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const results = (await res.json()) as { lat: string; lon: string }[]
    const first = results[0]
    if (!first) return null
    return { lat: parseFloat(first.lat), lng: parseFloat(first.lon) }
  } catch (err) {
    console.error('geocodeAddress failed', err)
    return null
  }
}

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function hasArrived(driverLat: number, driverLng: number, serviceLat: number, serviceLng: number): boolean {
  return haversineMeters(driverLat, driverLng, serviceLat, serviceLng) <= ARRIVAL_RADIUS_METERS
}
