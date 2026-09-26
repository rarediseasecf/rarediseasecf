import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_COVER_IMAGE_BYTES,
  sanitizeCoverImage,
  stripJpegMetadata,
  stripPngMetadata,
} from './coverImage.js'

function jpegSegment(marker: number, payload: string): Buffer {
  const body = Buffer.from(payload, 'latin1')
  const len = Buffer.alloc(2)
  len.writeUInt16BE(body.length + 2)
  return Buffer.concat([Buffer.from([0xff, marker]), len, body])
}

function buildJpeg(): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    jpegSegment(0xe0, 'JFIF\0keep'),
    jpegSegment(0xe1, 'Exif\0\0GPSLatitude=27.7'),
    jpegSegment(0xed, 'Photoshop IPTC author'),
    jpegSegment(0xfe, 'comment: patient name'),
    jpegSegment(0xdb, 'quant-table'),
    jpegSegment(0xda, 'scan-header'),
    Buffer.from('entropy-coded-data', 'latin1'),
    Buffer.from([0xff, 0xd9]),
  ])
}

function pngChunk(type: string, data: string): Buffer {
  const body = Buffer.from(data, 'latin1')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(body.length)
  return Buffer.concat([len, Buffer.from(type, 'latin1'), body, Buffer.alloc(4)])
}

function buildPng(): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', 'header-bytes!'),
    pngChunk('tEXt', 'Author\0Jane Doe'),
    pngChunk('eXIf', 'GPSLatitude'),
    pngChunk('IDAT', 'pixels'),
    pngChunk('IEND', ''),
  ])
}

describe('cover image metadata stripping', () => {
  it('drops EXIF/GPS, IPTC and comments from JPEG but keeps image data', () => {
    const out = stripJpegMetadata(buildJpeg()).toString('latin1')
    assert.doesNotMatch(out, /GPSLatitude|Photoshop|patient name/)
    assert.match(out, /JFIF/)
    assert.match(out, /quant-table/)
    assert.match(out, /entropy-coded-data/)
  })

  it('drops text and eXIf chunks from PNG but keeps IHDR/IDAT/IEND', () => {
    const out = stripPngMetadata(buildPng()).toString('latin1')
    assert.doesNotMatch(out, /Jane Doe|GPSLatitude/)
    assert.match(out, /IHDR/)
    assert.match(out, /IDAT/)
    assert.match(out, /IEND/)
  })

  it('rejects PDFs, mismatched MIME, truncated and oversized files', () => {
    const pdf = Buffer.from('%PDF-1.4 not an image')
    assert.throws(() => sanitizeCoverImage({ mimetype: 'image/png', buffer: pdf }))
    assert.throws(() =>
      sanitizeCoverImage({ mimetype: 'image/png', buffer: buildJpeg() })
    )
    assert.throws(() =>
      sanitizeCoverImage({ mimetype: 'image/png', buffer: buildPng().subarray(0, 30) })
    )
    const huge = Buffer.concat([buildPng(), Buffer.alloc(MAX_COVER_IMAGE_BYTES)])
    assert.throws(() => sanitizeCoverImage({ mimetype: 'image/png', buffer: huge }))
  })

  it('accepts a valid JPEG and reports its content type', () => {
    const result = sanitizeCoverImage({ mimetype: 'image/jpeg', buffer: buildJpeg() })
    assert.equal(result.contentType, 'image/jpeg')
  })
})
