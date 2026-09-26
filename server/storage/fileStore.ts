/**
 * Encrypted upload storage.
 * BLOB_READ_WRITE_TOKEN set (Vercel) → private Vercel Blob store.
 * Otherwise → local disk under the upload root.
 * Callers pass an already-validated, relative storageRef ("<caseId>/<file>").
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { get, put } from '@vercel/blob'

const BLOB_PREFIX = 'case-uploads'

export function blobStorageEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.BLOB_READ_WRITE_TOKEN?.trim())
}

function blobPathname(storageRef: string): string {
  return `${BLOB_PREFIX}/${storageRef}`
}

export async function writeStoredFile(
  uploadRoot: string,
  storageRef: string,
  data: Buffer
): Promise<void> {
  if (blobStorageEnabled()) {
    await put(blobPathname(storageRef), data, {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: 'application/octet-stream',
    })
    return
  }
  const absolute = path.join(uploadRoot, storageRef)
  await fs.mkdir(path.dirname(absolute), { recursive: true })
  await fs.writeFile(absolute, data, { flag: 'wx' })
}

/** Returns null when the file does not exist. */
export async function readStoredFile(
  uploadRoot: string,
  storageRef: string
): Promise<Buffer | null> {
  if (blobStorageEnabled()) {
    const result = await get(blobPathname(storageRef), {
      access: 'private',
      useCache: false,
    }).catch(() => null)
    if (!result || result.statusCode !== 200) return null
    return Buffer.from(await new Response(result.stream).arrayBuffer())
  }
  try {
    return await fs.readFile(path.join(uploadRoot, storageRef))
  } catch {
    return null
  }
}
