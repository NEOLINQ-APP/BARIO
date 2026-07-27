// Client-side-only crypto for X-Drive end-to-end encryption. Everything here
// runs in the browser via the Web Crypto API — the server only ever stores
// opaque, already-encrypted bytes (ciphertext ArrayBuffers, wrapped keys,
// salts, IVs) and has no code path that could derive or reconstruct a
// plaintext key. That's what makes this "true" E2E rather than
// encrypted-at-rest: BARIO staff, admin tools, and a database breach all see
// the same ciphertext a stranger would.
//
// Key hierarchy:
//   passphrase --PBKDF2--> KEK  --unwraps-->  MEK  <--wraps--  recovery code --PBKDF2--> recovery KEK
// MEK (master encryption key) is a random AES-256 key, generated once,
// never sent anywhere in plaintext. It directly encrypts/decrypts file
// bytes (one random IV per file). Both the passphrase and the recovery code
// are independent ways to unwrap the same MEK — either one lost is fine,
// losing both means the MEK (and every encrypted file) is gone forever.

const PBKDF2_ITERATIONS = 600_000 // OWASP 2023 minimum recommendation for PBKDF2-SHA256

function toB64(buf: ArrayBufferLike): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}
function fromB64(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

export function randomBytes(len: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(new ArrayBuffer(len)))
}

// Recovery code: 20 random bytes (160 bits) as base32-ish groups, e.g.
// "K7QX-4M2P-9RZT-VC3H-XN8Y". Deliberately not a BIP39 wordlist — that needs
// shipping a 2048-word dictionary just for this one feature; a
// crypto-random alphanumeric code carries the same entropy with no
// dependency, at the cost of being less "memorable" (it's meant to be
// written down, not memorized, so that's an acceptable trade).
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // no 0/O/1/I/L — avoids visual ambiguity when handwritten
export function generateRecoveryCode(): string {
  const bytes = randomBytes(20)
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
    if ((i + 1) % 4 === 0 && i !== bytes.length - 1) out += '-'
  }
  return out
}

async function deriveKek(secret: string, saltB64: string): Promise<CryptoKey> {
  const salt = fromB64(saltB64)
  const baseKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey']
  )
}

export function generateSalt(): string {
  return toB64(randomBytes(16).buffer)
}

export async function generateMek(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
}

export async function wrapMek(mek: CryptoKey, secret: string, saltB64: string): Promise<{ wrapped: string; iv: string }> {
  const kek = await deriveKek(secret, saltB64)
  const iv = randomBytes(12)
  const wrapped = await crypto.subtle.wrapKey('raw', mek, kek, { name: 'AES-GCM', iv })
  return { wrapped: toB64(wrapped), iv: toB64(iv.buffer) }
}

export async function unwrapMek(wrappedB64: string, ivB64: string, secret: string, saltB64: string): Promise<CryptoKey> {
  const kek = await deriveKek(secret, saltB64)
  const iv = new Uint8Array(fromB64(ivB64))
  return crypto.subtle.unwrapKey(
    'raw',
    fromB64(wrappedB64),
    kek,
    { name: 'AES-GCM', iv },
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export async function encryptFile(file: File, mek: CryptoKey): Promise<{ blob: Blob; iv: string }> {
  const iv = randomBytes(12)
  const plaintext = await file.arrayBuffer()
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, mek, plaintext)
  return { blob: new Blob([ciphertext], { type: 'application/octet-stream' }), iv: toB64(iv.buffer) }
}

export async function decryptToBlob(ciphertext: ArrayBuffer, ivB64: string, mek: CryptoKey, contentType: string): Promise<Blob> {
  const iv = new Uint8Array(fromB64(ivB64))
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, mek, ciphertext)
  return new Blob([plaintext], { type: contentType })
}

// Session-only holder for the unwrapped MEK — deliberately never persisted
// (no localStorage/sessionStorage/cookie). Lost on tab close or refresh,
// same as any password manager's "unlocked" state; the whole point of E2E
// is that nothing durable holds the plaintext key outside the user's head
// (passphrase) or their written-down recovery code.
let unlockedMek: CryptoKey | null = null
export function setUnlockedMek(mek: CryptoKey | null) {
  unlockedMek = mek
}
export function getUnlockedMek(): CryptoKey | null {
  return unlockedMek
}
