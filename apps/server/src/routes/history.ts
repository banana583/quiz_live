import { Router } from 'express';
import { UserRole, SessionStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { auth, AuthedRequest } from '../middleware/auth.js';
import { errorResponse, ErrorCodes } from '../lib/errors.js';

const router = Router();

router.get('/', auth, async (req: AuthedRequest, res) => {
	try {
  if (req.user!.role === UserRole.ORGANIZER) {
    // Организатор: все сессии его квизов
    const sessions = await prisma.quizSession.findMany({
      where: {
        quiz: { ownerId: req.user!.id },
      },
      include: {
        quiz: {
          select: { title: true, category: true },
        },
        participants: {
          orderBy: { score: 'desc' },
          select: { nickname: true, score: true },
        },
        _count: {
          select: { participants: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const result = sessions.map((s: any) => ({
      id: s.id,
      roomCode: s.roomCode,
      status: s.status,
      createdAt: s.createdAt,
      finishedAt: s.finishedAt,
      quiz: s.quiz,
      participantCount: s._count.participants,
      leaderboard: s.participants, // полный список участников с очками
    }));

    return res.json(result);
  } else {
    // Участник: список его участий
    const participations = await prisma.participation.findMany({
      where: { userId: req.user!.id },
      include: {
        session: {
          include: {
            quiz: { select: { title: true, category: true } },
            participants: {
              orderBy: { score: 'desc' },
              select: { id: true, nickname: true, score: true },
            },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    const result = participations.map((p: any) => {
      const session = p.session;
      // Вычисляем место участника в сессии
      const leaderboard = session.participants;
      const rank = leaderboard.findIndex((part: any) => part.id === p.id) + 1;

      return {
        id: p.id,
        joinedAt: p.joinedAt,
        score: p.score,
        rank: rank > 0 ? rank : null,
        session: {
          id: session.id,
          roomCode: session.roomCode,
          status: session.status,
          createdAt: session.createdAt,
          finishedAt: session.finishedAt,
          quiz: session.quiz,
        },
        leaderboard: leaderboard, // полный лидерборд сессии
      };
    });

    return res.json(result);
  }
   } catch (e) {
    res.status(500).json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to fetch history'));
  }
});

export default router;