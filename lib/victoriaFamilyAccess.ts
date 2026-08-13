import type { VictoriaFamilyMember } from '@/lib/db'

// Auth for Victoria's family-member surfaces (chat/upload/voice-token) --
// DB-backed access token instead of an env-var passcode (see
// lib/dialerAccess.ts for that pattern), since tokens here are generated
// per member and need to be creatable/rotatable without a redeploy.
// Deliberately returns the full row (not just true/false) so callers get
// member.key/name for free instead of a second lookup.
export async function verifyFamilyToken(sql: any, memberKey: string | null | undefined, token: string | null | undefined): Promise<VictoriaFamilyMember | null> {
  if (!memberKey || !token) return null
  const rows = (await sql`SELECT * FROM victoria_family_members WHERE key = ${memberKey}`) as unknown as VictoriaFamilyMember[]
  const member = rows[0]
  if (!member || member.access_token !== token) return null
  return member
}
