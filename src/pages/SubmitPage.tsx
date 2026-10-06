import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { faLock } from '@fortawesome/free-solid-svg-icons'
import StepIndicator from '../components/StepIndicator'
import SectionHeading from '../components/SectionHeading'
import FaIcon from '../components/FaIcon'
import { CaseApiError, createCase, fetchCurrentCase } from '../lib/caseApi'
import { COVER_IMAGE_ACCEPT, prepareCoverImage } from '../lib/coverImage'

const STEPS = [
  { label: 'Treatment need' },
  { label: 'Cost & institution' },
  { label: 'Assistance' },
  { label: 'Public details' },
  { label: 'Photo, documents & submit' },
]

const STORY_STEP = 3
const FINAL_STEP = 4

const PUBLIC_CONSENT_TEXT =
  "I consent to the patient's name and condition being displayed publicly. Medical documents remain private and off-chain."

interface StoryState {
  sharedBy: '' | 'PATIENT' | 'GUARDIAN'
  displayName: string
  country: string
  condition: string
  treatment: string
  story: string
  consent: boolean
}

const INITIAL_STORY: StoryState = {
  sharedBy: '',
  displayName: '',
  country: '',
  condition: '',
  treatment: '',
  story: '',
  consent: false,
}

/** Hosted API functions reject request bodies above ~4.5 MB. */
const MAX_UPLOAD_TOTAL_BYTES = 4 * 1024 * 1024

const DOCUMENT_TYPE_OPTIONS = [
  { value: 'DIAGNOSIS_SUMMARY', label: 'Diagnosis summary' },
  { value: 'TREATMENT_PLAN', label: 'Treatment plan' },
  { value: 'MEDICATION_BILL', label: 'Medication / bill' },
  { value: 'ASSISTANCE_PROOF', label: 'Assistance proof' },
] as const

type DocumentTypeValue = (typeof DOCUMENT_TYPE_OPTIONS)[number]['value']

interface PendingDoc {
  id: string
  file: File
  documentType: DocumentTypeValue
}

interface FormState {
  treatmentDescription: string
  providerName: string
  hospitalEmail: string
  providerCostEstimate: string
  externalAssistance: string
  patientContribution: string
}

const INITIAL_STATE: FormState = {
  treatmentDescription: '',
  providerName: '',
  hospitalEmail: '',
  providerCostEstimate: '',
  externalAssistance: '0',
  patientContribution: '0',
}

function clientGapPreview(form: FormState): string {
  const cost = Number.parseFloat(form.providerCostEstimate) || 0
  const assist = Number.parseFloat(form.externalAssistance) || 0
  const contrib = Number.parseFloat(form.patientContribution) || 0
  const gap = cost - assist - contrib
  if (!Number.isFinite(gap) || cost <= 0) return '—'
  return gap.toFixed(gap % 1 === 0 ? 0 : 2)
}

