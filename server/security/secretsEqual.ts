/**
 * Timing-safe string compare for admin secrets (constant-time when lengths match).
 */
import { timingSafeEqual } from 'node:crypto'

export function secretsEqual(provided: string, expected: string): boolean {
  if (!expected || !provided) return false
  const a = Buffer.from(provided, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) {
    // Still run a compare to reduce trivial timing leaks on length
    timingSafeEqual(a, a)
    return false
  }
  return timingSafeEqual(a, b)
}
