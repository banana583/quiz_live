import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { auth, AuthedRequest } from '../middleware/auth.js';
import { errorResponse, ErrorCodes } from '../lib/errors.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

function sign(user: { id: string; role: UserRole }) {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });
}

router.post('/register', async (req, res) => {
  const parsed = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
    role: z.nativeEnum(UserRole),
  }).safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json(errorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid registration data', parsed.error.flatten()));
  }

  const exists = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (exists) {
    return res.status(409).json(errorResponse(ErrorCodes.CONFLICT, 'Email already registered'));
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      role: parsed.data.role,
      passwordHash,
    },
    select: { id: true, name: true, email: true, role: true },
  });
  res.status(201).json({ user, token: sign({ id: user.id, role: user.role }) });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json(errorResponse(ErrorCodes.UNAUTHORIZED, 'Invalid email or password'));
  }
  res.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    token: sign({ id: user.id, role: user.role }),
  });
});

router.get('/me', auth, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, name: true, email: true, role: true },
  });
  res.json(user);
});

export default router;