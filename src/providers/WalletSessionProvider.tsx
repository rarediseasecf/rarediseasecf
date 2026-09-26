/**
 * Wallet session / ownership-confirmation state.
 *
 * A wallet is "confirmed" only when the backend session cookie authenticates
 * the same public key that is currently connected. Connection alone is not enough.
 *
 * Policy: if no wallet is connected on init but a stale session cookie exists,
 * clear it via logout. On disconnect, always logout the server session.
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
  AuthApiError,
  fetchSession,
  logoutSession,
  requestChallenge,
  verifyChallenge,
  type AuthErrorCode,
} from '../lib/authApi'

export type WalletSessionStatus =
  | 'loading'
  | 'disconnected'
  | 'connected'
  | 'confirming'
  | 'awaiting_signature'
  | 'confirmed'
  | 'error'

export type WalletSessionErrorKind =
  | 'unsupported_wallet'
  | 'user_rejected'
  | 'challenge_failed'
  | 'verify_failed'
  | 'challenge_expired'
  | 'session_expired'
  | 'wallet_changed'
  | 'backend_unavailable'
  | null

export interface WalletSessionState {
  status: WalletSessionStatus
  confirmed: boolean
  walletAddress: string | null
  expiresAt: string | null
  errorKind: WalletSessionErrorKind
  isBusy: boolean
  confirmAccount: () => Promise<void>
  clearError: () => void
  disconnectAccount: () => Promise<void>
}

const WalletSessionContext = createContext<WalletSessionState | null>(null)

function mapErrorKind(err: unknown): WalletSessionErrorKind {
  if (err instanceof AuthApiError) {
    switch (err.code) {
      case 'CHALLENGE_EXPIRED':
        return 'challenge_expired'
      case 'WALLET_MISMATCH':
        return 'wallet_changed'
      case 'NETWORK_ERROR':
      case 'INTERNAL_ERROR':
      case 'ORIGIN_NOT_ALLOWED':
      case 'RATE_LIMITED':
        return 'backend_unavailable'
      case 'CHALLENGE_NOT_FOUND':
      case 'INVALID_REQUEST':
      case 'INVALID_PUBLIC_KEY':
        return 'challenge_failed'
      case 'INVALID_SIGNATURE':
      case 'CHALLENGE_ALREADY_USED':
        return 'verify_failed'
      default:
        return 'verify_failed'
    }
  }

  if (err instanceof Error) {
    const msg = err.message.toLowerCase()
    if (
      msg.includes('user rejected') ||
      msg.includes('user denied') ||
      msg.includes('cancelled') ||
      msg.includes('canceled') ||
      msg.includes('rejected')
    ) {
      return 'user_rejected'
    }
  }

  return 'verify_failed'
}

export function WalletSessionProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const { connected, publicKey, signMessage, disconnect, wallet } = useWallet()

  const [status, setStatus] = useState<WalletSessionStatus>('loading')
  const [confirmed, setConfirmed] = useState(false)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [errorKind, setErrorKind] = useState<WalletSessionErrorKind>(null)

  const confirmInFlight = useRef(false)
  const publicKeyRef = useRef(publicKey)

  useEffect(() => {
    publicKeyRef.current = publicKey
  }, [publicKey])

  const resetConfirmed = useCallback(() => {
    setConfirmed(false)
    setWalletAddress(null)
    setExpiresAt(null)
  }, [])

  // Sync session with backend after wallet provider settles.
  useEffect(() => {
    let cancelled = false

    async function syncSession() {
      setStatus('loading')
      setErrorKind(null)

      try {
        const session = await fetchSession()

        if (cancelled) return

        if (!connected || !publicKey) {
          // Stale cookie with no connected wallet — clear server session.
          if (session.authenticated) {
            try {
              await logoutSession()
            } catch {
              // ignore
            }
          }
          resetConfirmed()
          setStatus('disconnected')
          return
        }

        const connectedKey = publicKey.toBase58()

        if (
          session.authenticated &&
          session.walletAddress === connectedKey
        ) {
          setConfirmed(true)
          setWalletAddress(session.walletAddress)
          setExpiresAt(session.expiresAt)
          setStatus('confirmed')
          return
        }

        // Session belongs to a different wallet — clear it.
        if (
          session.authenticated &&
          session.walletAddress !== connectedKey
        ) {
          try {
            await logoutSession()
          } catch {
            // ignore
          }
        }

        resetConfirmed()
        setStatus('connected')
      } catch {
        if (cancelled) return
        // Backend unavailable — still allow browsing; treat as unconfirmed.
        resetConfirmed()
        if (connected && publicKey) {
          setStatus('connected')
          setErrorKind('backend_unavailable')
        } else {
          setStatus('disconnected')
        }
      }
    }

    void syncSession()

    return () => {
      cancelled = true
    }
  }, [connected, publicKey, resetConfirmed])

  const clearError = useCallback(() => {
    setErrorKind(null)
    if (connected && publicKey && !confirmed) {
      setStatus('connected')
    }
  }, [connected, publicKey, confirmed])

  const disconnectAccount = useCallback(async () => {
    try {
      await logoutSession()
    } catch {
      // still disconnect locally
    }
    resetConfirmed()
    setErrorKind(null)
    try {
      await disconnect()
    } catch {
      // non-critical
    }
    setStatus('disconnected')
  }, [disconnect, resetConfirmed])

  const confirmAccount = useCallback(async () => {
    if (confirmInFlight.current) return
    confirmInFlight.current = true
    setErrorKind(null)

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

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setErrorKind('backend_unavailable')
        setStatus('error')
        return
      }

      const connectedKey = publicKey.toBase58()
      setStatus('confirming')

      let challenge
      try {
        challenge = await requestChallenge(connectedKey)
      } catch (err) {
        setErrorKind(mapErrorKind(err))
        setStatus('error')
        return
      }

      // Ensure wallet did not change while fetching challenge
      const stillConnected = publicKeyRef.current?.toBase58()
      if (stillConnected !== connectedKey) {
        setErrorKind('wallet_changed')
        setStatus('error')
        return
      }

      setStatus('awaiting_signature')

      const messageBytes = new TextEncoder().encode(challenge.message)
      let signatureBytes: Uint8Array
      try {
        signatureBytes = await signMessage(messageBytes)
      } catch (err) {
        setErrorKind(mapErrorKind(err))
        setStatus('error')
        return
      }

      const afterSignKey = publicKeyRef.current?.toBase58()
      if (afterSignKey !== connectedKey) {
        setErrorKind('wallet_changed')
        setStatus('error')
        return
      }

      setStatus('confirming')

      try {
        const session = await verifyChallenge({
          challengeId: challenge.challengeId,
          publicKey: connectedKey,
          signature: bs58.encode(signatureBytes),
        })

        setConfirmed(true)
        setWalletAddress(session.walletAddress)
        setExpiresAt(session.expiresAt)
        setStatus('confirmed')
        setErrorKind(null)
      } catch (err) {
        const kind = mapErrorKind(err)
        setErrorKind(kind)
        setStatus('error')
        if (
          err instanceof AuthApiError &&
          (err.code as AuthErrorCode) === 'CHALLENGE_EXPIRED'
        ) {
          setErrorKind('challenge_expired')
        }
      }
    } finally {
      confirmInFlight.current = false
    }
  }, [connected, publicKey, signMessage])

  const isBusy =
    status === 'loading' ||
    status === 'confirming' ||
    status === 'awaiting_signature'

  const value: WalletSessionState = {
    status,
    confirmed: confirmed && connected,
    walletAddress,
    expiresAt,
    errorKind,
    isBusy,
    confirmAccount,
    clearError,
    disconnectAccount,
  }

  // wallet is unused but keeps adapter identity stable when switching
  void wallet

  return (
    <WalletSessionContext.Provider value={value}>
      {children}
    </WalletSessionContext.Provider>
  )
}

export function useWalletSession(): WalletSessionState {
  const ctx = useContext(WalletSessionContext)
  if (!ctx) {
    throw new Error('useWalletSession must be used within WalletSessionProvider')
  }
  return ctx
}
