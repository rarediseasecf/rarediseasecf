import type { SessionRecord } from './types.js'

/**
 * In-memory session store — Day 3 hackathon milestone only.
 * Server restart clears all active sessions.
 */
export class SessionStore {
  private readonly sessions = new Map<string, SessionRecord>()

  set(record: SessionRecord): void {
    this.sessions.set(record.sessionId, record)
  }

  get(sessionId: string): SessionRecord | undefined {
    return this.sessions.get(sessionId)
  }

  delete(sessionId: string): void {
    this.sessions.delete(sessionId)
  }

  /** Remove expired sessions. Returns count removed. */
  cleanupExpired(now: Date = new Date()): number {
    let removed = 0
    for (const [id, record] of this.sessions) {
      if (record.expiresAt <= now) {
        this.sessions.delete(id)
        removed += 1
      }
    }
    return removed
  }

  size(): number {
    return this.sessions.size
  }
}
