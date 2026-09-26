import type { Request, Response, NextFunction } from 'express'
import type { ServerConfig } from '../config.js'
import type { ReviewerAuthService } from './reviewerAuthService.js'
import type { ReviewerService } from './reviewerService.js'
import type { CampaignPublicationService } from '../campaigns/campaignPublicationService.js'
import type { SettlementService } from '../settlement/settlementService.js'
import type { ReviewerRegistryRow } from '../db/schema.js'
import { AppError } from '../errors.js'

export function readReviewerToken(
  req: Request,
  config: ServerConfig
): string | undefined {
  const value = req.cookies?.[config.reviewerSessionCookieName]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function reviewerCookieOptions(config: ServerConfig) {
  return {
    httpOnly: true as const,
    sameSite: 'lax' as const,
    path: '/',
    secure: config.cookieSecure,
    maxAge: config.reviewerSessionTtlMs,
  }
}

export function clearReviewerCookieOptions(config: ServerConfig) {
  return {
    httpOnly: true as const,
    sameSite: 'lax' as const,
    path: '/',
    secure: config.cookieSecure,
  }
}

export function createRequireReviewer(
  config: ServerConfig,
  auth: ReviewerAuthService
) {
  return async function requireReviewer(
    req: Request,
    _res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const token = readReviewerToken(req, config)
      const resolved = await auth.resolveSession(token)
      if (!resolved) {
        throw new AppError(
          'REVIEWER_SESSION_REQUIRED',
          'Reviewer access is required.',
          401
        )
      }
      ;(req as Request & { reviewer: ReviewerRegistryRow }).reviewer =
        resolved.reviewer
      next()
    } catch (err) {
      next(err)
    }
  }
}

export function getRequestReviewer(req: Request): ReviewerRegistryRow {
  const reviewer = (req as Request & { reviewer?: ReviewerRegistryRow }).reviewer
  if (!reviewer) {
    throw new AppError(
      'REVIEWER_SESSION_REQUIRED',
      'Reviewer access is required.',
      401
    )
  }
  return reviewer
}

