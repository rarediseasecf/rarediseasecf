import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { PublicCampaign } from '../lib/publicCampaignApi'
import { formatCampaignExpiry } from '../lib/publicCampaignApi'
import FundingProgress from './FundingProgress'
import StatusBadge, { DemoBadge, VerifiedByBadge } from './StatusBadge'

interface CampaignCardProps {
  campaign: PublicCampaign
}

export default function CampaignCard({ campaign }: CampaignCardProps) {
  const [photoFailed, setPhotoFailed] = useState(false)
  const photoUrl = photoFailed ? null : campaign.coverImageUrl
  return (
    <article
      className="campaign-card"
      aria-label={`Campaign ${campaign.campaignId}`}
    >
      <div
        className={`campaign-card__visual${photoUrl ? ' campaign-card__visual--photo' : ''}`}
        aria-hidden="true"
      >
        {photoUrl && (
          <img
            className="campaign-card__photo"
            src={photoUrl}
            alt=""
            loading="lazy"
            onError={() => setPhotoFailed(true)}
          />
        )}
        <span className="campaign-card__case-id">{campaign.campaignId}</span>
      </div>

      <div className="campaign-card__body">
        <div className="campaign-card__meta">
          {campaign.isDemo && <DemoBadge />}
          <StatusBadge status={campaign.status === 'ACTIVE' ? 'ACTIVE' : 'PUBLISHED'} />
          {campaign.verificationStatus === 'VERIFIED' && (
            <VerifiedByBadge email={campaign.verifiedByEmail} />
          )}
        </div>

        <h3 className="campaign-card__title">{campaign.title}</h3>
        {campaign.patientStory && (
          <>
            {(campaign.patientStory.condition || campaign.patientStory.treatment) && (
              <p className="campaign-card__condition">
                {[campaign.patientStory.condition, campaign.patientStory.treatment]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
            {campaign.patientStory.story && (
              <p className="campaign-card__story">{campaign.patientStory.story}</p>
            )}
          </>
        )}

        <p className="campaign-card__provider">
          <span className="campaign-card__provider-label">Institution</span>
          {campaign.providerDisplayName}
        </p>

        <p className="campaign-card__goal-label">Verified funding goal</p>

        <FundingProgress
          amountRaisedUsdc={campaign.amountRaisedUsdc}
          verifiedFundingGoalUsdc={campaign.verifiedFundingGoalUsdc}
          remainingUsdc={campaign.remainingUsdc}
          fundingPercent={campaign.fundingPercent}
          size="sm"
        />

        <p className="campaign-card__expiry">
          Expires {formatCampaignExpiry(campaign.expiresAt)}
        </p>
      </div>

      <div className="campaign-card__footer">
        <Link
          to={`/campaigns/${campaign.campaignId}`}
          className="btn btn--secondary btn--sm campaign-card__cta"
          aria-label={`View campaign ${campaign.campaignId}`}
        >
          View campaign
        </Link>
      </div>
    </article>
  )
}

/** Loading placeholder — no fake campaign content. */
export function CampaignCardSkeleton() {
  return (
    <article className="campaign-card campaign-card--skeleton" aria-hidden="true">
      <div className="campaign-card__visual campaign-card__visual--skeleton" />
      <div className="campaign-card__body">
        <div className="skeleton-line skeleton-line--sm" />
        <div className="skeleton-line skeleton-line--md" />
        <div className="skeleton-line skeleton-line--lg" />
      </div>
    </article>
  )
}
