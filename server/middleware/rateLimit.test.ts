import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { RateLimiter } from './rateLimit.js'

describe('RateLimiter', () => {
  it('allows up to max hits per window, then blocks until reset', () => {
    const limiter = new RateLimiter()
    const t0 = 1_000_000
    for (let i = 0; i < 3; i++) {
      assert.equal(limiter.hit('k', 60_000, 3, t0 + i), 0)
    }
    const retry = limiter.hit('k', 60_000, 3, t0 + 10)
    assert.ok(retry > 0 && retry <= 60)
    assert.equal(limiter.hit('other', 60_000, 3, t0 + 10), 0)
    assert.equal(limiter.hit('k', 60_000, 3, t0 + 60_001), 0)
  })

  it('cleanup drops expired windows', () => {
    const limiter = new RateLimiter()
    limiter.hit('k', 1000, 1, 0)
    assert.ok(limiter.hit('k', 1000, 1, 10) > 0)
    limiter.cleanup(5000)
    assert.equal(limiter.hit('k', 1000, 1, 5000), 0)
  })
})
