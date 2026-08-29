const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY

export type ImageSearchOptions = {
  /** Unsplash search orientation. Use 'squarish' for headshots/avatars that
   *  get displayed in a circle — a landscape photo cropped into a small
   *  circle tends to cut off the top of the head or miss the face. */
  orientation?: 'landscape' | 'portrait' | 'squarish'
  /** Bias the crop toward detected faces rather than the image center.
   *  Only meaningful for people photos (team headshots). */
  faceCrop?: boolean
}

/**
 * Searches Unsplash for a real photo matching the query and returns a
 * ready-to-use image URL, or null if no key is configured, nothing matched,
 * or the request failed. Callers should fall back to a placeholder on null.
 */
export async function searchImage(query: string, options: ImageSearchOptions = {}): Promise<string | null> {
  if (!UNSPLASH_ACCESS_KEY || !query.trim()) return null

  const orientation = options.orientation ?? 'landscape'

  try {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=${orientation}&content_filter=high`,
      { headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` } }
    )
    if (!res.ok) return null

    const data = await res.json()
    const photo = data.results?.[0]
    if (!photo?.urls?.raw) return null

    // Required by Unsplash's API guidelines: any time a photo is actually
    // used (a generated site permanently embedding it counts), ping the
    // download-tracking endpoint the photo's own response gives you — this
    // is how they attribute real usage/views back to the photographer.
    // Fire-and-forget: tracking must never block or fail the actual image
    // resolution the caller is waiting on.
    if (photo.links?.download_location) {
      fetch(photo.links.download_location, { headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` } }).catch(() => {})
    }

    // Build sizing/crop params explicitly against the raw (untransformed)
    // image rather than appending onto the pre-built "regular" URL, which
    // already has its own w/q params and would just get a second,
    // conflicting set tacked on.
    const params = new URLSearchParams({
      w: options.faceCrop ? '400' : '1200',
      q: '80',
      fit: 'crop',
      crop: options.faceCrop ? 'faces,entropy' : 'entropy',
    })
    if (options.faceCrop) params.set('ar', '1:1')

    return `${photo.urls.raw}&${params.toString()}`
  } catch {
    return null
  }
}
