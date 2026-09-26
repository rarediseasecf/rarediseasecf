/**
 * Local demo file storage for case documents — never S3 in MVP.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { AppError } from '../errors.js'
import {
  ALLOWED_DOCUMENT_EXT,
  ALLOWED_DOCUMENT_MIME,
  MAX_DOCUMENT_BYTES,
  type DocumentType,
} from './documentTypes.js'
import { mimeMatchesSniff, sniffDocumentBuffer } from './documentSniff.js'
import {
  decryptBuffer,
  encryptBuffer,
  isEncryptedBuffer,
  type EncryptionKeyMaterial,
} from '../security/encryption.js'

export function resolveUploadRoot(envDir?: string): string {
  const root = envDir?.trim() || path.join(process.cwd(), 'data', 'case-uploads')
  return path.resolve(root)
}

export function sanitizeOriginalFilename(name: string): string {
  const base = path.basename(name).replace(/[^\w.\-()+ ]+/g, '_')
  return base.slice(0, 180) || 'document'
}

export function extensionForMime(mime: string, originalName: string): string {
  const fromName = path.extname(originalName).toLowerCase()
  if (ALLOWED_DOCUMENT_EXT.has(fromName)) return fromName
  if (mime === 'application/pdf') return '.pdf'
  if (mime === 'image/png') return '.png'
  if (mime === 'image/jpeg') return '.jpg'
  return ''
}

export function assertAllowedUpload(file: {
  mimetype: string
  size: number
  originalname: string
}): void {
  if (!ALLOWED_DOCUMENT_MIME.has(file.mimetype)) {
    throw new AppError(
      'INVALID_DOCUMENT_TYPE',
      'Only PDF, PNG, and JPG documents are accepted.',
      400
    )
  }
  if (file.size <= 0 || file.size > MAX_DOCUMENT_BYTES) {
    throw new AppError(
      'INVALID_DOCUMENT_SIZE',
      'Each document must be between 1 byte and 5 MB.',
      400
    )
  }
  const ext = extensionForMime(file.mimetype, file.originalname)
  if (!ext) {
    throw new AppError(
      'INVALID_DOCUMENT_TYPE',
      'Only PDF, PNG, and JPG documents are accepted.',
      400
    )
  }
}

export async function persistCaseDocumentFile(opts: {
  uploadRoot: string
  caseId: string
  documentType: DocumentType
  originalFilename: string
  mimetype: string
  buffer: Buffer
  encryption: EncryptionKeyMaterial
}): Promise<{
  storageRef: string
  byteSize: number
  contentType: string
  originalFilename: string
}> {
  assertAllowedUpload({
    mimetype: opts.mimetype,
    size: opts.buffer.length,
    originalname: opts.originalFilename,
  })

  const sniffed = sniffDocumentBuffer(opts.buffer)
  if (!sniffed || !mimeMatchesSniff(opts.mimetype, sniffed)) {
    throw new AppError(
      'INVALID_DOCUMENT_CONTENT',
      'File contents must match PDF, PNG, or JPG (magic bytes checked).',
      400
    )
  }

  const caseDir = path.join(opts.uploadRoot, opts.caseId)
  await fs.mkdir(caseDir, { recursive: true })

  const ext = extensionForMime(opts.mimetype, opts.originalFilename)
  const safeName = sanitizeOriginalFilename(opts.originalFilename)
  const token = randomBytes(8).toString('hex')
  const storedName = `${opts.documentType.toLowerCase()}-${token}${ext}`
  const absolute = path.join(caseDir, storedName)
  await fs.writeFile(absolute, encryptBuffer(opts.buffer, opts.encryption), {
    flag: 'wx',
  })

  const storageRef = path.join(opts.caseId, storedName).replace(/\\/g, '/')

  return {
    storageRef,
    byteSize: opts.buffer.length,
    contentType: opts.mimetype,
    originalFilename: safeName,
  }
}

/**
 * Resolve a stored document path under the upload root.
 * Rejects path traversal — storageRef must stay inside uploadRoot.
 */
export function resolveStoredDocumentPath(
  uploadRoot: string,
  storageRef: string
): string {
  const normalized = storageRef.replace(/\\/g, '/').replace(/^\/+/, '')
  if (
    !normalized ||
    normalized.includes('..') ||
    path.isAbsolute(storageRef)
  ) {
    throw new AppError(
      'DOCUMENT_NOT_FOUND',
      'Document file could not be located.',
      404
    )
  }
  const absolute = path.resolve(uploadRoot, normalized)
  const root = path.resolve(uploadRoot)
  if (absolute !== root && !absolute.startsWith(root + path.sep)) {
    throw new AppError(
      'DOCUMENT_NOT_FOUND',
      'Document file could not be located.',
      404
    )
  }
  return absolute
}

export async function readStoredDocumentFile(
  uploadRoot: string,
  storageRef: string,
  encryption: EncryptionKeyMaterial
): Promise<Buffer> {
  const absolute = resolveStoredDocumentPath(uploadRoot, storageRef)
  let data: Buffer
  try {
    data = await fs.readFile(absolute)
  } catch {
    throw new AppError(
      'DOCUMENT_NOT_FOUND',
      'Document file could not be located.',
      404
    )
  }
  // Files uploaded before at-rest encryption are returned as-is.
  return isEncryptedBuffer(data) ? decryptBuffer(data, encryption) : data
}
