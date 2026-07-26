import { Router } from 'express';
import { z } from 'zod';
import { QuestionType, UserRole, SessionStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { auth, organizer, AuthedRequest } from '../middleware/auth.js';
import { roomCode } from '../services/quiz-helpers.js';
import { errorResponse, ErrorCodes } from '../lib/errors.js';

const router = Router();

// Вспомогательная функция – проверка активных сессий
async function hasActiveSessions(quizId: string): Promise<boolean> {
  const count = await prisma.quizSession.count({
    where: {
      quizId,
      status: { in: [SessionStatus.LOBBY, SessionStatus.ACTIVE] },
    },
  });
  return count > 0;
}

// GET /quizzes – список квизов
router.get('/', auth, async (req: AuthedRequest, res) => {
  const where = req.user!.role === UserRole.ORGANIZER
    ? { ownerId: req.user!.id }
    : {};
  const quizzes = await prisma.quiz.findMany({
    where,
    include: { _count: { select: { questions: true, sessions: true } } },
    orderBy: { updatedAt: 'desc' },
  });
  res.json(quizzes);
});

// POST /quizzes – создание нового квиза
router.post('/', auth, organizer, async (req: AuthedRequest, res) => {
  const schema = z.object({
    title: z.string().min(3),
    description: z.string().optional(),
    category: z.string().min(2),
    defaultTimeSec: z.number().int().min(5).max(300),
    questions: z.array(
      z.object({
        text: z.string().min(1),
        imageUrl: z.string().refine(value => value === '' || value.startsWith('data:image/') || /^https?:\/\//i.test(value), 'Invalid image').optional(),
        type: z.nativeEnum(QuestionType),
        timeLimit: z.number().int().min(5).max(300).optional(),
        points: z.number().int().min(100).max(5000).default(1000),
        options: z.array(
          z.object({
            text: z.string().min(1),
            isCorrect: z.boolean(),
          })
        ).min(2),
      })
    ).min(1),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(
      errorResponse(ErrorCodes.VALIDATION_ERROR, 'Validation failed', parsed.error.flatten())
    );
  }

  // Проверка корректности ответов
  for (const q of parsed.data.questions) {
    const n = q.options.filter(o => o.isCorrect).length;
    if (n === 0 || (q.type === 'SINGLE' && n !== 1)) {
      return res.status(400).json(
        errorResponse(ErrorCodes.VALIDATION_ERROR, 'Incorrect correct-answer configuration')
      );
    }
  }

  const quiz = await prisma.quiz.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category,
      defaultTimeSec: parsed.data.defaultTimeSec,
      ownerId: req.user!.id,
      questions: {
        create: parsed.data.questions.map((q, i) => ({
          text: q.text,
          imageUrl: q.imageUrl || null,
          type: q.type,
          timeLimit: q.timeLimit,
          points: q.points,
          order: i,
          options: {
            create: q.options.map((o, j) => ({ ...o, order: j })),
          },
        })),
      },
    },
    include: { questions: { include: { options: true } } },
  });
  res.status(201).json(quiz);
});

// GET /quizzes/:id – получение одного квиза
router.get('/:id', auth, async (req: AuthedRequest, res) => {
  const quiz = await prisma.quiz.findUnique({
    where: { id: req.params.id },
    include: {
      questions: {
        orderBy: { order: 'asc' },
        include: { options: { orderBy: { order: 'asc' } } },
      },
    },
  });
  if (!quiz) {
    return res.status(404).json(errorResponse(ErrorCodes.NOT_FOUND, 'Quiz not found'));
  }
  if (req.user!.role === UserRole.ORGANIZER && quiz.ownerId !== req.user!.id) {
    return res.status(403).json(errorResponse(ErrorCodes.FORBIDDEN, 'Forbidden'));
  }
  res.json(quiz);
});

