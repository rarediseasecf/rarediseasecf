/**
 * Magic-byte sniff for PDF / PNG / JPEG uploads (Day 10).
 * Complements MIME checks — client Content-Type alone is not enough.
 */
export type SniffedDocumentKind = 'pdf' | 'png' | 'jpeg'

export function sniffDocumentBuffer(
  buffer: Buffer
): SniffedDocumentKind | null {
  if (buffer.length < 4) return null
  // %PDF
  if (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return 'pdf'
  }
  // PNG
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'png'
  }
  // JPEG SOI
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg'
  }
  return null
}

export function mimeMatchesSniff(
  mime: string,
  kind: SniffedDocumentKind
): boolean {
  if (kind === 'pdf') return mime === 'application/pdf'
  if (kind === 'png') return mime === 'image/png'
  if (kind === 'jpeg') return mime === 'image/jpeg'
  return false
}
