import express from 'express'
import cookieParser from 'cookie-parser'
import type { ServerConfig } from './config.js'
import { createDb, type Database } from './db/index.js'
import { ChallengeStore } from './auth/challengeStore.js'
import { SessionStore } from './auth/sessionStore.js'
import { AuthService } from './auth/authService.js'
import { createAuthRouter } from './auth/authRoutes.js'
import { CaseRepository } from './cases/caseRepository.js'
import { CaseService } from './cases/caseService.js'
import {
  createCaseRouter,
  createCaseUploadMiddleware,
} from './cases/caseRoutes.js'
import { ReviewerAuthService } from './reviewer/reviewerAuthService.js'
import { ReviewerService } from './reviewer/reviewerService.js'
import { createReviewerRouter } from './reviewer/reviewerRoutes.js'
import { CampaignPublicationService } from './campaigns/campaignPublicationService.js'
import { SettlementService } from './settlement/settlementService.js'
import { createPublicCampaignRouter } from './campaigns/publicCampaignRoutes.js'
import { EscrowService } from './escrow/escrowService.js'
import { DonationService } from './donations/donationService.js'
import { createDonationRouter } from './donations/donationRoutes.js'
import { HospitalRepository } from './hospitals/hospitalRepository.js'
import { HospitalVerifyService } from './hospitals/hospitalVerifyService.js'
import { HospitalAdminService } from './hospitals/hospitalAdminService.js'
import { createHospitalRouter } from './hospitals/hospitalRoutes.js'
import { MilestoneService } from './milestones/milestoneService.js'
import { createTransparencyRouter } from './transparency/transparencyRoutes.js'
import { TransparencyService } from './transparency/transparencyService.js'
import { createOriginGuard } from './middleware/requestOrigin.js'
import { errorHandler } from './middleware/errorHandler.js'
import { RateLimiter } from './middleware/rateLimit.js'
import { SolanaRelayer } from './chain/solanaRelayer.js'
import { AppError } from './errors.js'

export interface AppStores {
  challenges: ChallengeStore
  sessions: SessionStore
  authService: AuthService
  caseService: CaseService
  reviewerAuthService: ReviewerAuthService
  reviewerService: ReviewerService
  campaignPublicationService: CampaignPublicationService
  milestoneService: MilestoneService
  rateLimiter: RateLimiter
  dbHandle: Database
}

