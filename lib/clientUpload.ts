'use client'

// Client-side direct-to-storage upload, replacing @vercel/blob/client's
// upload(). Same two-step shape (ask the server for a token/URL, then PUT
// the file straight to storage from the browser) but hits our own presigned
// B2 URL endpoint instead of Vercel's.
export async function uploadFile(file: File, opts: { handleUploadUrl?: string } = {}): Promise<{ url: string }> {
  const tokenRes = await fetch(opts.handleUploadUrl ?? '/api/sites/upload-asset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, contentType: file.type || 'application/octet-stream', size: file.size }),
  })
  if (!tokenRes.ok) {
    const err = await tokenRes.json().catch(() => ({}))
    throw new Error(err.error || 'Upload failed')
  }
  const { uploadUrl, url } = await tokenRes.json()

  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  })
  if (!putRes.ok) throw new Error('Upload failed')

  return { url }
}
