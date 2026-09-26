/**
 * Public transparency routes (timeline, updates, leaderboard).
 */
import type { Request, Response, NextFunction } from 'express'
import type { TransparencyService } from './transparencyService.js'

export function createTransparencyRouter(transparency: TransparencyService) {
  return {
    campaigns: async (_req: Request, res: Response, next: NextFunction) => {
      try {
        const items = await transparency.listPublishedCampaignOptions()
        res.status(200).json({ campaigns: items })
      } catch (err) {
        next(err)
      }
    },

    detail: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const campaignId =
          typeof req.params.campaignId === 'string'
            ? req.params.campaignId
            : ''
        const data = await transparency.getCampaignTransparency(campaignId)
        res.status(200).json(data)
      } catch (err) {
        next(err)
      }
    },

    leaderboard: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const campaignId =
          typeof req.query.campaignId === 'string'
            ? req.query.campaignId
            : undefined
        const items = await transparency.leaderboard(campaignId)
        res.status(200).json({ items })
      } catch (err) {
        next(err)
      }
    },
  }
}