export function createReviewerRouter(
  config: ServerConfig,
  auth: ReviewerAuthService,
  service: ReviewerService,
  publicationService: CampaignPublicationService,
  settlementService: SettlementService
) {
  const requireReviewer = createRequireReviewer(config, auth)

  return {
    requireReviewer,

    challenge: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const publicKey =
          typeof req.body?.publicKey === 'string' ? req.body.publicKey.trim() : ''
        if (!publicKey) {
          throw new AppError(
            'INVALID_PUBLIC_KEY',
            'A valid wallet address is required.',
            400
          )
        }
        const result = await auth.issueChallenge(
          publicKey,
          typeof req.headers['user-agent'] === 'string'
            ? req.headers['user-agent']
            : undefined
        )
        res.status(200).json(result)
      } catch (err) {
        next(err)
      }
    },

    verify: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const challengeId =
          typeof req.body?.challengeId === 'string'
            ? req.body.challengeId.trim()
            : ''
        const publicKey =
          typeof req.body?.publicKey === 'string' ? req.body.publicKey.trim() : ''
        const signature =
          typeof req.body?.signature === 'string' ? req.body.signature.trim() : ''

        const { rawToken, response } = await auth.verifyAndCreateSession({
          challengeId,
          publicKey,
          signature,
        })
        res.cookie(
          config.reviewerSessionCookieName,
          rawToken,
          reviewerCookieOptions(config)
        )
        res.status(200).json(response)
      } catch (err) {
        next(err)
      }
    },

    session: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const token = readReviewerToken(req, config)
        const result = await auth.getSession(token)
        if (!result.authenticated && token) {
          res.clearCookie(
            config.reviewerSessionCookieName,
            clearReviewerCookieOptions(config)
          )
        }
        res.status(200).json(result)
      } catch (err) {
        next(err)
      }
    },

    logout: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const token = readReviewerToken(req, config)
        await auth.logout(token)
        res.clearCookie(
          config.reviewerSessionCookieName,
          clearReviewerCookieOptions(config)
        )
        res.status(200).json({ authenticated: false })
      } catch (err) {
        next(err)
      }
    },

    listCases: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const reviewer = getRequestReviewer(req)
        const status =
          typeof req.query.status === 'string' ? req.query.status : undefined
        const page =
          typeof req.query.page === 'string'
            ? Number.parseInt(req.query.page, 10)
            : undefined
        const result = await service.listCases({ reviewer, status, page })
        res.status(200).json(result)
      } catch (err) {
        next(err)
      }
    },

    getCase: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const reviewer = getRequestReviewer(req)
        const publicCaseId =
          typeof req.params.publicCaseId === 'string'
            ? req.params.publicCaseId.trim().toUpperCase()
            : ''
        const detail = await service.getCaseDetail(publicCaseId, reviewer)
        res.status(200).json(detail)
      } catch (err) {
        next(err)
      }
    },

    requestClarification: async (
      req: Request,
      res: Response,
      next: NextFunction
    ) => {
      try {
        const reviewer = getRequestReviewer(req)
        const publicCaseId =
          typeof req.params.publicCaseId === 'string'
            ? req.params.publicCaseId.trim().toUpperCase()
            : ''
        const reasonCode =
          typeof req.body?.reasonCode === 'string' ? req.body.reasonCode : ''
        const result = await service.requestClarification(
          publicCaseId,
          reasonCode,
          reviewer
        )
        res.status(200).json(result)
      } catch (err) {
        next(err)
      }
    },

    reject: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const reviewer = getRequestReviewer(req)
        const publicCaseId =
          typeof req.params.publicCaseId === 'string'
            ? req.params.publicCaseId.trim().toUpperCase()
            : ''
        const reasonCode =
          typeof req.body?.reasonCode === 'string' ? req.body.reasonCode : ''
        const result = await service.rejectCase(
          publicCaseId,
          reasonCode,
          reviewer
        )
        res.status(200).json(result)
      } catch (err) {
        next(err)
      }
    },

    approve: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const reviewer = getRequestReviewer(req)
        const publicCaseId =
          typeof req.params.publicCaseId === 'string'
            ? req.params.publicCaseId.trim().toUpperCase()
            : ''

        const providerCount = await service.countActiveProviders()
        if (providerCount < 1) {
          throw new AppError(
            'PROVIDER_REGISTRY_EMPTY',
            'Approval is unavailable until an approved provider is configured.',
            503
          )
        }

        const result = await service.approveCase(
          publicCaseId,
          {
            approvedProviderCostUsdc: req.body?.approvedProviderCostUsdc,
            verifiedExternalAssistanceUsdc:
              req.body?.verifiedExternalAssistanceUsdc,
            patientContributionUsdc: req.body?.patientContributionUsdc,
            providerId: req.body?.providerId,
            expiresAt: req.body?.expiresAt,
          },
          reviewer
        )
        res.status(200).json(result)
      } catch (err) {
        next(err)
      }
    },

    getCampaignDraft: async (
      req: Request,
      res: Response,
      next: NextFunction
    ) => {
      try {
        const reviewer = getRequestReviewer(req)
        const publicCaseId =
          typeof req.params.publicCaseId === 'string'
            ? req.params.publicCaseId.trim().toUpperCase()
            : ''
        const result = await publicationService.getReviewerDraft(
          publicCaseId,
          reviewer
        )
        res.status(200).json(result)
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
        const reviewer = getRequestReviewer(req)
        const publicCaseId =
          typeof req.params.publicCaseId === 'string'
            ? req.params.publicCaseId.trim().toUpperCase()
            : ''
        const result = await publicationService.publishCampaign(
          publicCaseId,
          reviewer
        )
        res.status(200).json(result)
      } catch (err) {
        next(err)
      }
    },

    getSettlement: async (req: Request, res: Response, next: NextFunction) => {
      try {
        getRequestReviewer(req)
        const publicCaseId =
          typeof req.params.publicCaseId === 'string'
            ? req.params.publicCaseId.trim().toUpperCase()
            : ''
        const result = await settlementService.getSettlement(publicCaseId)
        res.status(200).json(result)
      } catch (err) {
        next(err)
      }
    },

    recordSettlement: async (
      req: Request,
      res: Response,
      next: NextFunction
    ) => {
      try {
        const reviewer = getRequestReviewer(req)
        const publicCaseId =
          typeof req.params.publicCaseId === 'string'
            ? req.params.publicCaseId.trim().toUpperCase()
            : ''
        const result = await settlementService.recordSettlement(
          publicCaseId,
          reviewer,
          {
            transactionSignature: req.body?.transactionSignature,
            settledAmountMinor: req.body?.settledAmountMinor,
            network: req.body?.network,
          }
        )
        res.status(200).json(result)
      } catch (err) {
        next(err)
      }
    },
  }
}
