/**
 * Hospital verify + USDC payout + publish + cover image smoke (local dev).
 */
const BASE = `http://127.0.0.1:${process.env.PORT ?? '8787'}`
const ORIGIN = process.env.APP_ORIGIN ?? 'http://localhost:5173'
const ADMIN = process.env.ADMIN_SECRET ?? 'rdcf-demo-admin'

function tinyPdf(): Blob {
  return new Blob([Buffer.from('%PDF-1.4 demo')], { type: 'application/pdf' })
}

function tinyPng(): Blob {
  const bytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  ])
  return new Blob([bytes], { type: 'image/png' })
}

/** Minimal JPEG structure carrying an EXIF GPS segment that must be stripped. */
function jpegWithGps(): Blob {
  const exif = Buffer.from('Exif\0\0GPSLatitude=27.7172', 'latin1')
  const len = Buffer.alloc(2)
  len.writeUInt16BE(exif.length + 2)
  const bytes = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe1]),
    len,
    exif,
    Buffer.from([0xff, 0xda, 0x00, 0x04, 0x00, 0x00]),
    Buffer.from('scan', 'latin1'),
    Buffer.from([0xff, 0xd9]),
  ])
  return new Blob([bytes], { type: 'image/jpeg' })
}

const DEMO_USDC_PAYOUT = {
  payoutMethod: 'USDC',
  usdcWalletAddress: '3ChG4eL5EvhrELWbAZs3cdVt8P9X1CfrRwfF6gqfKG9d',
}

