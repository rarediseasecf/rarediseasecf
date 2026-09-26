import type { Request, Response, NextFunction } from 'express'
import type { CampaignPublicationService } from './campaignPublicationService.js'
import { AppError } from '../errors.js'
import { isValidPublicCaseId } from '../utils/caseId.js'

/** Simple in-memory rate limit for public campaign reads. */
const PUBLIC_RATE_LIMIT = 120
const PUBLIC_RATE_WINDOW_MS = 60_000
const rateByIp = new Map<string, { count: number; windowStart: number }>()

function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim() || req.ip || 'unknown'
  }
  return req.ip || 'unknown'
}

function assertPublicRateLimit(ip: string): void {
  const now = Date.now()
  const bucket = rateByIp.get(ip)
  if (!bucket || now - bucket.windowStart > PUBLIC_RATE_WINDOW_MS) {
    rateByIp.set(ip, { count: 1, windowStart: now })
    return
  }
  if (bucket.count >= PUBLIC_RATE_LIMIT) {
    throw new AppError(
      'RATE_LIMITED',
      'Too many requests. Please try again shortly.',
      429
    )
  }
  bucket.count += 1
}

export function createPublicCampaignRouter(
  service: CampaignPublicationService
) {
  return {
    list: async (req: Request, res: Response, next: NextFunction) => {
      try {
        assertPublicRateLimit(clientIp(req))
        const page =
          typeof req.query.page === 'string'
            ? Number.parseInt(req.query.page, 10)
            : undefined
        const pageSize =
          typeof req.query.pageSize === 'string'
            ? Number.parseInt(req.query.pageSize, 10)
            : undefined
        const result = await service.listPublicCampaigns({ page, pageSize })
        res.status(200).json(result)
      } catch (err) {
        next(err)
      }
    },

    detail: async (req: Request, res: Response, next: NextFunction) => {
      try {
        assertPublicRateLimit(clientIp(req))
        const campaignId =
          typeof req.params.campaignId === 'string'
            ? req.params.campaignId
            : ''
        if (!isValidPublicCaseId(campaignId)) {
          throw new AppError(
            'NOT_FOUND',
            'This campaign is unavailable.',
            404
          )
        }
        const campaign = await service.getPublicCampaign(campaignId)
        res.status(200).json({ campaign })
      } catch (err) {
        next(err)
      }
    },

    image: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const campaignId =
          typeof req.params.campaignId === 'string'
            ? req.params.campaignId
            : ''
        if (!isValidPublicCaseId(campaignId)) {
          throw new AppError('NOT_FOUND', 'Image unavailable.', 404)
        }
        const file = await service.getPublicCampaignImage(campaignId)
        res.setHeader('Content-Type', file.contentType)
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.setHeader('Cache-Control', 'public, max-age=300')
        res.status(200).send(file.buffer)
      } catch (err) {
        next(err)
      }
    },
  }
}
