// @mention parsing for Bario One CRM comments. Tokens are the email
// local-part (the bit before @) of an org member -- e.g. "@sherwin" for
// sherwin@bario.ca -- since that's the only human-readable identifier
// available (no separate username field exists anywhere in this app).
const MENTION_TOKEN_RE = /@([a-zA-Z0-9._-]+)/g

export function extractMentionTokens(body: string): string[] {
  const tokens = new Set<string>()
  Array.from(body.matchAll(MENTION_TOKEN_RE)).forEach((match) => {
    tokens.add(match[1].toLowerCase())
  })
  return Array.from(tokens)
}

// Resolves @tokens against org members only (never cross-org) -- a token
// that doesn't match any member's email local-part is silently dropped,
// not treated as an error, since free text legitimately contains '@'
// (email addresses pasted into a comment, for instance).
export function parseMentions(body: string, orgMembers: { userId: string | null; email: string | null }[]): string[] {
  const tokens = extractMentionTokens(body)
  if (tokens.length === 0) return []

  const byLocalPart = new Map<string, string>()
  for (const m of orgMembers) {
    if (!m.userId || !m.email) continue
    const localPart = m.email.split('@')[0]?.toLowerCase()
    if (localPart) byLocalPart.set(localPart, m.userId)
  }

  const resolved = new Set<string>()
  for (const token of tokens) {
    const userId = byLocalPart.get(token)
    if (userId) resolved.add(userId)
  }
  return Array.from(resolved)
}