async function main() {
  const form = new FormData()
  form.append('treatmentSummary', 'Day 4 settlement demo')
  form.append('providerOrganizationName', "Himalaya Children's Hospital (Demo)")
  form.append('hospitalInstitutionalEmail', 'billing@himalaya-demo.org')
  form.append('providerCostUsdc', '4000')
  form.append('externalAssistanceUsdc', '1000')
  form.append('patientContributionUsdc', '500')
  form.append('storyConsent', 'true')
  form.append('storySharedBy', 'PATIENT')
  form.append('storyDisplayName', 'Smoke Test Patient')
  form.append('storyCondition', 'Fabry disease')
  form.append('storyTreatment', 'Enzyme replacement therapy')
  form.append('documents', tinyPdf(), 'dx.pdf')
  form.append('documentTypes', 'DIAGNOSIS_SUMMARY')
  form.append('documents', tinyPng(), 'plan.png')
  form.append('documentTypes', 'TREATMENT_PLAN')
  form.append('coverImage', jpegWithGps(), 'cover.jpg')

  const createRes = await fetch(`${BASE}/api/cases`, {
    method: 'POST',
    headers: { Origin: ORIGIN },
    body: form,
  })
  if (!createRes.ok) {
    throw new Error(`create failed ${createRes.status}: ${await createRes.text()}`)
  }
  const created = (await createRes.json()) as {
    publicCaseId: string
    demoVerifyUrl?: string
  }
  if (!created.demoVerifyUrl) throw new Error('demoVerifyUrl missing')
  const token = decodeURIComponent(created.demoVerifyUrl.split('/verify/')[1]!)

  const hospitalCover = await fetch(
    `${BASE}/api/hospital/verify/${encodeURIComponent(token)}/cover-image`,
    { headers: { Origin: ORIGIN } }
  )
  if (hospitalCover.status !== 200) {
    throw new Error(`hospital cover preview ${hospitalCover.status}`)
  }

  // Approve without payout method → fail
  const noPayout = await fetch(
    `${BASE}/api/hospital/verify/${encodeURIComponent(token)}/approve`,
    {
      method: 'POST',
      headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reasonCode: 'RECORDS_MATCH' }),
    }
  )
  if (noPayout.status !== 400) {
    throw new Error(`expected payout required 400, got ${noPayout.status}`)
  }

  // Fiat payout → not supported yet
  const fiat = await fetch(
    `${BASE}/api/hospital/verify/${encodeURIComponent(token)}/approve`,
    {
      method: 'POST',
      headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reasonCode: 'RECORDS_MATCH', payoutMethod: 'FIAT' }),
    }
  )
  if (fiat.status !== 400) {
    throw new Error(`expected fiat not supported 400, got ${fiat.status}`)
  }

  const approveRes = await fetch(
    `${BASE}/api/hospital/verify/${encodeURIComponent(token)}/approve`,
    {
      method: 'POST',
      headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reasonCode: 'RECORDS_MATCH',
        ...DEMO_USDC_PAYOUT,
      }),
    }
  )
  if (!approveRes.ok) {
    throw new Error(`approve failed ${approveRes.status}: ${await approveRes.text()}`)
  }
  const approved = (await approveRes.json()) as {
    status: string
    verificationStatus: string
    campaignId: string
    verifiedFundingGapUsdc: string
  }
  if (approved.status !== 'HOSPITAL_VERIFIED') {
    throw new Error(`status ${approved.status}`)
  }
  if (approved.verificationStatus !== 'VERIFIED') {
    throw new Error('verificationStatus not VERIFIED')
  }
  if (approved.verifiedFundingGapUsdc !== '2500') {
    throw new Error(`gap ${approved.verifiedFundingGapUsdc}`)
  }

  // Hospital approval publishes immediately; a second admin publish is a no-op 409
  const pubRes = await fetch(
    `${BASE}/api/admin/campaigns/${approved.campaignId}/publish`,
    {
      method: 'POST',
      headers: {
        Origin: ORIGIN,
        'Content-Type': 'application/json',
        'X-Admin-Secret': ADMIN,
      },
      body: JSON.stringify({}),
    }
  )
  if (pubRes.status !== 409) {
    throw new Error(
      `expected already-published 409, got ${pubRes.status}: ${await pubRes.text()}`
    )
  }

  const detailRes = await fetch(
    `${BASE}/api/public/campaigns/${approved.campaignId}`,
    { headers: { Origin: ORIGIN } }
  )
  if (!detailRes.ok) throw new Error('public detail failed')
  const { campaign } = (await detailRes.json()) as {
    campaign: {
      verifiedFundingGoalUsdc: string
      verificationStatus: string
      verifiedByEmail: string | null
      status: string
      coverImageUrl: string | null
    }
  }
  if (!campaign.coverImageUrl) throw new Error('coverImageUrl missing')
  const imageRes = await fetch(`${BASE}${campaign.coverImageUrl}`, {
    headers: { Origin: ORIGIN },
  })
  if (
    imageRes.status !== 200 ||
    imageRes.headers.get('content-type') !== 'image/jpeg'
  ) {
    throw new Error(`public cover image ${imageRes.status}`)
  }
  const imageBytes = Buffer.from(await imageRes.arrayBuffer()).toString('latin1')
  if (imageBytes.includes('GPSLatitude') || !imageBytes.includes('scan')) {
    throw new Error('cover image metadata was not stripped correctly')
  }
  if (campaign.verifiedFundingGoalUsdc !== '2500') {
    throw new Error('public target mismatch')
  }
  if (campaign.verificationStatus !== 'VERIFIED') {
    throw new Error('public must be VERIFIED')
  }
  if (campaign.verifiedByEmail !== 'billing@himalaya-demo.org') {
    throw new Error(`badge email ${campaign.verifiedByEmail}`)
  }
  const publicJson = JSON.stringify(campaign)
  if (
    publicJson.includes(DEMO_USDC_PAYOUT.usdcWalletAddress) ||
    /encryptedSettlement|payoutWallet/i.test(publicJson)
  ) {
    throw new Error('payout data leaked on public campaign')
  }

  console.log(
    `Day 4 smoke OK: ${approved.campaignId} gap=2500 badge=${campaign.verifiedByEmail} status=${campaign.status} cover=stripped`
  )
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
