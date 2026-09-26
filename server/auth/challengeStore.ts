import type { ChallengeRecord } from './types.js'

/**
 * In-memory challenge store — Day 3 hackathon milestone only.
 * Server restart clears all pending challenges.
 */
export class ChallengeStore {
  private readonly challenges = new Map<string, ChallengeRecord>()

  set(record: ChallengeRecord): void {
    this.challenges.set(record.challengeId, record)
  }

  get(challengeId: string): ChallengeRecord | undefined {
    return this.challenges.get(challengeId)
  }

  delete(challengeId: string): void {
    this.challenges.delete(challengeId)
  }

  /** Remove expired challenges. Returns count removed. */
  cleanupExpired(now: Date = new Date()): number {
    let removed = 0
    for (const [id, record] of this.challenges) {
      if (record.expiresAt <= now || record.consumedAt !== null) {
        this.challenges.delete(id)
        removed += 1
      }
    }
    return removed
  }

  size(): number {
    return this.challenges.size
  }
}