export default function SubmitPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<FormState>(INITIAL_STATE)
  const [errors, setErrors] = useState<Partial<FormState> & { documents?: string }>(
    {}
  )
  const [docs, setDocs] = useState<PendingDoc[]>([])
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [existingCaseId, setExistingCaseId] = useState<string | null>(null)
  const [coverImage, setCoverImage] = useState<File | null>(null)
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null)
  const [coverError, setCoverError] = useState<string | null>(null)
  const [coverProcessing, setCoverProcessing] = useState(false)
  const [story, setStory] = useState<StoryState>(INITIAL_STORY)
  const [storyError, setStoryError] = useState<string | null>(null)

  function updateStory<K extends keyof StoryState>(field: K, value: StoryState[K]) {
    setStory(s => ({ ...s, [field]: value }))
    setStoryError(null)
    setFormError(null)
  }

  useEffect(() => {
    if (!coverImage) {
      setCoverPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(coverImage)
    setCoverPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [coverImage])

  async function selectCoverImage(file: File | undefined) {
    if (!file) return
    setCoverError(null)
    setCoverProcessing(true)
    try {
      setCoverImage(await prepareCoverImage(file))
    } catch (err) {
      setCoverError(
        err instanceof Error ? err.message : 'That image could not be used.'
      )
    } finally {
      setCoverProcessing(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    async function checkExisting() {
      try {
        const current = await fetchCurrentCase()
        if (!cancelled && current.accessible && current.case) {
          setExistingCaseId(current.case.publicCaseId)
        }
      } catch {
        // browsing still works if API is down
      }
    }
    void checkExisting()
    return () => {
      cancelled = true
    }
  }, [])

  function update(field: keyof FormState, value: string) {
    setForm(f => ({ ...f, [field]: value }))
    setErrors(e => ({ ...e, [field]: '' }))
    setFormError(null)
  }

  function usedTypes(): Set<string> {
    return new Set(docs.map(d => d.documentType))
  }

  function addFiles(fileList: FileList | null) {
    if (!fileList?.length) return
    setFormError(null)
    setErrors(e => ({ ...e, documents: undefined }))
    const next = [...docs]
    const taken = usedTypes()
    for (const file of Array.from(fileList)) {
      if (next.length >= 8) break
      const available = DOCUMENT_TYPE_OPTIONS.find(o => !taken.has(o.value))
      if (!available) break
      taken.add(available.value)
      next.push({
        id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
        file,
        documentType: available.value,
      })
    }
    setDocs(next)
  }

  function updateDocType(id: string, documentType: DocumentTypeValue) {
    setDocs(prev =>
      prev.map(d => (d.id === id ? { ...d, documentType } : d))
    )
  }

  function removeDoc(id: string) {
    setDocs(prev => prev.filter(d => d.id !== id))
  }

  function uploadBytes(): number {
    return (
      docs.reduce((sum, d) => sum + d.file.size, 0) + (coverImage?.size ?? 0)
    )
  }

  function validateStep(): boolean {
    const newErrors: Partial<FormState> & { documents?: string } = {}
    if (step === 0 && !form.treatmentDescription.trim()) {
      newErrors.treatmentDescription = 'Please describe the treatment need.'
    }
    if (step === 1) {
      if (!form.providerName.trim()) {
        newErrors.providerName = 'Institution or provider name is required.'
      }
      if (!form.hospitalEmail.trim()) {
        newErrors.hospitalEmail = 'Institution contact email is required.'
      } else if (!form.hospitalEmail.includes('@')) {
        newErrors.hospitalEmail = 'Enter a valid institution email.'
      }
      if (!form.providerCostEstimate.trim()) {
        newErrors.providerCostEstimate = 'Enter the estimated treatment cost.'
      }
    }
    if (step === STORY_STEP) {
      const storyLength = story.story.trim().length
      let message: string | null = null
      if (!story.sharedBy) message = 'Tell us whether you are the patient or their parent / guardian.'
      else if (!story.displayName.trim()) message = "Enter the patient's name as it should appear publicly."
      else if (!story.condition.trim()) message = 'Enter the condition (disease) to display.'
      else if (!story.treatment.trim()) message = 'Enter the treatment to display.'
      else if (storyLength > 0 && storyLength < 20) message = 'Write at least a couple of sentences, or leave the story empty.'
      else if (!story.consent) message = 'Tick the consent box to continue.'
      setStoryError(message)
      if (message) return false
    }
    if (step === FINAL_STEP) {
      if (docs.length < 2) {
        newErrors.documents =
          'Upload at least two supporting documents (PDF, PNG, or JPG).'
      }
      const types = docs.map(d => d.documentType)
      if (new Set(types).size !== types.length) {
        newErrors.documents = 'Each document type may only be used once.'
      }
      if (uploadBytes() > MAX_UPLOAD_TOTAL_BYTES) {
        newErrors.documents =
          'Files add up to more than 4 MB in total. Please upload smaller scans or compress the PDFs.'
      }
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  function handleNext() {
    if (validateStep()) setStep(s => s + 1)
  }

  function handleBack() {
    setStep(s => s - 1)
  }

  async function handleSubmit() {
    if (!validateStep()) return
    setSubmitting(true)
    setFormError(null)
    try {
      const created = await createCase({
        treatmentSummary: form.treatmentDescription.trim(),
        providerOrganizationName: form.providerName.trim(),
        hospitalInstitutionalEmail: form.hospitalEmail.trim(),
        providerCostUsdc: form.providerCostEstimate.trim(),
        externalAssistanceUsdc: form.externalAssistance.trim() || '0',
        patientContributionUsdc: form.patientContribution.trim() || '0',
        documents: docs.map(d => ({
          file: d.file,
          documentType: d.documentType,
        })),
        coverImage: coverImage ?? undefined,
        publicStory: {
          sharedBy: story.sharedBy || 'PATIENT',
          displayName: story.displayName.trim(),
          country: story.country.trim(),
          condition: story.condition.trim(),
          treatment: story.treatment.trim(),
          story: story.story.trim(),
        },
      })
      navigate(`/submit/status/${created.publicCaseId}`, { replace: true })
    } catch (err) {
      setFormError(
        err instanceof CaseApiError
          ? err.message
          : 'We could not submit your case. Please try again.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main id="main-content" className="page-submit">
      <div className="container">
        <div className="page-submit__header">
          <SectionHeading
            as="h1"
            title="Submit a healthcare funding gap case"
            subtitle="Describe the treatment need, costs, and institution contact. Supporting documents stay off-chain — only funding amounts go to verification."
          />
          <p className="submit-no-wallet-note">
            <FaIcon icon={faLock} />
            You do not need a crypto wallet to submit a case.
          </p>
          {existingCaseId && (
            <p className="submit-existing-case" role="status">
              This browser already has private access to case{' '}
              <strong>{existingCaseId}</strong>.{' '}
              <Link to={`/submit/status/${existingCaseId}`}>
                View submitted case
              </Link>
            </p>
          )}
        </div>

        <div className="submit-form-wrap">
          <StepIndicator steps={STEPS} currentStep={step} />

          <div className="submit-form__card">
            {step === 0 && (
              <section aria-labelledby="step-0-heading">
                <h2 id="step-0-heading" className="submit-form__step-title">
                  Treatment need
                </h2>
                <p className="submit-form__step-intro">
                  Provide a short summary of the care need. The hospital uses
                  this to verify your case.
                </p>

                <p className="privacy-small">
                  Private narrative fields are encrypted at rest and are never
                  written on-chain.
                </p>

                <div className="field-group">
                  <label htmlFor="treatmentDescription" className="field-label">
                    Brief description of treatment need{' '}
                    <span className="field-required" aria-hidden="true">
                      *
                    </span>
                  </label>
                  <p
                    className="field-help field-help--warning"
                    id="treatment-demo-note"
                  >
                    Keep it brief. You don&apos;t need to include names or medical
                    record numbers here — the hospital already has those.
                  </p>
                  <textarea
                    id="treatmentDescription"
                    className={`field-input field-textarea${errors.treatmentDescription ? ' field-input--error' : ''}`}
                    placeholder="e.g. Enzyme replacement therapy for a confirmed rare diagnosis"
                    rows={3}
                    value={form.treatmentDescription}
                    onChange={e =>
                      update('treatmentDescription', e.target.value)
                    }
                    aria-describedby={
                      errors.treatmentDescription
                        ? 'treatment-demo-note err-treatment'
                        : 'treatment-demo-note'
                    }
                  />
                  {errors.treatmentDescription && (
                    <p id="err-treatment" className="field-error" role="alert">
                      {errors.treatmentDescription}
                    </p>
                  )}
                </div>
              </section>
            )}

            {step === 1 && (
              <section aria-labelledby="step-1-heading">
                <h2 id="step-1-heading" className="submit-form__step-title">
                  Cost & institution
                </h2>
                <p className="submit-form__step-intro">
                  Enter the treating institution, an institutional contact email
                  (not Gmail/Yahoo/etc.), and estimated treatment cost.
                </p>

                <div className="field-group">
                  <label htmlFor="providerName" className="field-label">
                    Institution / provider name{' '}
                    <span className="field-required" aria-hidden="true">
                      *
                    </span>
                  </label>
                  <input
                    id="providerName"
                    type="text"
                    className={`field-input${errors.providerName ? ' field-input--error' : ''}`}
                    placeholder="e.g. City Specialty Hospital"
                    value={form.providerName}
                    onChange={e => update('providerName', e.target.value)}
                    aria-describedby={
                      errors.providerName ? 'err-provider' : undefined
                    }
                  />
                  {errors.providerName && (
                    <p id="err-provider" className="field-error" role="alert">
                      {errors.providerName}
                    </p>
                  )}
                </div>

                <div className="field-group">
                  <label htmlFor="hospitalEmail" className="field-label">
                    Institution contact email{' '}
                    <span className="field-required" aria-hidden="true">
                      *
                    </span>
                  </label>
                  <p className="field-help" id="hospital-email-help">
                    Use the hospital or clinic&apos;s official email (it must be on
                    our verified hospital list). Personal email domains are
                    rejected.
                  </p>
                  <input
                    id="hospitalEmail"
                    type="email"
                    autoComplete="off"
                    className={`field-input${errors.hospitalEmail ? ' field-input--error' : ''}`}
                    placeholder="billing@yourhospital.org"
                    value={form.hospitalEmail}
                    onChange={e => update('hospitalEmail', e.target.value)}
                    aria-describedby={
                      errors.hospitalEmail
                        ? 'hospital-email-help err-hospital-email'
                        : 'hospital-email-help'
                    }
                  />
                  {errors.hospitalEmail && (
                    <p
                      id="err-hospital-email"
                      className="field-error"
                      role="alert"
                    >
                      {errors.hospitalEmail}
                    </p>
                  )}
                </div>

                <div className="field-group">
                  <label htmlFor="providerCostEstimate" className="field-label">
                    Estimated treatment cost (USDC equivalent){' '}
                    <span className="field-required" aria-hidden="true">
                      *
                    </span>
                  </label>
                  <input
                    id="providerCostEstimate"
                    type="text"
                    inputMode="decimal"
                    className={`field-input${errors.providerCostEstimate ? ' field-input--error' : ''}`}
                    placeholder="e.g. 8000"
                    value={form.providerCostEstimate}
                    onChange={e =>
                      update('providerCostEstimate', e.target.value)
                    }
                    aria-describedby={
                      errors.providerCostEstimate ? 'err-cost' : undefined
                    }
                  />
                  {errors.providerCostEstimate && (
                    <p id="err-cost" className="field-error" role="alert">
                      {errors.providerCostEstimate}
                    </p>
                  )}
                </div>
              </section>
            )}

            {step === 2 && (
              <section aria-labelledby="step-2-heading">
                <h2 id="step-2-heading" className="submit-form__step-title">
                  Assistance & contribution
                </h2>

                <div className="field-group">
                  <label htmlFor="externalAssistance" className="field-label">
                    External assistance, if any
                  </label>
                  <p className="field-help">
                    Insurance, charity support, grants, or other confirmed
                    support.
                  </p>
                  <input
                    id="externalAssistance"
                    type="text"
                    inputMode="decimal"
                    className="field-input"
                    value={form.externalAssistance}
                    onChange={e => update('externalAssistance', e.target.value)}
                  />
                </div>

                <div className="field-group">
                  <label htmlFor="patientContribution" className="field-label">
                    Your contribution, if any
                  </label>
                  <input
                    id="patientContribution"
                    type="text"
                    inputMode="decimal"
                    className="field-input"
                    value={form.patientContribution}
                    onChange={e =>
                      update('patientContribution', e.target.value)
                    }
                  />
                </div>

                <div className="summary-card">
                  <h3 className="summary-card__title">Estimated funding gap</h3>
                  <p className="summary-card__body">
                    Preview only — the server recalculates{' '}
                    <code>cost − assistance − contribution</code> and never
                    trusts this client value.
                  </p>
                  <p className="summary-card__gap">
                    {clientGapPreview(form)} USDC
                  </p>
                </div>
              </section>
            )}

            {step === STORY_STEP && (
              <section aria-labelledby="step-story-heading">
                <h2 id="step-story-heading" className="submit-form__step-title">
                  Public details
                </h2>
                <p className="submit-form__step-intro">
                  Once the hospital verifies the case, the campaign page shows the
                  patient&apos;s name, condition, treatment and the funding gap.
                  Medical documents are never shown. You can withdraw these details
                  later from your case page.
                </p>

                <div className="story-fields">
                    <fieldset className="story-choice">
                      <legend className="field-label">
                        Who is sharing?{' '}
                        <span className="field-required" aria-hidden="true">*</span>
                      </legend>
                      <label className="story-choice__option story-choice__option--inline">
                        <input
                          type="radio"
                          name="storySharedBy"
                          checked={story.sharedBy === 'PATIENT'}
                          onChange={() => updateStory('sharedBy', 'PATIENT')}
                        />
                        <span>I am the patient</span>
                      </label>
                      <label className="story-choice__option story-choice__option--inline">
                        <input
                          type="radio"
                          name="storySharedBy"
                          checked={story.sharedBy === 'GUARDIAN'}
                          onChange={() => updateStory('sharedBy', 'GUARDIAN')}
                        />
                        <span>I am the patient&apos;s parent or legal guardian</span>
                      </label>
                    </fieldset>

                    <div className="story-fields__row">
                      <div className="field-group">
                        <label htmlFor="storyDisplayName" className="field-label">
                          Patient name{' '}
                          <span className="field-required" aria-hidden="true">*</span>
                        </label>
                        <input
                          id="storyDisplayName"
                          type="text"
                          maxLength={60}
                          className="field-input"
                          placeholder="e.g. Aarav Shrestha"
                          value={story.displayName}
                          onChange={e => updateStory('displayName', e.target.value)}
                        />
                      </div>
                      <div className="field-group">
                        <label htmlFor="storyCountry" className="field-label">Country (optional)</label>
                        <input
                          id="storyCountry"
                          type="text"
                          maxLength={60}
                          className="field-input"
                          placeholder="e.g. Nepal"
                          value={story.country}
                          onChange={e => updateStory('country', e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="story-fields__row">
                      <div className="field-group">
                        <label htmlFor="storyCondition" className="field-label">
                          Condition{' '}
                          <span className="field-required" aria-hidden="true">*</span>
                        </label>
                        <input
                          id="storyCondition"
                          type="text"
                          maxLength={120}
                          className="field-input"
                          placeholder="e.g. Spinal Muscular Atrophy (SMA)"
                          value={story.condition}
                          onChange={e => updateStory('condition', e.target.value)}
                        />
                      </div>
                      <div className="field-group">
                        <label htmlFor="storyTreatment" className="field-label">
                          Treatment{' '}
                          <span className="field-required" aria-hidden="true">*</span>
                        </label>
                        <input
                          id="storyTreatment"
                          type="text"
                          maxLength={160}
                          className="field-input"
                          placeholder="e.g. Nusinersen loading doses"
                          value={story.treatment}
                          onChange={e => updateStory('treatment', e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="field-group">
                      <label htmlFor="storyText" className="field-label">
                        Short story (optional)
                      </label>
                      <p className="field-help field-help--warning">
                        Don&apos;t include surnames, addresses, phone numbers, ID or
                        medical record numbers, or photos of documents.
                      </p>
                      <textarea
                        id="storyText"
                        className="field-input field-textarea"
                        rows={6}
                        maxLength={2000}
                        placeholder="Who is the patient, what treatment do they need, and what would it change for your family?"
                        value={story.story}
                        onChange={e => updateStory('story', e.target.value)}
                      />
                      <p className="field-help">{story.story.length} / 2000</p>
                    </div>

                    <label className="story-consent">
                      <input
                        type="checkbox"
                        required
                        aria-required="true"
                        checked={story.consent}
                        onChange={e => updateStory('consent', e.target.checked)}
                      />
                      <span>
                        {PUBLIC_CONSENT_TEXT}{' '}
                        <span className="field-required" aria-hidden="true">*</span>
                      </span>
                    </label>
                    <p className="field-help">
                      If you withdraw later, the details are removed from this site,
                      but copies others already made cannot be recalled.
                    </p>
                  </div>

                {storyError && (
                  <p className="field-error" role="alert">
                    {storyError}
                  </p>
                )}
              </section>
            )}

            {step === FINAL_STEP && (
              <section aria-labelledby="step-3-heading">
                <h2 id="step-3-heading" className="submit-form__step-title">
                  Campaign photo
                </h2>
                <p className="submit-form__step-intro">
                  Optional. Donors see this photo on your campaign page once the
                  hospital approves it.
                </p>

                <div className="cover-upload">
                  {coverPreviewUrl ? (
                    <div className="cover-upload__preview">
                      <img src={coverPreviewUrl} alt="Campaign photo preview" />
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => setCoverImage(null)}
                      >
                        Remove photo
                      </button>
                    </div>
                  ) : (
                    <label className="doc-upload__drop">
                      <span className="doc-upload__drop-title">
                        {coverProcessing ? 'Processing…' : 'Add a photo (PNG / JPG)'}
                      </span>
                      <span className="doc-upload__drop-hint">
                        A friendly photo helps donors connect with your story
                      </span>
                      <input
                        type="file"
                        accept={COVER_IMAGE_ACCEPT}
                        disabled={coverProcessing}
                        onChange={e => {
                          void selectCoverImage(e.target.files?.[0])
                          e.target.value = ''
                        }}
                      />
                    </label>
                  )}
                  <p className="field-help field-help--warning">
                    This photo is public. Don&apos;t use medical documents, bills,
                    or anything showing names, ID numbers, or addresses.
                    Location data is removed automatically.
                  </p>
                  {coverError && (
                    <p className="field-error" role="alert">
                      {coverError}
                    </p>
                  )}
                </div>

                <h2 className="submit-form__step-title">
                  Supporting documents
                </h2>
                <p className="submit-form__step-intro">
                  Upload at least two documents (PDF, PNG, or JPG). They are
                  encrypted, shared only with the hospital for verification, and
                  never made public or put on-chain.
                </p>

                <div className="doc-upload">
                  <label className="doc-upload__drop">
                    <span className="doc-upload__drop-title">
                      Add PDF / PNG / JPG
                    </span>
                    <span className="doc-upload__drop-hint">
                      Diagnosis summary, treatment plan, medication/bill, or
                      assistance proof
                    </span>
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                      multiple
                      onChange={e => {
                        addFiles(e.target.files)
                        e.target.value = ''
                      }}
                    />
                  </label>

                  {docs.length > 0 && (
                    <ul className="doc-upload__list">
                      {docs.map(doc => (
                        <li key={doc.id} className="doc-upload__item">
                          <div className="doc-upload__meta">
                            <span className="doc-upload__name">
                              {doc.file.name}
                            </span>
                            <span className="doc-upload__size">
                              {(doc.file.size / 1024).toFixed(1)} KB
                            </span>
                          </div>
                          <select
                            className="field-input doc-upload__type"
                            value={doc.documentType}
                            aria-label={`Document type for ${doc.file.name}`}
                            onChange={e =>
                              updateDocType(
                                doc.id,
                                e.target.value as DocumentTypeValue
                              )
                            }
                          >
                            {DOCUMENT_TYPE_OPTIONS.map(opt => (
                              <option
                                key={opt.value}
                                value={opt.value}
                                disabled={
                                  usedTypes().has(opt.value) &&
                                  doc.documentType !== opt.value
                                }
                              >
                                {opt.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="btn btn--ghost doc-upload__remove"
                            onClick={() => removeDoc(doc.id)}
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {errors.documents && (
                    <p className="field-error" role="alert">
                      {errors.documents}
                    </p>
                  )}
                </div>

                <div className="summary-card">
                  <h3 className="summary-card__title">Ready to submit</h3>
                  <dl className="summary-card__dl">
                    <div className="summary-card__row">
                      <dt>Treatment cost</dt>
                      <dd>
                        {form.providerCostEstimate.trim()
                          ? `${form.providerCostEstimate.trim()} USDC`
                          : '—'}
                      </dd>
                    </div>
                    <div className="summary-card__row">
                      <dt>Assistance</dt>
                      <dd>{form.externalAssistance.trim() || '0'} USDC</dd>
                    </div>
                    <div className="summary-card__row">
                      <dt>Your contribution</dt>
                      <dd>{form.patientContribution.trim() || '0'} USDC</dd>
                    </div>
                    <div className="summary-card__row summary-card__row--emphasis">
                      <dt>Estimated gap (preview)</dt>
                      <dd>{clientGapPreview(form)} USDC</dd>
                    </div>
                    <div className="summary-card__row">
                      <dt>Documents</dt>
                      <dd>{docs.length}</dd>
                    </div>
                    <div className="summary-card__row">
                      <dt>Campaign photo</dt>
                      <dd>{coverImage ? 'Added' : 'None'}</dd>
                    </div>
                    <div className="summary-card__row">
                      <dt>Shown publicly</dt>
                      <dd>
                        {[story.displayName.trim(), story.condition.trim()]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </dd>
                    </div>
                  </dl>
                </div>

                <p className="submit-final-privacy" role="note">
                  By submitting, you confirm you are the patient or are
                  authorized to act for them, and you agree that these details
                  and documents are shared with the hospital you listed so it
                  can verify the case. Documents are encrypted and never written
                  on-chain. The patient&apos;s name, condition, treatment and the
                  funding gap are shown on the campaign page once the hospital
                  verifies the case. See our{' '}
                  <Link to="/privacy">Privacy Policy</Link>.
                </p>
              </section>
            )}

            {formError && (
              <div
                className="submit-form__error"
                role="alert"
                aria-live="assertive"
              >
                <p>{formError}</p>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={submitting}
                  onClick={() => {
                    void handleSubmit()
                  }}
                >
                  Try again
                </button>
              </div>
            )}

            <div className="submit-form__nav">
              {step > 0 && (
                <button
                  className="btn btn--ghost"
                  onClick={handleBack}
                  type="button"
                  disabled={submitting}
                >
                  ← Back
                </button>
              )}
              {step < STEPS.length - 1 ? (
                <button
                  className="btn btn--primary"
                  onClick={handleNext}
                  type="button"
                >
                  Continue →
                </button>
              ) : (
                <button
                  className="btn btn--primary"
                  onClick={() => {
                    void handleSubmit()
                  }}
                  type="button"
                  disabled={submitting || coverProcessing}
                  aria-busy={submitting}
                >
                  {submitting ? 'Submitting…' : 'Submit case'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