export function createApp(config: ServerConfig): {
  app: express.Application
  stores: AppStores
} {
  const dbHandle = createDb(config.databaseUrl)
  const challenges = new ChallengeStore()
  const reviewerChallenges = new ChallengeStore()
  const sessions = new SessionStore()
  const authService = new AuthService(config, challenges, sessions)
  const auth = createAuthRouter(config, authService)

  const relayer = new SolanaRelayer(config.solana)
  console.info(
    JSON.stringify({
      event: 'solana_relayer_ready',
      cluster: relayer.cluster,
      platformAuthority: relayer.authorityAddress,
    })
  )
  const escrow = new EscrowService(relayer)

  const caseRepo = new CaseRepository(dbHandle.db)
  const hospitalRepo = new HospitalRepository(dbHandle.db)
  const hospitalVerify = new HospitalVerifyService(
    hospitalRepo,
    caseRepo,
    config,
    config.encryption,
    escrow
  )
  const hospitalAdmin = new HospitalAdminService(hospitalRepo)
  const milestoneService = new MilestoneService(dbHandle.db, escrow)
  const caseService = new CaseService(
    caseRepo,
    config,
    config.encryption,
    hospitalRepo,
    hospitalVerify
  )
  const cases = createCaseRouter(config, caseService)
  const hospital = createHospitalRouter(
    config,
    hospitalVerify,
    hospitalAdmin,
    milestoneService
  )

  const reviewerAuthService = new ReviewerAuthService(
    dbHandle.db,
    config,
    reviewerChallenges
  )
  const reviewerService = new ReviewerService(dbHandle.db, config.encryption)
  const campaignPublicationService = new CampaignPublicationService(
    dbHandle.db,
    { uploadRoot: config.caseUploadDir, encryption: config.encryption }
  )
  const settlementService = new SettlementService(dbHandle.db, config)
  const reviewer = createReviewerRouter(
    config,
    reviewerAuthService,
    reviewerService,
    campaignPublicationService,
    settlementService
  )
  const publicCampaigns = createPublicCampaignRouter(
    campaignPublicationService
  )
  const donationService = new DonationService(
    dbHandle.db,
    escrow,
    milestoneService
  )
  const donations = createDonationRouter(donationService)
  const transparencyService = new TransparencyService(dbHandle.db)
  const transparency = createTransparencyRouter(transparencyService)

  const rateLimiter = new RateLimiter()
  const limit = (
    name: string,
    max: number,
    windowMs = 60_000
  ): express.RequestHandler =>
    config.rateLimitEnabled
      ? rateLimiter.middleware({ name, max, windowMs })
      : (_req, _res, next) => next()
  const onlyWhen =
    (enabled: boolean): express.RequestHandler =>
    (_req, _res, next) =>
      enabled ? next() : next(new AppError('NOT_FOUND', 'Not found.', 404))

  const app = express()

  app.disable('x-powered-by')
  app.set('trust proxy', 1)

  app.use(express.json({ limit: '32kb' }))
  app.use(cookieParser())
  app.use(createOriginGuard(config))

  app.use((req, res, next) => {
    const origin = req.headers.origin
    if (origin === config.appOrigin) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Access-Control-Allow-Credentials', 'true')
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, X-Admin-Secret'
      )
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS')
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }
    next()
  })

  app.use('/api', limit('api', 300))
  app.use('/api/auth', limit('auth', 30))
  app.use('/api/reviewer/auth', limit('auth', 30))
  app.use('/api/hospital/verify', limit('hospital-verify', 30))
  app.use('/api/admin', limit('admin', 120))

  app.get('/api/health', (_req, res) => {
    res.status(200).json({
      ok: true,
      cluster: config.networkLabel,
    })
  })

  app.post('/api/auth/challenge', auth.challenge)
  app.post('/api/auth/verify', auth.verify)
  app.get('/api/auth/session', auth.session)
  app.post('/api/auth/logout', auth.logout)

  app.post(
    '/api/cases',
    limit('case-submit', 5, 10 * 60_000),
    createCaseUploadMiddleware(),
    cases.create
  )
  app.get('/api/cases/current', cases.current)
  app.get('/api/cases/:publicCaseId', cases.byPublicId)
  app.post('/api/cases/access/revoke', cases.revokeAccess)
  app.post('/api/cases/public-story/withdraw', cases.withdrawPublicStory)

  app.get('/api/hospital/reasons', hospital.reasonCatalog)
  app.get('/api/hospital/verify/:token', hospital.getVerify)
  app.get(
    '/api/hospital/verify/:token/documents/:documentId',
    hospital.downloadDocument
  )
  app.get('/api/hospital/verify/:token/cover-image', hospital.coverImage)
  app.post('/api/hospital/verify/:token/approve', hospital.approve)
  app.post('/api/hospital/verify/:token/reject', hospital.reject)

  app.get('/api/admin/hospitals', hospital.listHospitals)
  app.post('/api/admin/hospitals', hospital.addHospital)
  app.delete('/api/admin/hospitals/:id', hospital.removeHospital)
  app.get('/api/admin/campaigns', hospital.listCampaignDrafts)
  app.post('/api/admin/campaigns/:campaignId/publish', hospital.publishCampaign)
  app.get(
    '/api/admin/campaigns/published/milestones',
    hospital.listPublishedMilestones
  )
  app.get(
    '/api/admin/campaigns/:campaignId/milestones',
    hospital.getCampaignMilestones
  )
  app.post(
    '/api/admin/campaigns/:campaignId/settle-highest',
    hospital.settleHighest
  )
  app.post(
    '/api/admin/campaigns/:campaignId/release-expired',
    hospital.releaseExpired
  )

  app.use('/api/reviewer', onlyWhen(config.legacyReviewerEnabled))
  app.post('/api/reviewer/auth/challenge', reviewer.challenge)
  app.post('/api/reviewer/auth/verify', reviewer.verify)
  app.get('/api/reviewer/auth/session', reviewer.session)
  app.post('/api/reviewer/auth/logout', reviewer.logout)

  app.get('/api/reviewer/cases', reviewer.requireReviewer, reviewer.listCases)
  app.get(
    '/api/reviewer/cases/:publicCaseId',
    reviewer.requireReviewer,
    reviewer.getCase
  )
  app.post(
    '/api/reviewer/cases/:publicCaseId/request-clarification',
    reviewer.requireReviewer,
    reviewer.requestClarification
  )
  app.post(
    '/api/reviewer/cases/:publicCaseId/reject',
    reviewer.requireReviewer,
    reviewer.reject
  )
  app.post(
    '/api/reviewer/cases/:publicCaseId/approve',
    reviewer.requireReviewer,
    reviewer.approve
  )
  app.get(
    '/api/reviewer/cases/:publicCaseId/campaign-draft',
    reviewer.requireReviewer,
    reviewer.getCampaignDraft
  )
  app.post(
    '/api/reviewer/cases/:publicCaseId/publish-campaign',
    reviewer.requireReviewer,
    reviewer.publishCampaign
  )
  app.get(
    '/api/reviewer/cases/:publicCaseId/settlement',
    reviewer.requireReviewer,
    reviewer.getSettlement
  )
  app.post(
    '/api/reviewer/cases/:publicCaseId/settlement',
    reviewer.requireReviewer,
    reviewer.recordSettlement
  )

  app.get('/api/public/campaigns', publicCampaigns.list)
  app.get('/api/public/campaigns/:campaignId', publicCampaigns.detail)
  app.get('/api/public/campaigns/:campaignId/image', publicCampaigns.image)
  app.post(
    '/api/public/campaigns/:campaignId/donations',
    limit('donate', 20),
    donations.create
  )
  app.get(
    '/api/public/campaigns/:campaignId/donations',
    donations.list
  )

  app.get('/api/public/transparency/campaigns', transparency.campaigns)
  app.get(
    '/api/public/transparency/campaigns/:campaignId',
    transparency.detail
  )
  app.get('/api/public/leaderboard', transparency.leaderboard)

  app.use(errorHandler)

  return {
    app,
    stores: {
      challenges,
      sessions,
      authService,
      caseService,
      reviewerAuthService,
      reviewerService,
      campaignPublicationService,
      milestoneService,
      rateLimiter,
      dbHandle,
    },
  }
}
