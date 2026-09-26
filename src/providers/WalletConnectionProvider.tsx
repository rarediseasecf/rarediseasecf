/**
 * WalletConnectionProvider
 *
 * Wraps the application with the Solana wallet-adapter React context.
 * Uses the cluster from VITE_SOLANA_NETWORK (devnet | mainnet-beta). Supports Phantom and Solflare.
 *
 * No auto-connect on page load — the user must explicitly initiate.
 * No transactions, no balance reads, no token data.
 * Message signing for ownership confirmation is handled by WalletSessionProvider (Day 3).
 *
 * Compatibility note:
 * @solana/wallet-adapter-react ships FC types built against React 17.
 * With @types/react@18 the FC return type includes `Promise<ReactNode>`,
 * which TypeScript rejects when used directly as JSX. We cast each provider
 * through `React.ElementType` to avoid the false-positive without disabling
 * strict mode or skipLibCheck globally for our own source files.
 */
import React, { useMemo } from 'react'
import {
  ConnectionProvider,
  WalletProvider,
} from '@solana/wallet-adapter-react'
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom'
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare'

import { RPC_URL } from '../lib/network'

// Cast through React.ElementType to bridge the React 17→18 FC type gap
// in the wallet-adapter library without disabling strict checking globally.
const SafeConnectionProvider = ConnectionProvider as React.ElementType
const SafeWalletProvider = WalletProvider as React.ElementType

interface WalletConnectionProviderProps {
  children: React.ReactNode
}

export default function WalletConnectionProvider({
  children,
}: WalletConnectionProviderProps) {
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  )

  return (
    <SafeConnectionProvider endpoint={RPC_URL}>
      {/*
        autoConnect={false} — wallet UI must never open on page load.
      */}
      <SafeWalletProvider wallets={wallets} autoConnect={false}>
        {children}
      </SafeWalletProvider>
    </SafeConnectionProvider>
  )
}
