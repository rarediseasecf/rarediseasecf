import type { Request, Response, NextFunction } from 'express'
import { AppError } from '../errors.js'
import { isValidPublicCaseId } from '../utils/caseId.js'
import type { DonationService } from './donationService.js'

export function createDonationRouter(donationService: DonationService) {
  return {
    create: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const campaignId =
          typeof req.params.campaignId === 'string'
            ? req.params.campaignId
            : ''
        if (!isValidPublicCaseId(campaignId)) {
          throw new AppError('INVALID_CAMPAIGN_ID', 'Invalid campaign.', 400)
        }
        const body = (req.body ?? {}) as {
          amountUsdc?: string
          method?: string
          anonymous?: boolean
          displayName?: string
          txHash?: string
        }
        const receipt = await donationService.createDonation(campaignId, {
          amountUsdc:
            typeof body.amountUsdc === 'string' ? body.amountUsdc : '',
          method:
            typeof body.method === 'string'
              ? body.method.trim().toUpperCase()
              : undefined,
          anonymous: Boolean(body.anonymous),
          displayName: body.displayName,
          txHash: typeof body.txHash === 'string' ? body.txHash : undefined,
        })
        res.status(201).json({ donation: receipt })
      } catch (err) {
        next(err)
      }
    },

    list: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const campaignId =
          typeof req.params.campaignId === 'string'
            ? req.params.campaignId
            : ''
        if (!isValidPublicCaseId(campaignId)) {
          throw new AppError('INVALID_CAMPAIGN_ID', 'Invalid campaign.', 400)
        }
        const items = await donationService.listDonations(campaignId)
        res.status(200).json({ donations: items })
      } catch (err) {
        next(err)
      }
    },
  }
}
