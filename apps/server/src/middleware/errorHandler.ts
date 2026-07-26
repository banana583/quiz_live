import { Request, Response, NextFunction } from 'express';
import { errorResponse, ErrorCodes } from '../lib/errors.js';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  console.error(err);
  if (err.name === 'ZodError') {
    return res.status(400).json(errorResponse(ErrorCodes.VALIDATION_ERROR, 'Validation failed', err.flatten()));
  }
  // Можно добавить другие типы ошибок (Prisma, JWT и т.д.)
  res.status(500).json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'Internal server error'));
}