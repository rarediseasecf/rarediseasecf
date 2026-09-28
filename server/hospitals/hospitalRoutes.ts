import type { Request, Response, NextFunction } from 'express'
import type { ServerConfig } from '../config.js'
import { AppError } from '../errors.js'
import { secretsEqual } from '../security/secretsEqual.js'
import type { HospitalAdminService } from './hospitalAdminService.js'
import type { HospitalVerifyService } from './hospitalVerifyService.js'
import type { MilestoneService } from '../milestones/milestoneService.js'
import {
  HOSPITAL_APPROVE_REASON_LABELS,
  HOSPITAL_REJECT_REASON_LABELS,
} from './reasonCodes.js'

function assertAdmin(req: Request, config: ServerConfig): void {
  const header = req.headers['x-admin-secret']
  const provided = typeof header === 'string' ? header : ''
  if (!secretsEqual(provided, config.adminSecret)) {
    throw new AppError(
      'ADMIN_UNAUTHORIZED',
      'Admin secret required. Set X-Admin-Secret header.',
      401
    )
  }
}

function readTokenParam(req: Request): string {
  const raw =
    typeof req.params.token === 'string' ? req.params.token : ''
  // Express may decode once; keep raw for HMAC
  const token = decodeURIComponent(raw).trim()
  if (!token || token.length > 4000) {
    throw new AppError(
      'MAGIC_LINK_INVALID',
      'A valid verification token is required.',
      400
    )
  }
  return token
}

