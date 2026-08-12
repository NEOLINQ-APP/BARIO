import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// Drop-in replacement for @vercel/blob's put()/del(), same call shape, so
// the ~19 call sites across the app only need a one-line import swap.
// Backblaze B2's S3-compatible API is the real backend -- see
// C:\Users\surew\.claude\plans\eventual-wandering-backus.md for why
// (Vercel Blob's $0.05/GB egress fee is the real cost driver for a
// file-storage product; B2 is ~70% cheaper on storage and free on egress
// when read through Cloudflare).
//
// Every object here is written with public-read semantics to match every
// existing consumer, which stores the resulting URL directly in DB columns
// and inline inside rendered HTML/JSON blobs (site content, chat history) --
// those can't be refreshed with a signed URL on every render, so public
// reads (via a Cloudflare-fronted custom domain) is the correct choice here,
// not a corner cut.

const BUCKET = process.env.B2_BUCKET_NAME!
const PUBLIC_BASE = process.env.B2_PUBLIC_BASE_URL || `https://${process.env.B2_BUCKET_NAME}.${process.env.B2_ENDPOINT}`

let _client: S3Client | undefined
function client(): S3Client {
  if (!_client) {
    _client = new S3Client({
      endpoint: `https://${process.env.B2_ENDPOINT}`,
      region: 'auto',
      credentials: {
        accessKeyId: process.env.B2_KEY_ID!,
        secretAccessKey: process.env.B2_APPLICATION_KEY!,
      },
    })
  }
  return _client
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10)
}

export type PutOptions = {
  access: 'public'
  addRandomSuffix?: boolean
  contentType?: string
}

export type PutResult = { url: string; pathname: string }

// Mirrors @vercel/blob's put(pathname, body, opts) signature closely enough
// that call sites barely change. addRandomSuffix defaults to true, same as
// Vercel Blob's own default, to avoid same-name collisions.
export async function put(pathname: string, body: Buffer | Uint8Array | ArrayBuffer | Blob | string, opts: PutOptions): Promise<PutResult> {
  const wantsSuffix = opts.addRandomSuffix !== false
  let key = pathname.replace(/^\/+/, '')
  if (wantsSuffix) {
    const lastDot = key.lastIndexOf('.')
    const suffix = randomSuffix()
    key = lastDot === -1 ? `${key}-${suffix}` : `${key.slice(0, lastDot)}-${suffix}${key.slice(lastDot)}`
  }

  let bytes: Uint8Array
  if (body instanceof Blob) {
    bytes = new Uint8Array(await body.arrayBuffer())
  } else if (body instanceof ArrayBuffer) {
    bytes = new Uint8Array(body)
  } else if (typeof body === 'string') {
    bytes = new TextEncoder().encode(body)
  } else {
    bytes = body
  }

  await client().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: bytes,
      ContentType: opts.contentType,
    })
  )

  return { url: `${PUBLIC_BASE}/${key}`, pathname: key }
}

export type PresignedUploadOptions = {
  addRandomSuffix?: boolean
  contentType?: string
  expiresInSeconds?: number
}

export type PresignedUploadResult = { uploadUrl: string; url: string; pathname: string }

// Replaces @vercel/blob/client's handleUpload() token flow -- the browser
// PUTs the file bytes directly to the returned uploadUrl (no auth header
// needed, the signature is embedded in the URL), then uses `url` as the
// permanent public URL, same as every other consumer in this file expects.
export async function createPresignedUploadUrl(pathname: string, opts: PresignedUploadOptions = {}): Promise<PresignedUploadResult> {
  const wantsSuffix = opts.addRandomSuffix !== false
  let key = pathname.replace(/^\/+/, '')
  if (wantsSuffix) {
    const lastDot = key.lastIndexOf('.')
    const suffix = randomSuffix()
    key = lastDot === -1 ? `${key}-${suffix}` : `${key.slice(0, lastDot)}-${suffix}${key.slice(lastDot)}`
  }

  const uploadUrl = await getSignedUrl(
    client(),
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: opts.contentType }),
    { expiresIn: opts.expiresInSeconds ?? 300 }
  )

  return { uploadUrl, url: `${PUBLIC_BASE}/${key}`, pathname: key }
}

// Accepts either a full URL (matching @vercel/blob's del(url) signature) or
// a bare key. Until Phase 2 migrates existing objects, DB rows can still
// hold pre-migration vercel-storage.com URLs -- those must still route to
// the old Vercel Blob del(), or the delete would silently no-op against B2
// (wrong backend) and leave the real file orphaned on Vercel forever.
export async function del(urlOrKey: string): Promise<void> {
  if (urlOrKey.includes('vercel-storage.com')) {
    const { del: vercelDel } = await import('@vercel/blob')
    await vercelDel(urlOrKey)
    return
  }
  const key = urlOrKey.startsWith('http') ? urlOrKey.slice(urlOrKey.indexOf(BUCKET) + BUCKET.length + 1) : urlOrKey.replace(/^\/+/, '')
  await client().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: decodeURIComponent(key) }))
}
