import { randomUUID } from 'node:crypto'
import { put } from '@/lib/storage'

// Default X-Drive folder set every account starts with — mirrors the
// familiar top-level categories a Samsung "My Files" app ships with
// (Documents / Pictures / Videos / Audio / Downloads), with business-
// relevant subfolders under Documents and Pictures so uploading an
// invoice or receipt has an obvious home from the first login. Only
// leaf paths are listed: /api/media derives parent folders (e.g.
// "Documents") from any row whose folder starts with that prefix, so
// seeding "Documents/Invoices" is what makes "Documents" itself show up.
export const DEFAULT_XDRIVE_FOLDERS = [
  'Documents/Invoices',
  'Documents/Receipts',
  'Documents/Contracts',
  'Documents/Tax Documents',
  'Pictures/Camera',
  'Pictures/Screenshots',
  'Pictures/Logos & Branding',
  'Videos',
  'Audio',
  'Downloads',
]

// Drops a small starter note into one folder so it shows up ready-made —
// folders in media_assets are just path prefixes on real rows (see
// /api/media), there's no way to persist an empty one otherwise. Shared by
// signup (new accounts) and the admin seed-folder route (existing accounts).
export async function seedOneXDriveFolder(sql: any, userId: string, folder: string, note?: string) {
  const text = note?.trim() || 'This folder is ready — upload your first file and feel free to delete this note.'
  const filename = 'Start here.txt'
  const blob = await put(`media/${userId}/${folder}/${filename}`, new Blob([text], { type: 'text/plain' }), {
    access: 'public',
    addRandomSuffix: true,
  })
  const id = randomUUID()
  await sql`
    INSERT INTO media_assets (id, user_id, folder, filename, url, content_type, size_bytes)
    VALUES (${id}, ${userId}, ${folder}, ${filename}, ${blob.url}, 'text/plain', ${text.length})
  `
}

// Seeds the full default set onto a brand-new account. Failures are
// swallowed per-folder (non-fatal, same posture as the verification email
// in /api/auth/signup) — a hiccup organizing X-Drive shouldn't block signup.
export async function seedDefaultXDriveFolders(sql: any, userId: string) {
  for (const folder of DEFAULT_XDRIVE_FOLDERS) {
    try {
      await seedOneXDriveFolder(sql, userId, folder)
    } catch (err) {
      console.error(`Failed to seed default X-Drive folder "${folder}" for user ${userId}`, err)
    }
  }
}
