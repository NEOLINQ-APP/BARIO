import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// Server-side symmetric encryption for secrets Bario's own backend needs to
// use later (a customer's Twenty CRM API key, called on their behalf by
// /api/flo/v1/* and the Social Dispatcher's lead sync) — NOT the same model
// as lib/e2eCrypto.ts, which deliberately keeps plaintext away from the
// server entirely. That model doesn't fit here: something server-side has
// to actually present this key to Twenty's GraphQL API on the customer's
// behalf, so "the server never sees plaintext" isn't achievable — the best
// available protection is encryption at rest with a key that only lives in
// the deployment's env vars, never in the database.
function getKey(): Buffer {
  const b64 = process.env.FLO_API_ENCRYPTION_KEY
  if (!b64) throw new Error('FLO_API_ENCRYPTION_KEY is not set')
  const key = Buffer.from(b64, 'base64')
  if (key.length !== 32) throw new Error('FLO_API_ENCRYPTION_KEY must decode to exactly 32 bytes (openssl rand -base64 32)')
  return key
}

export function encryptSecret(plaintext: string): { ciphertext: string; iv: string } {
  const iv = randomBytes(12) // AES-GCM standard nonce size
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  // Store ciphertext + authTag together (authTag appended) — one column
  // instead of two, since GCM's tag is meaningless without its ciphertext.
  return { ciphertext: Buffer.concat([encrypted, authTag]).toString('base64'), iv: iv.toString('base64') }
}

export function decryptSecret(ciphertextB64: string, ivB64: string): string {
  const combined = Buffer.from(ciphertextB64, 'base64')
  const authTag = combined.subarray(combined.length - 16)
  const encrypted = combined.subarray(0, combined.length - 16)
  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}