export function createHospitalRouter(
  config: ServerConfig,
  verifyService: HospitalVerifyService,
  adminService: HospitalAdminService,
  milestoneService?: MilestoneService
) {
  return {
    /** Reason code catalogs for the verifier UI */
    reasonCatalog: (_req: Request, res: Response) => {
      res.status(200).json({
        approve: Object.entries(HOSPITAL_APPROVE_REASON_LABELS).map(
          ([code, label]) => ({ code, label })
        ),
        reject: Object.entries(HOSPITAL_REJECT_REASON_LABELS).map(
          ([code, label]) => ({ code, label })
        ),
      })
    },

    getVerify: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const token = readTokenParam(req)
        const summary = await verifyService.getSummaryForToken(token)
        res.status(200).json(summary)
      } catch (err) {
        next(err)
      }
    },

    downloadDocument: async (
      req: Request,
      res: Response,
      next: NextFunction
    ) => {
      try {
        const token = readTokenParam(req)
        const documentId =
          typeof req.params.documentId === 'string'
            ? req.params.documentId.trim()
            : ''
        if (!documentId) {
          throw new AppError(
            'DOCUMENT_NOT_FOUND',
            'Document id is required.',
            404
          )
        }
        const file = await verifyService.downloadDocumentForToken(
          token,
          documentId
        )
        res.setHeader('Content-Type', file.contentType)
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${file.originalFilename.replace(/"/g, '')}"`
        )
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.setHeader('Cache-Control', 'no-store')
        res.status(200).send(file.buffer)
      } catch (err) {
        next(err)
      }
    },

    coverImage: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const file = await verifyService.coverImageForToken(readTokenParam(req))
        res.setHeader('Content-Type', file.contentType)
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.setHeader('Cache-Control', 'no-store')
        res.status(200).send(file.buffer)
      } catch (err) {
        next(err)
      }
    },

    approve: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const token = readTokenParam(req)
        const body = (req.body ?? {}) as {
          reasonCode?: string
          note?: string
          payoutMethod?: string
          usdcWalletAddress?: string
        }
        const result = await verifyService.approve(token, {
          reasonCode: body.reasonCode,
          note: body.note,
          payoutMethod: body.payoutMethod,
          usdcWalletAddress: body.usdcWalletAddress,
        })
        res.status(200).json(result)
      } catch (err) {
        next(err)
      }
    },

    reject: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const token = readTokenParam(req)
        const body = (req.body ?? {}) as {
          reasonCode?: string
          note?: string
        }
        const result = await verifyService.reject(token, body)
        res.status(200).json(result)
      } catch (err) {
        next(err)
      }
    },

    listHospitals: async (req: Request, res: Response, next: NextFunction) => {
      try {
        assertAdmin(req, config)
        const includeInactive = req.query.includeInactive === '1'
        const items = await adminService.list(includeInactive)
        res.status(200).json({ items })
      } catch (err) {
        next(err)
      }
    },

    addHospital: async (req: Request, res: Response, next: NextFunction) => {
      try {
        assertAdmin(req, config)
        const body = (req.body ?? {}) as {
          displayName?: string
          emailDomain?: string
          contactEmail?: string
        }
        const item = await adminService.add(body)
        res.status(201).json(item)
      } catch (err) {
        next(err)
      }
    },

    removeHospital: async (
      req: Request,
      res: Response,
      next: NextFunction
    ) => {
      try {
        assertAdmin(req, config)
        const id =
          typeof req.params.id === 'string' ? req.params.id.trim() : ''
        await adminService.remove(id)
        res.status(200).json({ ok: true })
      } catch (err) {
        next(err)
      }
    },

    listCampaignDrafts: async (
      req: Request,
      res: Response,
      next: NextFunction
    ) => {
      try {
        assertAdmin(req, config)
        const items = await verifyService.listAdminCampaignDrafts()
        res.status(200).json({ items })
      } catch (err) {
        next(err)
      }
    },

    publishCampaign: async (
      req: Request,
      res: Response,
      next: NextFunction
    ) => {
      try {
        assertAdmin(req, config)
        const campaignId =
          typeof req.params.campaignId === 'string'
            ? req.params.campaignId.trim()
            : ''
        const result = await verifyService.adminPublishCampaign(campaignId)
        res.status(200).json(result)
      } catch (err) {
        next(err)
      }
    },

    listPublishedMilestones: async (
      req: Request,
      res: Response,
      next: NextFunction
    ) => {
      try {
        assertAdmin(req, config)
        if (!milestoneService) {
          throw new AppError(
            'INTERNAL_ERROR',
            'Milestone service unavailable.',
            500
          )
        }
        const items = await milestoneService.listPublishedWithMilestones()
        res.status(200).json({ items })
      } catch (err) {
        next(err)
      }
    },

    getCampaignMilestones: async (
      req: Request,
      res: Response,
      next: NextFunction
    ) => {
      try {
        assertAdmin(req, config)
        if (!milestoneService) {
          throw new AppError(
            'INTERNAL_ERROR',
            'Milestone service unavailable.',
            500
          )
        }
        const campaignId =
          typeof req.params.campaignId === 'string'
            ? req.params.campaignId.trim()
            : ''
        const result = await milestoneService.listAdminMilestones(campaignId)
        res.status(200).json(result)
      } catch (err) {
        next(err)
      }
    },

    settleHighest: async (
      req: Request,
      res: Response,
      next: NextFunction
    ) => {
      try {
        assertAdmin(req, config)
        if (!milestoneService) {
          throw new AppError(
            'INTERNAL_ERROR',
            'Milestone service unavailable.',
            500
          )
        }
        const campaignId =
          typeof req.params.campaignId === 'string'
            ? req.params.campaignId.trim()
            : ''
        const result = await milestoneService.settleHighest(campaignId)
        res.status(200).json(result)
      } catch (err) {
        next(err)
      }
    },

    releaseExpired: async (
      req: Request,
      res: Response,
      next: NextFunction
    ) => {
      try {
        assertAdmin(req, config)
        if (!milestoneService) {
          throw new AppError(
            'INTERNAL_ERROR',
            'Milestone service unavailable.',
            500
          )
        }
        const campaignId =
          typeof req.params.campaignId === 'string'
            ? req.params.campaignId.trim()
            : ''
        const result = await milestoneService.releaseExpiredCampaign(campaignId)
        res.status(200).json(result)
      } catch (err) {
        next(err)
      }
    },
  }
}
