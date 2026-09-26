/**
 * Unit tests for money parsing, gap calc, email blacklist, and documents.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatMinorUnitsAsUsdc,
  parseUsdcInputToMinorUnits,
  MoneyParseError,
} from '../utils/money.js'
import {
  computeFundingGapMinor,
  validateCreateCaseInput,
  validateUploadedDocuments,
} from '../cases/caseValidation.js'
import { AppError } from '../errors.js'
import {
  encryptJson,
  decryptJson,
  encryptBuffer,
  decryptBuffer,
  isEncryptedBuffer,
  hashToken,
  generateRawAccessToken,
  parseEncryptionKey,
} from '../security/encryption.js'
import { generatePublicCaseId } from '../utils/caseId.js'
import { normalizeInstitutionalEmail } from '../hospitals/emailPolicy.js'
import { DOCUMENT_TYPES } from '../cases/documentTypes.js'

describe('money utils', () => {
  it('parses whole USDC amounts to minor units', () => {
    assert.equal(parseUsdcInputToMinorUnits('5000'), 5_000_000_000n)
    assert.equal(parseUsdcInputToMinorUnits('0.5'), 500_000n)
    assert.equal(parseUsdcInputToMinorUnits('1.000001'), 1_000_001n)
  })

  it('rejects more than six decimal places', () => {
    assert.throws(
      () => parseUsdcInputToMinorUnits('1.0000001'),
      MoneyParseError
    )
  })

  it('rejects negative and malformed values', () => {
    assert.throws(() => parseUsdcInputToMinorUnits('-1'), MoneyParseError)
    assert.throws(() => parseUsdcInputToMinorUnits('abc'), MoneyParseError)
  })

  it('formats minor units without float', () => {
    assert.equal(formatMinorUnitsAsUsdc(2_500_000_000n), '2500')
    assert.equal(formatMinorUnitsAsUsdc(500_000n), '0.5')
  })
})

describe('funding gap (server-side)', () => {
  it('computes cost − assistance − contribution', () => {
    assert.equal(
      computeFundingGapMinor(5_000_000_000n, 2_000_000_000n, 500_000_000n),
      2_500_000_000n
    )
  })

  it('accepts a valid demo submission and ignores any client gap field', () => {
    const result = validateCreateCaseInput({
      treatmentSummary: 'Demo enzyme replacement therapy',
      providerOrganizationName: 'DemoCare Specialty Hospital',
      hospitalInstitutionalEmail: 'verify@democare.hospital',
      providerCostUsdc: '5000',
      externalAssistanceUsdc: '2000',
      patientContributionUsdc: '500',
      // @ts-expect-error — client must never supply gap; ensure we ignore extras
      fundingGapUsdc: '999999',
    })
    assert.equal(result.amounts.fundingGapMinor, 2_500_000_000n)
    assert.equal(
      result.privatePayload.hospitalInstitutionalEmail,
      'verify@democare.hospital'
    )
  })

  it('rejects a zero funding gap (cost equals assistance + contribution)', () => {
    assert.throws(
      () =>
        validateCreateCaseInput({
          treatmentSummary: 'Demo summary',
          providerOrganizationName: 'Demo Provider',
          hospitalInstitutionalEmail: 'pharmacy@northlake-rdc.org',
          providerCostUsdc: '1000',
          externalAssistanceUsdc: '1000',
          patientContributionUsdc: '0',
        }),
      (err: unknown) =>
        err instanceof AppError && err.code === 'INVALID_FUNDING_GAP'
    )
  })

  it('rejects assistance exceeding treatment cost', () => {
    assert.throws(
      () =>
        validateCreateCaseInput({
          treatmentSummary: 'Demo summary',
          providerOrganizationName: 'Demo Provider',
          hospitalInstitutionalEmail: 'pharmacy@northlake-rdc.org',
          providerCostUsdc: '100',
          externalAssistanceUsdc: '80',
          patientContributionUsdc: '30',
        }),
      (err: unknown) =>
        err instanceof AppError && err.code === 'INVALID_FUNDING_BREAKDOWN'
    )
  })

  it('rejects zero treatment cost', () => {
    assert.throws(
      () =>
        validateCreateCaseInput({
          treatmentSummary: 'Demo summary',
          providerOrganizationName: 'Demo Provider',
          hospitalInstitutionalEmail: 'verify@democare.hospital',
          providerCostUsdc: '0',
          externalAssistanceUsdc: '0',
          patientContributionUsdc: '0',
        }),
      (err: unknown) =>
        err instanceof AppError && err.code === 'INVALID_AMOUNT'
    )
  })
})

describe('institution email blacklist', () => {
  it('rejects personal domains', () => {
    const gmail = normalizeInstitutionalEmail('patient@gmail.com')
    assert.ok('error' in gmail)
    assert.match(gmail.error, /Personal email/i)

    const outlook = normalizeInstitutionalEmail('x@outlook.com')
    assert.ok('error' in outlook)
  })

  it('accepts institutional domains', () => {
    const ok = normalizeInstitutionalEmail('Verify@DemoCare.Hospital')
    assert.ok(!('error' in ok))
    assert.equal(ok.email, 'verify@democare.hospital')
    assert.equal(ok.domain, 'democare.hospital')
  })

  it('rejects personal email on create validation', () => {
    assert.throws(
      () =>
        validateCreateCaseInput({
          treatmentSummary: 'Demo',
          providerOrganizationName: 'Demo',
          hospitalInstitutionalEmail: 'me@yahoo.com',
          providerCostUsdc: '100',
          externalAssistanceUsdc: '0',
          patientContributionUsdc: '0',
        }),
      (err: unknown) =>
        err instanceof AppError && err.code === 'INVALID_HOSPITAL_EMAIL'
    )
  })
})

describe('document uploads', () => {
  it('requires at least two documents', () => {
    assert.throws(
      () =>
        validateUploadedDocuments([
          {
            documentType: DOCUMENT_TYPES.DIAGNOSIS_SUMMARY,
            originalFilename: 'a.pdf',
            mimetype: 'application/pdf',
            buffer: Buffer.from('%PDF'),
          },
        ]),
      (err: unknown) =>
        err instanceof AppError && err.code === 'DOCUMENTS_REQUIRED'
    )
  })

  it('accepts two distinct document types', () => {
    const docs = validateUploadedDocuments([
      {
        documentType: DOCUMENT_TYPES.DIAGNOSIS_SUMMARY,
        originalFilename: 'dx.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.from('%PDF-1'),
      },
      {
        documentType: DOCUMENT_TYPES.TREATMENT_PLAN,
        originalFilename: 'plan.png',
        mimetype: 'image/png',
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      },
    ])
    assert.equal(docs.length, 2)
  })

  it('rejects duplicate document types', () => {
    assert.throws(
      () =>
        validateUploadedDocuments([
          {
            documentType: DOCUMENT_TYPES.MEDICATION_BILL,
            originalFilename: 'a.pdf',
            mimetype: 'application/pdf',
            buffer: Buffer.from('a'),
          },
          {
            documentType: DOCUMENT_TYPES.MEDICATION_BILL,
            originalFilename: 'b.pdf',
            mimetype: 'application/pdf',
            buffer: Buffer.from('b'),
          },
        ]),
      (err: unknown) =>
        err instanceof AppError && err.code === 'DUPLICATE_DOCUMENT_TYPE'
    )
  })
})

describe('encryption + case id', () => {
  it('round-trips private payload including hospital email', () => {
    const material = parseEncryptionKey(
      Buffer.alloc(32, 7).toString('base64'),
      'test-key'
    )
    const payload = {
      treatmentSummary: 'Demo only',
      providerOrganizationName: 'DemoCare',
      hospitalInstitutionalEmail: 'verify@democare.hospital',
    }
    const enc = encryptJson(payload, material)
    const dec = decryptJson<typeof payload>(enc, material)
    assert.deepEqual(dec, payload)
  })

  it('encrypts document files at rest and rejects tampering', () => {
    const material = parseEncryptionKey(
      Buffer.alloc(32, 9).toString('base64'),
      'test-key'
    )
    const pdf = Buffer.from('%PDF-1.4 synthetic document body')
    const stored = encryptBuffer(pdf, material)
    assert.ok(isEncryptedBuffer(stored))
    assert.equal(stored.includes(pdf), false)
    assert.deepEqual(decryptBuffer(stored, material), pdf)
    assert.equal(isEncryptedBuffer(pdf), false)

    const tampered = Buffer.from(stored)
    tampered[tampered.length - 1] ^= 0xff
    assert.throws(() => decryptBuffer(tampered, material), AppError)
  })

  it('hashes access tokens stably and generates opaque case ids', () => {
    const token = generateRawAccessToken()
    assert.equal(hashToken(token), hashToken(token))
    assert.notEqual(hashToken(token), hashToken(generateRawAccessToken()))
    const id = generatePublicCaseId()
    assert.match(id, /^[2-9A-HJ-NP-Z]{5}$/)
    assert.equal(id.length, 5)
  })
})
