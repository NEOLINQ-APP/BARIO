const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY

/**
 * Searches Unsplash for a real photo matching the query and returns a
 * ready-to-use image URL, or null if no key is configured, nothing matched,
 * or the request failed. Callers should fall back to a placeholder on null.
 */
export async function searchImage(query: string): Promise<string | null> {
  if (!UNSPLASH_ACCESS_KEY || !query.trim()) return null

  try {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape&content_filter=high`,
      { headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` } }
    )
    if (!res.ok) return null

    const data = await res.json()
    const photo = data.results?.[0]
    if (!photo?.urls?.regular) return null

    return `${photo.urls.regular}&w=1200&q=80`
  } catch {
    return null
  }
}
