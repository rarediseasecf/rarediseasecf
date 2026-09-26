/**
 * Reviewer session — distinct from donor WalletSessionProvider.
 * Server allowlist + HTTP-only cookie are the source of truth.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import bs58 from 'bs58'
import {
  ReviewerApiError,
  fetchReviewerSession,
  logoutReviewerSession,
  requestReviewerChallenge,
  verifyReviewerChallenge,
} from '../lib/reviewerApi'

export type ReviewerAuthStatus =
  | 'loading'
  | 'disconnected'
  | 'connected'
  | 'confirming'
  | 'awaiting_signature'
  | 'authorized'
  | 'denied'
  | 'error'

export type ReviewerErrorKind =
  | 'unsupported_wallet'
  | 'user_rejected'
  | 'challenge_failed'
  | 'verify_failed'
  | 'not_allowlisted'
  | 'session_expired'
  | 'backend_unavailable'
  | null

interface ReviewerSessionState {
  status: ReviewerAuthStatus
  authorized: boolean
  walletAddress: string | null
  expiresAt: string | null
  errorKind: ReviewerErrorKind
  isBusy: boolean
  emptyAllowlistHint: boolean
  confirmReviewerAccount: () => Promise<void>
  signOut: () => Promise<void>
  clearError: () => void
}

const ReviewerSessionContext = createContext<ReviewerSessionState | null>(null)

function mapError(err: unknown): ReviewerErrorKind {
  if (err instanceof ReviewerApiError) {
    if (err.code === 'REVIEWER_ACCESS_DENIED') return 'not_allowlisted'
    if (err.code === 'NETWORK_ERROR' || err.code === 'INTERNAL_ERROR') {
      return 'backend_unavailable'
    }
    if (err.code === 'CHALLENGE_EXPIRED' || err.code === 'CHALLENGE_NOT_FOUND') {
      return 'challenge_failed'
    }
    return 'verify_failed'
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase()
    if (
      msg.includes('user rejected') ||
      msg.includes('cancelled') ||
      msg.includes('canceled') ||
      msg.includes('denied')
    ) {
      return 'user_rejected'
    }
  }
  return 'verify_failed'
}

export function ReviewerSessionProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const { connected, publicKey, signMessage, disconnect } = useWallet()
  const [status, setStatus] = useState<ReviewerAuthStatus>('loading')
  const [authorized, setAuthorized] = useState(false)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [errorKind, setErrorKind] = useState<ReviewerErrorKind>(null)
  const [emptyAllowlistHint, setEmptyAllowlistHint] = useState(false)
  const inFlight = useRef(false)
  const publicKeyRef = useRef(publicKey)

  useEffect(() => {
    publicKeyRef.current = publicKey
  }, [publicKey])

  useEffect(() => {
    let cancelled = false

    async function sync() {
      setStatus('loading')
      setErrorKind(null)
      try {
        const session = await fetchReviewerSession()
        if (cancelled) return

        if (!connected || !publicKey) {
          if (session.authenticated) {
            try {
              await logoutReviewerSession()
            } catch {
              // ignore
            }
          }
          setAuthorized(false)
          setWalletAddress(null)
          setExpiresAt(null)
          setStatus('disconnected')
          return
        }

        const key = publicKey.toBase58()
        if (session.authenticated && session.walletAddress === key) {
          setAuthorized(true)
          setWalletAddress(session.walletAddress)
          setExpiresAt(session.expiresAt)
          setStatus('authorized')
          return
        }

        if (session.authenticated && session.walletAddress !== key) {
          try {
            await logoutReviewerSession()
          } catch {
            // ignore
          }
        }

        setAuthorized(false)
        setWalletAddress(null)
        setExpiresAt(null)
        setStatus('connected')
      } catch {
        if (cancelled) return
        setAuthorized(false)
        if (connected && publicKey) {
          setStatus('connected')
          setErrorKind('backend_unavailable')
        } else {
          setStatus('disconnected')
        }
      }
    }

    void sync()
    return () => {
      cancelled = true
    }
  }, [connected, publicKey])

  const clearError = useCallback(() => {
    setErrorKind(null)
    if (connected && !authorized) setStatus('connected')
  }, [connected, authorized])

  const signOut = useCallback(async () => {
    try {
      await logoutReviewerSession()
    } catch {
      // ignore
    }
    setAuthorized(false)
    setWalletAddress(null)
    setExpiresAt(null)
    setErrorKind(null)
    try {
      await disconnect()
    } catch {
      // ignore
    }
    setStatus('disconnected')
  }, [disconnect])

  const confirmReviewerAccount = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setErrorKind(null)
    setEmptyAllowlistHint(false)

    try {
      if (!connected || !publicKey) {
        setStatus('disconnected')
        return
      }
      if (!signMessage) {
        setErrorKind('unsupported_wallet')
        setStatus('error')
        return
      }

      const connectedKey = publicKey.toBase58()
      setStatus('confirming')

      let challenge
      try {
        challenge = await requestReviewerChallenge(connectedKey)
      } catch (err) {
        setErrorKind(mapError(err))
        setStatus('error')
        return
      }

      if (publicKeyRef.current?.toBase58() !== connectedKey) {
        setErrorKind('verify_failed')
        setStatus('error')
        return
      }

      setStatus('awaiting_signature')
      let signatureBytes: Uint8Array
      try {
        signatureBytes = await signMessage(
          new TextEncoder().encode(challenge.message)
        )
      } catch (err) {
        setErrorKind(mapError(err))
        setStatus('error')
        return
      }

      setStatus('confirming')
      try {
        const session = await verifyReviewerChallenge({
          challengeId: challenge.challengeId,
          publicKey: connectedKey,
          signature: bs58.encode(signatureBytes),
        })
        setAuthorized(true)
        setWalletAddress(session.walletAddress)
        setExpiresAt(session.expiresAt)
        setStatus('authorized')
      } catch (err) {
        const kind = mapError(err)
        setErrorKind(kind)
        if (kind === 'not_allowlisted') {
          setEmptyAllowlistHint(false)
          setStatus('denied')
        } else {
          setStatus('error')
        }
      }
    } finally {
      inFlight.current = false
    }
  }, [connected, publicKey, signMessage])

  const isBusy =
    status === 'loading' ||
    status === 'confirming' ||
    status === 'awaiting_signature'

  return (
    <ReviewerSessionContext.Provider
      value={{
        status,
        authorized,
        walletAddress,
        expiresAt,
        errorKind,
        isBusy,
        emptyAllowlistHint,
        confirmReviewerAccount,
        signOut,
        clearError,
      }}
    >
      {children}
    </ReviewerSessionContext.Provider>
  )
}

export function useReviewerSession(): ReviewerSessionState {
  const ctx = useContext(ReviewerSessionContext)
  if (!ctx) {
    throw new Error(
      'useReviewerSession must be used within ReviewerSessionProvider'
    )
  }
  return ctx
}
