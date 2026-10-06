import { Link } from 'react-router-dom'
import {
  faLock,
  faEyeSlash,
  faLink,
  faShieldHalved,
} from '@fortawesome/free-solid-svg-icons'
import FaIcon from '../components/FaIcon'

const LAST_UPDATED = 'October 6, 2026'
const CONTACT_EMAIL =
  import.meta.env.VITE_PRIVACY_CONTACT_EMAIL?.trim() ||
  'privacy@rarediseasecf.org'

export default function PrivacyPage() {
  return (
    <main id="main-content" className="page-legal">
      <div className="container legal">
        <p className="legal__eyebrow">Legal</p>
        <h1 className="legal__title">Privacy Policy</h1>
        <p className="legal__meta">Last updated: {LAST_UPDATED}</p>

        <p className="legal__lead">
          RareDiseaseCF helps patients fund verified treatment. To do that we
          handle sensitive information — medical documents, costs and hospital
          contacts. This page explains, in plain language, what we collect,
          why, who can see it, and how we keep it safe.
        </p>

        <ul className="legal__highlights">
          <li>
            <FaIcon icon={faLock} />
            <span>
              Case details, documents and payout details are encrypted
              (AES-256-GCM) before they are stored.
            </span>
          </li>
          <li>
            <FaIcon icon={faEyeSlash} />
            <span>
              Only the hospital you name can open your documents. Donors never
              see them.
            </span>
          </li>
          <li>
            <FaIcon icon={faLink} />
            <span>
              Nothing personal or medical is ever written to the blockchain.
            </span>
          </li>
          <li>
            <FaIcon icon={faShieldHalved} />
            <span>We do not sell data, show ads, or use tracking cookies.</span>
          </li>
        </ul>

        <section className="legal__section">
          <h2>1. Information we collect</h2>
          <h3>Patients (or someone authorized to act for them)</h3>
          <ul>
            <li>A short treatment summary and the hospital or provider name.</li>
            <li>The hospital’s institutional email address.</li>
            <li>
              Treatment cost, assistance already received and your own
              contribution.
            </li>
            <li>
              Documents you choose to upload (for example a cost estimate,
              prescription or diagnosis letter).
            </li>
          </ul>
          <p>
            You upload these yourself and decide what to include. Only include
            what the hospital needs to verify the case.
          </p>

          <h3>Hospitals</h3>
          <ul>
            <li>Your institutional email address (to send the verification link).</li>
            <li>Your approve / reject decision, reason and optional note.</li>
            <li>The Solana USDC wallet address you give us for payouts.</li>
          </ul>

          <h3>Donors</h3>
          <ul>
            <li>Donation amount and, if you choose, a display name.</li>
            <li>
              Your wallet address and transaction signature — these are part of
              the public blockchain record.
            </li>
          </ul>

          <h3>Technical information</h3>
          <ul>
            <li>
              IP addresses, used briefly in memory to limit abuse (rate
              limiting), and basic server logs.
            </li>
            <li>
              Secure, HTTP-only cookies that keep you signed in to your case
              or wallet session. No advertising or analytics trackers.
            </li>
          </ul>
        </section>

        <section className="legal__section">
          <h2>2. Why we use it</h2>
          <ul>
            <li>To let the named hospital verify that the treatment and costs are real.</li>
            <li>To publish a verified campaign and accept donations.</li>
            <li>To pay the hospital directly, in milestones or when the campaign ends.</li>
            <li>To prevent fraud, abuse and duplicate submissions.</li>
          </ul>
          <p>
            By submitting a case you confirm you are the patient or are
            authorized to act for them, and you consent to us sharing the case
            with the hospital you listed for verification.
          </p>
        </section>

        <section className="legal__section">
          <h2>3. What is public and what is private</h2>
          <p>
            <strong>Public on the site:</strong> the patient’s name, condition
            (disease) and treatment, the hospital-attested cost breakdown and
            funding gap, the campaign ID (for example <code>K7MQP</code>),
            amount raised, milestone progress, the “Verified by hospital” badge
            and donor display names (or “Anonymous”).
          </p>
          <p>
            <strong>Public on Solana:</strong> donations, payouts and the
            hospital’s receiving wallet address, which is visible in every
            payout transaction.
          </p>
          <p>
            <strong>Consent:</strong> a case cannot be submitted unless the
            patient, or their parent or legal guardian, ticks a box consenting
            to the patient’s name and condition being displayed publicly. We
            record when they agreed and which consent text they saw, and the
            hospital sees these details before the campaign goes live. Consent
            can be withdrawn at any time from the case page — we then delete the
            public details and stop showing them, although copies others already
            made cannot be recalled. This follows the explicit-consent rule that
            health-privacy laws share, including HIPAA (US), GDPR (EU/UK),
            India’s DPDP Act and Nepal’s Privacy Act.
          </p>
          <p>
            <strong>Campaign photo (optional):</strong> if you add one, it is
            shown publicly once the hospital approves your case. We remove
            location, camera and author data from the file before storing it,
            and the hospital sees it before it goes live.
          </p>
          <p>
            <strong>Optional:</strong> a country and a short story, shown only
            if you fill them in.
          </p>
          <p>
            <strong>Private (off-chain):</strong> medical reports, hospital stamp
            images, insurance documents, the patient’s ID and address, the
            private treatment summary and the hospital’s email address.
          </p>
        </section>

        <section className="legal__section">
          <h2>4. Blockchain data</h2>
          <p>
            Donations are held in an on-chain escrow on Solana. The chain
            stores only the campaign ID, amounts, and the hospital’s payout
            wallet. Escrowed funds can only go to that hospital wallet —
            either as each 25% milestone is crossed, or, 180 days after
            approval, whatever remains, so partial funding still reaches the
            treating hospital. Blockchain records
            are public and permanent and cannot be deleted by anyone,
            including us.
          </p>
        </section>

        <section className="legal__section">
          <h2>5. How we protect your data</h2>
          <ul>
            <li>
              <strong>Encryption at rest:</strong> case details, uploaded
              documents and hospital payout details are encrypted with
              AES-256-GCM before storage. Tampered files are rejected.
            </li>
            <li>
              <strong>Encryption in transit:</strong> all traffic uses HTTPS.
            </li>
            <li>
              <strong>Least access:</strong> documents can only be opened
              through a single-use hospital link that expires within 24 hours
              and is tied to the hospital’s email address.
            </li>
            <li>
              <strong>No secrets stored in plain text:</strong> access tokens
              are stored as one-way hashes; we never ask for seed phrases or
              private keys.
            </li>
            <li>
              <strong>File checks:</strong> uploads are limited to PDF, PNG and
              JPG and their contents are verified.
            </li>
            <li>
              <strong>Abuse protection:</strong> rate limits on submissions,
              verification links and donations.
            </li>
          </ul>
          <p>
            No system is perfectly secure. If we learn of a breach affecting
            your information we will notify you without undue delay.
          </p>
        </section>

        <section className="legal__section">
          <h2>6. Who we share it with</h2>
          <ul>
            <li>The hospital you name, for verification only.</li>
            <li>
              Service providers that run the platform for us (hosting, email
              delivery, Solana network access), under confidentiality
              obligations.
            </li>
            <li>Authorities, only when the law requires it.</li>
          </ul>
          <p>We never sell or rent personal information.</p>
        </section>

        <section className="legal__section">
          <h2>7. How long we keep it</h2>
          <p>
            We keep case records while the campaign is active and afterwards
            only as long as needed for payout records, fraud prevention and
            legal obligations. You can ask us to delete your documents once
            the campaign has ended. On-chain records cannot be deleted.
          </p>
        </section>

        <section className="legal__section">
          <h2>8. Your choices and rights</h2>
          <ul>
            <li>Ask for a copy of the information we hold about you.</li>
            <li>Ask us to correct or delete it (subject to the limits above).</li>
            <li>Withdraw consent to the patient’s public details from your case page.</li>
            <li>Donate anonymously.</li>
            <li>Withdraw a case before it is verified by contacting us.</li>
          </ul>
        </section>

        <section className="legal__section">
          <h2>9. Changes and contact</h2>
          <p>
            If we change this policy we will update the date above. Questions
            or requests:{' '}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
          <p>
            <Link to="/">Back to home</Link>
          </p>
        </section>
      </div>
    </main>
  )
}
