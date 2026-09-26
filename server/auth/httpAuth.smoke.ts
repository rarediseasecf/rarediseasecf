/**
 * Lightweight HTTP cookie lifecycle check against a running local API.
 * Run with: npx tsx server/auth/httpAuth.smoke.ts
 * Expects API on PORT (default 8787).
 */
import nacl from 'tweetnacl'
import bs58 from 'bs58'
import { Keypair } from '@solana/web3.js'

const BASE = `http://127.0.0.1:${process.env.PORT ?? '8787'}`
const ORIGIN = process.env.APP_ORIGIN ?? 'http://localhost:5173'

function signMessage(keypair: Keypair, message: string): string {
  const sig = nacl.sign.detached(
    new TextEncoder().encode(message),
    keypair.secretKey
  )
  return bs58.encode(sig)
}

async function main() {
  const health = await fetch(`${BASE}/api/health`)
  if (!health.ok) throw new Error('health failed')

  const sessionNone = await fetch(`${BASE}/api/auth/session`, {
    headers: { Origin: ORIGIN },
  })
  const noneBody = await sessionNone.json()
  if (noneBody.authenticated !== false) {
    throw new Error('expected unauthenticated session')
  }

  const keypair = Keypair.generate()
  const publicKey = keypair.publicKey.toBase58()

  const challengeRes = await fetch(`${BASE}/api/auth/challenge`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: ORIGIN,
    },
    body: JSON.stringify({ publicKey }),
  })
  if (!challengeRes.ok) {
    throw new Error(`challenge failed: ${challengeRes.status}`)
  }
  const challenge = await challengeRes.json()

  const signature = signMessage(keypair, challenge.message)
  const verifyRes = await fetch(`${BASE}/api/auth/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: ORIGIN,
    },
    body: JSON.stringify({
      challengeId: challenge.challengeId,
      publicKey,
      signature,
    }),
  })
  if (!verifyRes.ok) {
    throw new Error(`verify failed: ${verifyRes.status}`)
  }

  const setCookie = verifyRes.headers.getSetCookie?.() ?? []
  const cookieHeader =
    setCookie[0]?.split(';')[0] ??
    verifyRes.headers.get('set-cookie')?.split(';')[0]
  if (!cookieHeader || !cookieHeader.includes('rdcf_session=')) {
    throw new Error('missing HttpOnly session cookie')
  }
  if (!/httponly/i.test(setCookie[0] ?? verifyRes.headers.get('set-cookie') ?? '')) {
    throw new Error('session cookie is not HttpOnly')
  }

  const sessionOk = await fetch(`${BASE}/api/auth/session`, {
    headers: { Origin: ORIGIN, Cookie: cookieHeader },
  })
  const okBody = await sessionOk.json()
  if (!okBody.authenticated || okBody.walletAddress !== publicKey) {
    throw new Error('session not authenticated after verify')
  }

  const logoutRes = await fetch(`${BASE}/api/auth/logout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: ORIGIN,
      Cookie: cookieHeader,
    },
    body: '{}',
  })
  const logoutBody = await logoutRes.json()
  if (logoutBody.authenticated !== false) {
    throw new Error('logout did not clear session')
  }

  console.log('HTTP smoke OK: challenge → verify (HttpOnly cookie) → session → logout')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
