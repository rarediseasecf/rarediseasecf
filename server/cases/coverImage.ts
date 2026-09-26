/**
 * Optional public campaign cover photo.
 * PNG/JPG only; EXIF/GPS/XMP/IPTC/text metadata is stripped before storage.
 */
import { randomBytes } from 'node:crypto'
import { AppError } from '../errors.js'
import { writeStoredFile } from '../storage/fileStore.js'
import { sniffDocumentBuffer } from './documentSniff.js'
import {
  encryptBuffer,
  type EncryptionKeyMaterial,
} from '../security/encryption.js'

export const MAX_COVER_IMAGE_BYTES = 5 * 1024 * 1024

export type CoverImageContentType = 'image/png' | 'image/jpeg'

export interface UploadedCoverImage {
  mimetype: string
  buffer: Buffer
}

function invalidImage(): AppError {
  return new AppError(
    'INVALID_COVER_IMAGE',
    'Cover image must be a valid PNG or JPG, 5 MB or smaller.',
    400
  )
}

/** JPEG APPn markers kept: APP0 (JFIF), APP2 (ICC colour profile), APP14 (Adobe colour transform). */
const JPEG_KEEP_APP = new Set([0xe0, 0xe2, 0xee])
const JPEG_SOS = 0xda
const JPEG_COM = 0xfe

export function stripJpegMetadata(input: Buffer): Buffer {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) {
    throw invalidImage()
  }
  const out: Buffer[] = [input.subarray(0, 2)]
  let i = 2
  while (i < input.length) {
    if (input[i] !== 0xff) throw invalidImage()
    while (i < input.length && input[i] === 0xff) i++
    if (i >= input.length) throw invalidImage()
    const marker = input[i]!
    const markerStart = i - 1
    i++
    // Standalone markers carry no length
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      out.push(Buffer.from([0xff, marker]))
      continue
    }
    if (i + 2 > input.length) throw invalidImage()
    const segLen = input.readUInt16BE(i)
    if (segLen < 2 || i + segLen > input.length) throw invalidImage()
    const segEnd = i + segLen
    if (marker === JPEG_SOS) {
      out.push(input.subarray(markerStart, input.length))
      return Buffer.concat(out)
    }
    const isApp = marker >= 0xe0 && marker <= 0xef
    const drop = marker === JPEG_COM || (isApp && !JPEG_KEEP_APP.has(marker))
    if (!drop) out.push(Buffer.from([0xff, marker]), input.subarray(i, segEnd))
    i = segEnd
  }
  throw invalidImage()
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const PNG_DROP_CHUNKS = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME'])

export function stripPngMetadata(input: Buffer): Buffer {
  if (input.length < 8 || !input.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw invalidImage()
  }
  const out: Buffer[] = [PNG_SIGNATURE]
  let i = 8
  let sawHeader = false
  while (i + 12 <= input.length) {
    const len = input.readUInt32BE(i)
    const type = input.toString('latin1', i + 4, i + 8)
    const end = i + 12 + len
    if (end > input.length) throw invalidImage()
    if (!sawHeader && type !== 'IHDR') throw invalidImage()
    sawHeader = true
    if (!PNG_DROP_CHUNKS.has(type)) out.push(input.subarray(i, end))
    i = end
    if (type === 'IEND') return Buffer.concat(out)
  }
  throw invalidImage()
}

/** Validate type + size and return a metadata-free copy. */
export function sanitizeCoverImage(file: UploadedCoverImage): {
  buffer: Buffer
  contentType: CoverImageContentType
} {
  if (file.buffer.length <= 0 || file.buffer.length > MAX_COVER_IMAGE_BYTES) {
    throw invalidImage()
  }
  const kind = sniffDocumentBuffer(file.buffer)
  if (kind === 'png' && file.mimetype === 'image/png') {
    return { buffer: stripPngMetadata(file.buffer), contentType: 'image/png' }
  }
  if (kind === 'jpeg' && file.mimetype === 'image/jpeg') {
    return { buffer: stripJpegMetadata(file.buffer), contentType: 'image/jpeg' }
  }
  throw invalidImage()
}

export async function persistCoverImageFile(opts: {
  uploadRoot: string
  caseId: string
  buffer: Buffer
  contentType: CoverImageContentType
  encryption: EncryptionKeyMaterial
}): Promise<string> {
  const ext = opts.contentType === 'image/png' ? '.png' : '.jpg'
  const storedName = `cover-${randomBytes(8).toString('hex')}${ext}`
  const storageRef = `${opts.caseId}/${storedName}`
  await writeStoredFile(
    opts.uploadRoot,
    storageRef,
    encryptBuffer(opts.buffer, opts.encryption)
  )
  return storageRef
}
