/**
 * Case create + cookie smoke test against a running API + Postgres.
 * Usage: npx tsx server/cases/httpCase.smoke.ts
 *
 * Day 2: multipart upload with ≥2 demo docs; gap computed server-side.
 */
const BASE = `http://127.0.0.1:${process.env.PORT ?? '8787'}`
const ORIGIN = process.env.APP_ORIGIN ?? 'http://localhost:5173'

function tinyPdf(): Blob {
  return new Blob([Buffer.from('%PDF-1.4 demo')], { type: 'application/pdf' })
}

function tinyPng(): Blob {
  // Minimal PNG signature + bytes (not a valid image; MIME is what multer sees)
  const bytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  ])
  return new Blob([bytes], { type: 'image/png' })
}

async function main() {
  const form = new FormData()
  form.append('treatmentSummary', 'Demo enzyme replacement therapy')
  form.append('providerOrganizationName', "Himalaya Children's Hospital (Demo)")
  form.append('hospitalInstitutionalEmail', 'billing@himalaya-demo.org')
  form.append('providerCostUsdc', '5000')
  form.append('externalAssistanceUsdc', '2000')
  form.append('patientContributionUsdc', '500')
  form.append('storyConsent', 'true')
  form.append('storySharedBy', 'GUARDIAN')
  form.append('storyDisplayName', 'Smoke Test Patient')
  form.append('storyCondition', 'Gaucher disease')
  form.append('storyTreatment', 'Enzyme replacement therapy')
  form.append('documents', tinyPdf(), 'diagnosis-demo.pdf')
  form.append('documentTypes', 'DIAGNOSIS_SUMMARY')
  form.append('documents', tinyPng(), 'plan-demo.png')
  form.append('documentTypes', 'TREATMENT_PLAN')

  const createRes = await fetch(`${BASE}/api/cases`, {
    method: 'POST',
    headers: { Origin: ORIGIN },
    body: form,
  })

  if (!createRes.ok) {
    const text = await createRes.text()
    throw new Error(`create failed ${createRes.status}: ${text}`)
  }

  const created = (await createRes.json()) as {
    publicCaseId: string
    fundingGapUsdc: string
    status: string
    documents?: Array<{ documentType: string; originalFilename: string }>
    hospitalInstitutionalEmail?: string
    demoInboxEmail?: { to: string; publicCaseId: string; verifyUrl: string }
  }

  if (
    !/^[2-9A-HJ-NP-Z]{5}$/i.test(created.publicCaseId) &&
    !created.publicCaseId.startsWith('RD-')
  ) {
    throw new Error(`unexpected publicCaseId: ${created.publicCaseId}`)
  }
  if (created.fundingGapUsdc !== '2500') {
    throw new Error(`unexpected funding gap: ${created.fundingGapUsdc}`)
  }
  if (created.status !== 'AWAITING_HOSPITAL') {
    throw new Error('unexpected status')
  }
  if (!created.documents || created.documents.length < 2) {
    throw new Error('expected ≥2 documents in response')
  }
  if (created.hospitalInstitutionalEmail !== 'billing@himalaya-demo.org') {
    throw new Error('hospital email missing from owner view')
  }
  if (
    created.demoInboxEmail?.publicCaseId !== created.publicCaseId ||
    !created.demoInboxEmail.verifyUrl.includes('/verify/')
  ) {
    throw new Error('expected demo inbox email for the demo hospital')
  }

  // Personal email must be rejected
  const badForm = new FormData()
  badForm.append('treatmentSummary', 'Demo')
  badForm.append('providerOrganizationName', 'Demo')
  badForm.append('hospitalInstitutionalEmail', 'patient@gmail.com')
  badForm.append('providerCostUsdc', '100')
  badForm.append('externalAssistanceUsdc', '0')
  badForm.append('patientContributionUsdc', '0')
  badForm.append('documents', tinyPdf(), 'a.pdf')
  badForm.append('documentTypes', 'DIAGNOSIS_SUMMARY')
  badForm.append('documents', tinyPng(), 'b.png')
  badForm.append('documentTypes', 'TREATMENT_PLAN')
  const badRes = await fetch(`${BASE}/api/cases`, {
    method: 'POST',
    headers: { Origin: ORIGIN },
    body: badForm,
  })
  if (badRes.status !== 400) {
    throw new Error(`expected 400 for gmail, got ${badRes.status}`)
  }

  const setCookie = createRes.headers.getSetCookie?.() ?? []
  const cookieHeader =
    setCookie.find(c => c.startsWith('rdcf_case_access='))?.split(';')[0] ??
    createRes.headers
      .get('set-cookie')
      ?.split(',')
      .map(s => s.trim())
      .find(s => s.startsWith('rdcf_case_access='))
      ?.split(';')[0]

  if (!cookieHeader) {
    throw new Error('missing case-access Set-Cookie')
  }
  if (
    !/httponly/i.test(
      setCookie.join(';') || createRes.headers.get('set-cookie') || ''
    )
  ) {
    throw new Error('case-access cookie is not HttpOnly')
  }

  const currentRes = await fetch(`${BASE}/api/cases/current`, {
    headers: { Origin: ORIGIN, Cookie: cookieHeader },
  })
  const current = (await currentRes.json()) as {
    accessible: boolean
    case?: {
      publicCaseId: string
      treatmentSummary: string
      fundingGapUsdc: string
      documents?: unknown[]
    }
  }
  if (
    !current.accessible ||
    current.case?.publicCaseId !== created.publicCaseId
  ) {
    throw new Error('current case access failed')
  }
  if (current.case?.treatmentSummary !== 'Demo enzyme replacement therapy') {
    throw new Error('private payload not decrypted for owner')
  }
  if (current.case?.fundingGapUsdc !== '2500') {
    throw new Error('gap mismatch on current')
  }
  if (!current.case?.documents || current.case.documents.length < 2) {
    throw new Error('documents not listed on current')
  }

  const byIdRes = await fetch(`${BASE}/api/cases/${created.publicCaseId}`, {
    headers: { Origin: ORIGIN, Cookie: cookieHeader },
  })
  if (!byIdRes.ok) throw new Error('by-id access failed')

  const deniedRes = await fetch(`${BASE}/api/cases/${created.publicCaseId}`, {
    headers: { Origin: ORIGIN },
  })
  if (deniedRes.status !== 401) {
    throw new Error(`expected 401 without cookie, got ${deniedRes.status}`)
  }

  console.log(
    `HTTP case smoke OK: ${created.publicCaseId} gap=${created.fundingGapUsdc} docs=${created.documents.length} status=${created.status}`
  )
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
