/**
 * Donation smoke — the API must refuse anything that isn't a verified on-chain USDC transfer.
 * Needs a running API and at least one published campaign (see httpHospitalVerify.smoke.ts).
 */
const BASE = `http://127.0.0.1:${process.env.PORT ?? '8787'}`
const ORIGIN = process.env.APP_ORIGIN ?? 'http://localhost:5173'

async function firstPublishedCampaign(): Promise<string> {
  const list = await fetch(`${BASE}/api/public/campaigns?pageSize=1`, {
    headers: { Origin: ORIGIN },
  })
  if (!list.ok) throw new Error(`list campaigns ${list.status}`)
  const body = (await list.json()) as {
    campaigns: Array<{ campaignId: string }>
  }
  const id = body.campaigns[0]?.campaignId
  if (!id) {
    throw new Error(
      'No published campaign. Create and hospital-approve one first (on-chain approval publishes it).'
    )
  }
  return id
}

async function donate(
  campaignId: string,
  body: Record<string, unknown>
): Promise<{ status: number; code: string | undefined }> {
  const res = await fetch(
    `${BASE}/api/public/campaigns/${campaignId}/donations`,
    {
      method: 'POST',
      headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  )
  const json = (await res.json().catch(() => ({}))) as {
    error?: { code?: string }
    code?: string
  }
  return { status: res.status, code: json.error?.code ?? json.code }
}

function expectRejected(
  label: string,
  result: { status: number; code: string | undefined },
  code?: string
) {
  if (result.status < 400) {
    throw new Error(`${label}: expected rejection, got ${result.status}`)
  }
  if (code && result.code !== code) {
    throw new Error(`${label}: expected ${code}, got ${result.code}`)
  }
}

async function main() {
  const campaignId = await firstPublishedCampaign()

  expectRejected(
    'fiat',
    await donate(campaignId, { amountUsdc: '20', method: 'FIAT' }),
    'FIAT_DONATION_NOT_SUPPORTED'
  )

  expectRejected(
    'missing tx',
    await donate(campaignId, { amountUsdc: '5', method: 'USDC' }),
    'DONATION_TX_REQUIRED'
  )

  expectRejected(
    'fake signature',
    await donate(campaignId, {
      amountUsdc: '5',
      method: 'USDC',
      txHash: '5'.repeat(88),
    })
  )

  console.log(`Donation smoke OK: ${campaignId} rejects fiat, missing and fake transactions`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
