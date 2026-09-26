import type { Request, Response, NextFunction } from 'express'
import { AuthError } from '../auth/types.js'
import { AppError } from '../errors.js'

function sendError(
  res: Response,
  status: number,
  code: string,
  message: string
): void {
  res.status(status).json({
    error: { code, message },
  })
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AuthError || err instanceof AppError) {
    sendError(res, err.status, err.code, err.message)
    return
  }

  if (
    err instanceof SyntaxError ||
    (typeof err === 'object' &&
      err !== null &&
      'type' in err &&
      (err as { type?: string }).type === 'entity.parse.failed')
  ) {
    sendError(
      res,
      400,
      'INVALID_REQUEST',
      'A valid request body is required.'
    )
    return
  }

  console.error(
    JSON.stringify({
      event: 'unhandled_error',
      name: err instanceof Error ? err.name : 'Unknown',
    })
  )

  sendError(
    res,
    500,
    'INTERNAL_ERROR',
    'Something went wrong. Please try again shortly.'
  )
}
