import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

export type AuthedRequest = Request & { user?: { id: string; role: UserRole } };

export function auth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Authorization required' });
  try {
    req.user = jwt.verify(token, JWT_SECRET) as any;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export function organizer(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== UserRole.ORGANIZER) {
    return res.status(403).json({ error: 'Organizer role required' });
  }
  next();
}