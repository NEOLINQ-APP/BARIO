import type { User } from './db'
import { STORAGE_TIERS, isStorageTierKey, type StorageTierKey } from './storageTiers'

export type EffectiveStorage = {
  tier: StorageTierKey
  limitBytes: number
  usedBytes: number
  ownerId: string
  memberIds: string[]
}

// A user's effective storage tier/usage: their own, unless they belong to a
// family group, in which case the group draws from a single pooled quota
// sized off the *owner's* subscribed tier (members don't need their own
// paid tier — that's the point of family sharing).
export async function getEffectiveStorage(sql: any, user: User): Promise<EffectiveStorage> {
  let ownerUser = user
  let memberIds = [user.id]

  if (user.family_group_id) {
    const members = (await sql`SELECT * FROM users WHERE family_group_id = ${user.family_group_id}`) as User[]
    if (members.length > 0) {
      memberIds = members.map((m) => m.id)
      const groupRows = (await sql`SELECT owner_user_id FROM family_groups WHERE id = ${user.family_group_id}`) as { owner_user_id: string }[]
      const owner = members.find((m) => m.id === groupRows[0]?.owner_user_id)
      if (owner) ownerUser = owner
    }
  }

  const tier: StorageTierKey = isStorageTierKey(ownerUser.storage_tier) ? ownerUser.storage_tier : 'free'
  const limitBytes = STORAGE_TIERS[tier].bytes

  // Members are capped at 5, so summing per-id rather than a single IN/ANY
  // query avoids relying on this driver's array-parameter binding.
  let usedBytes = 0
  for (const id of memberIds) {
    const rows = (await sql`SELECT COALESCE(SUM(size_bytes), 0) AS total FROM media_assets WHERE user_id = ${id}`) as { total: string | number }[]
    usedBytes += Number(rows[0]?.total ?? 0)
  }

  return { tier, limitBytes, usedBytes, ownerId: ownerUser.id, memberIds }
}
