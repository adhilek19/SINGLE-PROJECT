
export class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode  = statusCode;
    this.status      = String(statusCode).startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;   // ← safe to show to clients

    Error.captureStackTrace(this, this.constructor);
  }
}
export const BadRequest = (msg) => new AppError(msg, 400);
export const Unauthorized = (msg) => new AppError(msg, 401);
export const Forbidden = (msg) => new AppError(msg, 403);
export const NotFound = (msg) => new AppError(msg, 404);
export const Conflict = (msg) => new AppError(msg, 409);
export const UnprocessableEntity = (msg) => new AppError(msg, 422);