import type { Request, Response, NextFunction } from 'express'
import multer from 'multer'
import type { ServerConfig } from '../config.js'
import type { CaseService } from './caseService.js'
import {
  clearCaseAccessCookie,
  setCaseAccessCookie,
} from '../security/caseAccessCookie.js'
import { AppError } from '../errors.js'
import { isValidPublicCaseId } from '../utils/caseId.js'
import {
  parseDocumentTypesField,
  type UploadedDocumentInput,
} from './caseValidation.js'
import {
  isDocumentType,
  MAX_DOCUMENTS_PER_CASE,
  MAX_DOCUMENT_BYTES,
} from './documentTypes.js'
import { assertAllowedUpload } from './documentStorage.js'
import type { UploadedCoverImage } from './coverImage.js'

/** Simple in-memory rate limit for case creation. */
const CREATE_RATE_LIMIT = 10
const CREATE_RATE_WINDOW_MS = 15 * 60 * 1000

interface RateBucket {
  count: number
  windowStart: number
}

const createRateByIp = new Map<string, RateBucket>()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: MAX_DOCUMENTS_PER_CASE + 1,
    fileSize: MAX_DOCUMENT_BYTES,
    fields: 32,
  },
})

function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim() || req.ip || 'unknown'
  }
  return req.ip || 'unknown'
}

function assertCreateRateLimit(ip: string): void {
  const now = Date.now()
  const bucket = createRateByIp.get(ip)
  if (!bucket || now - bucket.windowStart > CREATE_RATE_WINDOW_MS) {
    createRateByIp.set(ip, { count: 1, windowStart: now })
    return
  }
  if (bucket.count >= CREATE_RATE_LIMIT) {
    throw new AppError(
      'RATE_LIMITED',
      'Too many submissions. Please try again shortly.',
      429
    )
  }
  bucket.count += 1
}

function readCaseAccessToken(
  req: Request,
  config: ServerConfig
): string | undefined {
  const value = req.cookies?.[config.caseAccessCookieName]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function mapMulterError(err: unknown): AppError | null {
  if (!err || typeof err !== 'object') return null
  const code = (err as { code?: string }).code
  if (code === 'LIMIT_FILE_SIZE') {
    return new AppError(
      'INVALID_DOCUMENT_SIZE',
      'Each document and the cover image must be 5 MB or smaller.',
      400
    )
  }
  if (code === 'LIMIT_FILE_COUNT' || code === 'LIMIT_UNEXPECTED_FILE') {
    return new AppError(
      'TOO_MANY_DOCUMENTS',
      `You can upload at most ${MAX_DOCUMENTS_PER_CASE} documents.`,
      400
    )
  }
  return null
}

type UploadedFileFields = Partial<
  Record<'documents' | 'coverImage', Express.Multer.File[]>
>

function uploadedFields(req: Request): UploadedFileFields {
  const files = req.files
  return files && !Array.isArray(files) ? (files as UploadedFileFields) : {}
}

function collectCoverImage(req: Request): UploadedCoverImage | undefined {
  const file = uploadedFields(req).coverImage?.[0]
  return file ? { mimetype: file.mimetype, buffer: file.buffer } : undefined
}

function collectUploadedDocuments(req: Request): UploadedDocumentInput[] {
  const files = uploadedFields(req).documents ?? []
  const types = parseDocumentTypesField(req.body?.documentTypes, files.length)

  if (types.length !== files.length) {
    throw new AppError(
      'INVALID_DOCUMENT_CATEGORY',
      'Provide a document type for each uploaded file.',
      400
    )
  }

  return files.map((file, i) => {
    assertAllowedUpload({
      mimetype: file.mimetype,
      size: file.size,
      originalname: file.originalname,
    })
    const documentType = types[i] ?? ''
    if (!isDocumentType(documentType)) {
      throw new AppError(
        'INVALID_DOCUMENT_CATEGORY',
        'Each file must use a supported document type.',
        400
      )
    }
    return {
      documentType,
      originalFilename: file.originalname,
      mimetype: file.mimetype,
      buffer: file.buffer,
    }
  })
}

export function createCaseUploadMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    upload.fields([
      { name: 'documents', maxCount: MAX_DOCUMENTS_PER_CASE },
      { name: 'coverImage', maxCount: 1 },
    ])(req, res, err => {
      if (err) {
        const mapped = mapMulterError(err)
        next(mapped ?? err)
        return
      }
      next()
    })
  }
}

export function createCaseRouter(
  config: ServerConfig,
  caseService: CaseService
) {
  return {
    create: async (req: Request, res: Response, next: NextFunction) => {
      try {
        assertCreateRateLimit(clientIp(req))
        const body = (req.body ?? {}) as Record<string, unknown>
        const documents = collectUploadedDocuments(req)
        const result = await caseService.createCase(
          {
            treatmentSummary:
              typeof body.treatmentSummary === 'string'
                ? body.treatmentSummary
                : undefined,
            providerOrganizationName:
              typeof body.providerOrganizationName === 'string'
                ? body.providerOrganizationName
                : undefined,
            hospitalInstitutionalEmail:
              typeof body.hospitalInstitutionalEmail === 'string'
                ? body.hospitalInstitutionalEmail
                : undefined,
            providerCostUsdc:
              typeof body.providerCostUsdc === 'string'
                ? body.providerCostUsdc
                : undefined,
            externalAssistanceUsdc:
              typeof body.externalAssistanceUsdc === 'string'
                ? body.externalAssistanceUsdc
                : '0',
            patientContributionUsdc:
              typeof body.patientContributionUsdc === 'string'
                ? body.patientContributionUsdc
                : '0',
          },
          documents,
          collectCoverImage(req),
          {
            consent: body.storyConsent,
            sharedBy: body.storySharedBy,
            displayName: body.storyDisplayName,
            country: body.storyCountry,
            condition: body.storyCondition,
            treatment: body.storyTreatment,
            story: body.storyText,
          }
        )
        setCaseAccessCookie(res, config, result.rawAccessToken)
        res.status(201).json({
          ...result.view,
          ...(result.demoVerifyUrl
            ? { demoVerifyUrl: result.demoVerifyUrl }
            : {}),
        })
      } catch (err) {
        next(err)
      }
    },

    current: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const token = readCaseAccessToken(req, config)
        const view = await caseService.getOwnerViewForAccessToken(token)
        if (!view) {
          res.status(200).json({ accessible: false })
          return
        }
        res.status(200).json({ accessible: true, case: view })
      } catch (err) {
        next(err)
      }
    },

    byPublicId: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const publicCaseId =
          typeof req.params.publicCaseId === 'string'
            ? req.params.publicCaseId.trim().toUpperCase()
            : ''
        if (!isValidPublicCaseId(publicCaseId)) {
          throw new AppError(
            'INVALID_CASE_ID',
            'A valid case reference is required.',
            400
          )
        }
        const token = readCaseAccessToken(req, config)
        const view = await caseService.getOwnerViewForPublicId(
          publicCaseId,
          token
        )
        res.status(200).json(view)
      } catch (err) {
        next(err)
      }
    },

    withdrawPublicStory: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const view = await caseService.withdrawPublicStory(readCaseAccessToken(req, config))
        res.status(200).json(view)
      } catch (err) {
        next(err)
      }
    },

    revokeAccess: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const token = readCaseAccessToken(req, config)
        await caseService.revokeAccess(token)
        clearCaseAccessCookie(res, config)
        res.status(200).json({ accessible: false })
      } catch (err) {
        next(err)
      }
    },
  }
}
