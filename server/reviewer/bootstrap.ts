import { PublicKey } from '@solana/web3.js'
import { eq } from 'drizzle-orm'
import type { Database } from '../db/index.js'
import {
  reviewerRegistry,
  providerRegistry,
} from '../db/schema.js'
import { truncatePublicKey } from '../utils/crypto.js'

function isValidSolanaAddress(value: string): boolean {
  try {
    const key = new PublicKey(value)
    return key.toBase58() === value
  } catch {
    return false
  }
}

export function parseReviewerBootstrapWallets(
  raw: string | undefined
): string[] {
  if (!raw || !raw.trim()) return []
  const parts = raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  const valid: string[] = []
  for (const addr of parts) {
    if (!isValidSolanaAddress(addr)) {
      console.warn(
        JSON.stringify({
          event: 'reviewer_bootstrap_invalid_wallet',
          wallet: truncatePublicKey(addr),
        })
      )
      continue
    }
    valid.push(addr)
  }
  return valid
}

export interface ProviderBootstrapRecord {
  displayName: string
  payoutWalletAddress: string
}

export function parseProviderBootstrapRecords(
  raw: string | undefined
): ProviderBootstrapRecord[] {
  if (!raw || !raw.trim()) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      console.warn(
        JSON.stringify({
          event: 'provider_bootstrap_malformed',
          reason: 'not_array',
        })
      )
      return []
    }
    const out: ProviderBootstrapRecord[] = []
    for (const item of parsed) {
      if (
        typeof item !== 'object' ||
        item === null ||
        typeof (item as { displayName?: unknown }).displayName !== 'string' ||
        typeof (item as { payoutWalletAddress?: unknown }).payoutWalletAddress !==
          'string'
      ) {
        console.warn(
          JSON.stringify({
            event: 'provider_bootstrap_malformed',
            reason: 'bad_item',
          })
        )
        continue
      }
      const displayName = (item as ProviderBootstrapRecord).displayName.trim()
      const payoutWalletAddress = (
        item as ProviderBootstrapRecord
      ).payoutWalletAddress.trim()
      if (
        displayName.length < 1 ||
        displayName.length > 200 ||
        !isValidSolanaAddress(payoutWalletAddress)
      ) {
        console.warn(
          JSON.stringify({
            event: 'provider_bootstrap_invalid_record',
            wallet: truncatePublicKey(payoutWalletAddress || 'invalid'),
          })
        )
        continue
      }
      out.push({ displayName, payoutWalletAddress })
    }
    return out
  } catch {
    console.warn(
      JSON.stringify({
        event: 'provider_bootstrap_malformed',
        reason: 'json_parse',
      })
    )
    return []
  }
}

export async function bootstrapRegistries(
  db: Database['db'],
  reviewerWallets: string[],
  providers: ProviderBootstrapRecord[]
): Promise<void> {
  const now = new Date()

  for (const walletAddress of reviewerWallets) {
    const existing = await db
      .select()
      .from(reviewerRegistry)
      .where(eq(reviewerRegistry.walletAddress, walletAddress))
      .limit(1)

    if (existing[0]) {
      await db
        .update(reviewerRegistry)
        .set({
          isActive: true,
          role: 'REVIEWER',
          updatedAt: now,
          deactivatedAt: null,
        })
        .where(eq(reviewerRegistry.id, existing[0].id))
    } else {
      await db.insert(reviewerRegistry).values({
        walletAddress,
        isActive: true,
        role: 'REVIEWER',
        createdAt: now,
        updatedAt: now,
        deactivatedAt: null,
      })
    }

    console.info(
      JSON.stringify({
        event: 'reviewer_bootstrap_upsert',
        wallet: truncatePublicKey(walletAddress),
      })
    )
  }

  for (const provider of providers) {
    const existing = await db
      .select()
      .from(providerRegistry)
      .where(
        eq(providerRegistry.payoutWalletAddress, provider.payoutWalletAddress)
      )
      .limit(1)

    if (existing[0]) {
      await db
        .update(providerRegistry)
        .set({
          displayName: provider.displayName,
          isActive: true,
          updatedAt: now,
          deactivatedAt: null,
        })
        .where(eq(providerRegistry.id, existing[0].id))
    } else {
      await db.insert(providerRegistry).values({
        displayName: provider.displayName,
        payoutWalletAddress: provider.payoutWalletAddress,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        deactivatedAt: null,
      })
    }

    console.info(
      JSON.stringify({
        event: 'provider_bootstrap_upsert',
        displayName: provider.displayName,
        wallet: truncatePublicKey(provider.payoutWalletAddress),
      })
    )
  }
}
