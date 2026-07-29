import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'

// AES-256-GCM via Node's built-in crypto — no new dependency, matches
// lib/e2eCrypto.ts's preference for platform crypto over a library. The
// root password Hetzner returns (only when no SSH key was supplied) is
// encrypted immediately on write and never stored in plaintext. The actual
// one-time-reveal guarantee — nulling the ciphertext column the moment it's
// decrypted — is enforced by the reveal-password route's own UPDATE, not by
// this module; these are pure encrypt/decrypt helpers.

function getKey(): Buffer {
  const hex = process.env.VPS_PASSWORD_ENCRYPTION_KEY
  if (!hex) throw new Error('VPS_PASSWORD_ENCRYPTION_KEY is not set')
  const key = Buffer.from(hex, 'hex')
  if (key.length !== 32) throw new Error('VPS_PASSWORD_ENCRYPTION_KEY must be 32 bytes (64 hex characters)')
  return key
}

export function encryptPassword(plaintext: string): { ciphertext: string; iv: string } {
  const key = getKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return { ciphertext: Buffer.concat([encrypted, authTag]).toString('base64'), iv: iv.toString('base64') }
}

export function decryptPassword(ciphertext: string, iv: string): string {
  const key = getKey()
  const combined = Buffer.from(ciphertext, 'base64')
  const authTag = combined.subarray(combined.length - 16)
  const encrypted = combined.subarray(0, combined.length - 16)
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'))
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}
