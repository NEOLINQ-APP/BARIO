import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  const routes = ['/', '/hosting', '/vps', '/storage', '/login', '/signup']
  return routes.map((path) => ({
    url: `https://bario.ca${path}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: path === '/' ? 1 : 0.8,
  }))
}
