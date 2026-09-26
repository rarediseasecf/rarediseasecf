/**
 * Shared application error — safe codes/messages for JSON API responses.
 */
export class AppError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.status = status
  }
}
