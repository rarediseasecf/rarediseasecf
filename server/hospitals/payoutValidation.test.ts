/**
 * Unit tests — hospital payout method selection (USDC live, fiat coming soon).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { AppError } from '../errors.js'
import { validatePayoutSelection } from './payoutValidation.js'

const VALID_WALLET = '3ChG4eL5EvhrELWbAZs3cdVt8P9X1CfrRwfF6gqfKG9d'

function hasCode(code: string) {
  return (err: unknown) => err instanceof AppError && err.code === code
}

describe('hospital payout selection', () => {
  it('accepts USDC with a valid Solana wallet', () => {
    const result = validatePayoutSelection({
      payoutMethod: 'usdc',
      usdcWalletAddress: `  ${VALID_WALLET}  `,
    })
    assert.equal(result.payoutMethod, 'USDC')
    assert.equal(result.walletAddress, VALID_WALLET)
    assert.equal(result.walletSuffix, 'KG9d')
  })

  it('rejects fiat as not yet supported', () => {
    assert.throws(
      () => validatePayoutSelection({ payoutMethod: 'FIAT' }),
      hasCode('FIAT_PAYOUT_NOT_SUPPORTED')
    )
  })

  it('requires a payout method', () => {
    assert.throws(
      () => validatePayoutSelection({ usdcWalletAddress: VALID_WALLET }),
      hasCode('PAYOUT_METHOD_REQUIRED')
    )
  })

  it('requires a wallet for USDC', () => {
    assert.throws(
      () => validatePayoutSelection({ payoutMethod: 'USDC' }),
      hasCode('USDC_WALLET_REQUIRED')
    )
  })

  it('rejects malformed wallet addresses', () => {
    for (const bad of ['not-a-wallet', '0x1234567890abcdef', 'O0Il']) {
      assert.throws(
        () =>
          validatePayoutSelection({
            payoutMethod: 'USDC',
            usdcWalletAddress: bad,
          }),
        hasCode('INVALID_USDC_WALLET')
      )
    }
  })
})
