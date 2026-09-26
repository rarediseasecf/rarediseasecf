import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { loadConfig } from './config.js'
import { AppError } from './errors.js'

const BASE_ENV = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  USDC_MINT: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
  PLATFORM_AUTHORITY_SECRET_KEY: 'test-only-not-parsed-by-loadConfig',
}

function expectCode(code: string) {
  return (err: unknown) => err instanceof AppError && err.code === code
}

describe('on-chain config', () => {
  it('refuses to start without the platform key or USDC mint', () => {
    assert.throws(
      () => loadConfig({ ...BASE_ENV, PLATFORM_AUTHORITY_SECRET_KEY: '' }),
      expectCode('SOLANA_CONFIG_MISSING')
    )
    assert.throws(
      () => loadConfig({ ...BASE_ENV, USDC_MINT: '' }),
      expectCode('SOLANA_CONFIG_MISSING')
    )
  })

  it('accepts only devnet or mainnet-beta', () => {
    assert.equal(loadConfig(BASE_ENV).solana.cluster, 'devnet')
    const mainnet = loadConfig({ ...BASE_ENV, SOLANA_CLUSTER: 'mainnet-beta' })
    assert.equal(mainnet.solana.cluster, 'mainnet-beta')
    assert.equal(mainnet.solana.rpcUrl, 'https://api.mainnet-beta.solana.com')
    assert.throws(
      () => loadConfig({ ...BASE_ENV, SOLANA_CLUSTER: 'localnet' }),
      expectCode('SOLANA_CLUSTER_INVALID')
    )
  })
})