// PUT /quizzes/:id – полное обновление квиза (только владелец)
router.put('/:id', auth, organizer, async (req: AuthedRequest, res) => {
  const quizId = String(req.params.id);

  // Проверяем существование и владельца
  const existingQuiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    select: { ownerId: true },
  });
  if (!existingQuiz) {
    return res.status(404).json(errorResponse(ErrorCodes.NOT_FOUND, 'Quiz not found'));
  }
  if (existingQuiz.ownerId !== req.user!.id) {
    return res.status(403).json(errorResponse(ErrorCodes.FORBIDDEN, 'Forbidden'));
  }

  // Запрет при активных сессиях
  if (await hasActiveSessions(quizId)) {
    return res.status(409).json(
      errorResponse(ErrorCodes.CONFLICT, 'Cannot modify quiz while active sessions exist (LOBBY or ACTIVE)')
    );
  }

  // Валидация тела (аналогично созданию)
  const schema = z.object({
    title: z.string().min(3),
    description: z.string().optional(),
    category: z.string().min(2),
    defaultTimeSec: z.number().int().min(5).max(300),
    questions: z.array(
      z.object({
        text: z.string().min(1),
        imageUrl: z.string().refine(value => value === '' || value.startsWith('data:image/') || /^https?:\/\//i.test(value), 'Invalid image').optional(),
        type: z.nativeEnum(QuestionType),
        timeLimit: z.number().int().min(5).max(300).optional(),
        points: z.number().int().min(100).max(5000).default(1000),
        options: z.array(
          z.object({
            text: z.string().min(1),
            isCorrect: z.boolean(),
          })
        ).min(2),
      })
    ).min(1),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(
      errorResponse(ErrorCodes.VALIDATION_ERROR, 'Validation failed', parsed.error.flatten())
    );
  }

  // Проверка корректности ответов
  for (const q of parsed.data.questions) {
    const n = q.options.filter(o => o.isCorrect).length;
    if (n === 0 || (q.type === 'SINGLE' && n !== 1)) {
      return res.status(400).json(
        errorResponse(ErrorCodes.VALIDATION_ERROR, 'Incorrect correct-answer configuration')
      );
    }
  }

  // Транзакция: удалить старые вопросы + обновить квиз + создать новые
  const updatedQuiz = await prisma.$transaction(async (tx: any) => {
    await tx.question.deleteMany({ where: { quizId } });

    const quiz = await tx.quiz.update({
      where: { id: quizId },
      data: {
        title: parsed.data.title,
        description: parsed.data.description,
        category: parsed.data.category,
        defaultTimeSec: parsed.data.defaultTimeSec,
      },
    });

    await tx.quiz.update({
      where: { id: quizId },
      data: {
        questions: {
          create: parsed.data.questions.map((q, i) => ({
            text: q.text,
            imageUrl: q.imageUrl || null,
            type: q.type,
            timeLimit: q.timeLimit,
            points: q.points,
            order: i,
            options: {
              create: q.options.map((o, j) => ({ ...o, order: j })),
            },
          })),
        },
      },
    });

    return tx.quiz.findUnique({
      where: { id: quizId },
      include: {
        questions: {
          orderBy: { order: 'asc' },
          include: { options: { orderBy: { order: 'asc' } } },
        },
      },
    });
  });

  res.json(updatedQuiz);
});

// DELETE /quizzes/:id – удаление квиза (только владелец)
router.delete('/:id', auth, organizer, async (req: AuthedRequest, res) => {
  const quizId = String(req.params.id);

  const existingQuiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    select: { ownerId: true },
  });
  if (!existingQuiz) {
    return res.status(404).json(errorResponse(ErrorCodes.NOT_FOUND, 'Quiz not found'));
  }
  if (existingQuiz.ownerId !== req.user!.id) {
    return res.status(403).json(errorResponse(ErrorCodes.FORBIDDEN, 'Forbidden'));
  }

  if (await hasActiveSessions(quizId)) {
    return res.status(409).json(
      errorResponse(ErrorCodes.CONFLICT, 'Cannot delete quiz while active sessions exist (LOBBY or ACTIVE)')
    );
  }

  await prisma.quiz.delete({ where: { id: quizId } });
  res.status(204).send();
});

// POST /quizzes/:id/sessions – создание сессии
router.post('/:id/sessions', auth, organizer, async (req: AuthedRequest, res) => {
  const quiz = await prisma.quiz.findFirst({
    where: { id: String(req.params.id), ownerId: req.user!.id },
  });
  if (!quiz) {
    return res.status(404).json(errorResponse(ErrorCodes.NOT_FOUND, 'Quiz not found'));
  }

  let code = roomCode();
  while (await prisma.quizSession.findUnique({ where: { roomCode: code } })) {
    code = roomCode();
  }

  const session = await prisma.quizSession.create({
    data: { quizId: quiz.id, roomCode: code },
  });
  res.status(201).json(session);
});

export default router;