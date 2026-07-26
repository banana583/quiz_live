import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { SessionStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { leaderboard, publicQuestion } from '../services/quiz-helpers.js';
import { validateAndScore } from '../services/answer-validator.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const HOST_DISCONNECT_GRACE_MS = 7000;
const hostCleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();


function questionTiming(question: { timeLimit?: number | null }, startedAt?: Date | null) {
  const serverNow = Date.now();
  const startedAtMs = startedAt?.getTime() ?? serverNow;
  const questionEndsAtMs = startedAtMs + Math.max(0, question.timeLimit || 0) * 1000;

  return {
    startedAt: new Date(startedAtMs).toISOString(),
    questionEndsAt: new Date(questionEndsAtMs).toISOString(),
    serverNow: new Date(serverNow).toISOString(),
    remainingMs: Math.max(0, questionEndsAtMs - serverNow),
  };
}

export function setupQuizSocket(io: Server) {
  io.on('connection', (socket: Socket) => {
    // 1. Участник присоединяется (включая повторное подключение и просмотр завершённых)
    socket.on('participant:join', async ({ roomCode, nickname, token, participationId }, ack) => {
      try {
        const s = await prisma.quizSession.findUnique({
          where: { roomCode: String(roomCode).toUpperCase() },
        });
        if (!s) {
          return ack?.({ ok: false, error: 'Room not found' });
        }

        // Если сессия уже завершена – даём доступ только для просмотра результатов
        if (s.status === SessionStatus.FINISHED) {
          const board = await leaderboard(s.id);
          // Отправляем результаты напрямую этому сокету
          socket.emit('quiz:finished', board);
          // Если передан participationId и он существует, можно сохранить связь (но необязательно)
          if (participationId) {
            const existing = await prisma.participation.findUnique({
              where: { id: participationId },
            });
            if (existing && existing.sessionId === s.id) {
              socket.data = { ...socket.data, participationId, sessionId: s.id, roomCode: s.roomCode };
              socket.join(s.roomCode);
            }
          }
          // Завершаем соединение (или оставляем для возможных обновлений, но их не будет)
          // Можно просто отправить и закрыть, но лучше закрыть, чтобы не висело
          // Однако если мы оставим, то при обновлении результатов (никогда) ничего не изменится.
          // Оставим для простоты, но пометим, что участие не активно.
          return ack?.({ ok: true, finished: true, board });
        }

        // Сессия активна или в лобби – нормальное присоединение
        let userId: string | undefined;
        if (token) {
          try {
            userId = (jwt.verify(token, JWT_SECRET) as any).id;
          } catch {}
        }

        let participation;
        // Если передан participationId – пытаемся восстановить
        if (participationId) {
          participation = await prisma.participation.findUnique({
            where: { id: participationId },
          });
          if (!participation || participation.sessionId !== s.id) {
            return ack?.({ ok: false, error: 'Invalid participation' });
          }
          // Обновляем nickname и userId
          participation = await prisma.participation.update({
            where: { id: participationId },
            data: {
              nickname: String(nickname).trim(),
              userId: userId || participation.userId,
            },
          });
        } else {
          // Новый участник (только если сессия в LOBBY или ACTIVE)
          participation = await prisma.participation.create({
            data: {
              sessionId: s.id,
              nickname: String(nickname).trim(),
              userId,
            },
          });
        }

        socket.join(s.roomCode);
        socket.data = {
          ...socket.data,
          participationId: participation.id,
          sessionId: s.id,
          roomCode: s.roomCode,
        };

        // Отправляем обновлённую таблицу лидеров всем в комнате
        io.to(s.roomCode).emit('lobby:update', await leaderboard(s.id));

        // Если сессия уже активна – восстановить текущий вопрос
        if (s.status === SessionStatus.ACTIVE) {
          const q = await publicQuestion(s.id, s.currentQuestion);
          if (q) {
            const previousAnswer = await prisma.answer.findUnique({
              where: { participationId_questionId: { participationId: participation.id, questionId: q.id } },
              select: { isCorrect: true, pointsAwarded: true },
            });
            socket.emit('question:show', {
              ...q,
              ...questionTiming(q, s.questionStarted),
              answerState: previousAnswer ? {
                submitted: true,
                isCorrect: previousAnswer.isCorrect,
                points: previousAnswer.pointsAwarded,
              } : null,
            });
          }
        }

        const quiz = await prisma.quiz.findUnique({ where: { id: s.quizId }, select: { title: true, description: true } });
        ack?.({ ok: true, participationId: participation.id, roomCode: s.roomCode, status: s.status, quiz });
      } catch (e: any) {
        ack?.({ ok: false, error: e.code === 'P2002' ? 'Nickname already taken' : 'Could not join room' });
      }
    });

    // Организатор (хост) подключается к комнате
    socket.on('host:join', async ({ roomCode, token }, ack) => {
      try {
        const claims = jwt.verify(token, JWT_SECRET) as any;
        const s = await prisma.quizSession.findUnique({
          where: { roomCode: String(roomCode).toUpperCase() },
          include: { quiz: true },
        });
        if (!s || s.quiz.ownerId !== claims.id) {
          return ack?.({ ok: false, error: 'Forbidden' });
        }

        const pendingCleanup = hostCleanupTimers.get(s.id);
        if (pendingCleanup) {
          clearTimeout(pendingCleanup);
          hostCleanupTimers.delete(s.id);
        }

        socket.join(s.roomCode);
        socket.data = { ...socket.data, host: true, sessionId: s.id, roomCode: s.roomCode };

        const board = await leaderboard(s.id);
        socket.emit('lobby:update', board);

        if (s.status === SessionStatus.FINISHED) {
          socket.emit('quiz:finished', board);
        } else if (s.status === SessionStatus.ACTIVE) {
          const q = await publicQuestion(s.id, s.currentQuestion);
          if (q) {
            socket.emit('question:show', { ...q, ...questionTiming(q, s.questionStarted) });
            const answered = await prisma.answer.count({ where: { sessionId: s.id, questionId: q.id } });
            const total = await prisma.participation.count({ where: { sessionId: s.id } });
            socket.emit('question:progress', { answered, total });
          }
        }

        ack?.({ ok: true, status: s.status, quiz: { title: s.quiz.title, description: s.quiz.description } });
      } catch {
        ack?.({ ok: false, error: 'Unauthorized' });
      }
    });

    // Хост: начало викторины
    socket.on('host:start', async (_, ack) => {
      if (!socket.data.host) return;
      const existing = await prisma.quizSession.findUnique({ where: { id: socket.data.sessionId } });
      if (!existing) return ack?.({ ok: false, error: 'Room not found' });
      if (existing.status !== SessionStatus.LOBBY) {
        return ack?.({ ok: false, error: 'Квиз уже запущен или завершён' });
      }
      const s = await prisma.quizSession.update({
        where: { id: socket.data.sessionId },
        data: { status: 'ACTIVE', currentQuestion: 0, questionStarted: new Date() },
      });
      const q = await publicQuestion(s.id, 0);
      if (q) {
        io.to(s.roomCode).emit('question:show', {
          ...q,
          ...questionTiming(q, s.questionStarted),
        });
      }
      ack?.({ ok: true });
    });

    // Хост: переход к следующему вопросу / завершение
    socket.on('host:next', async (_, ack) => {
      if (!socket.data.host) return;
      const s = await prisma.quizSession.findUnique({
        where: { id: socket.data.sessionId },
        include: { quiz: { include: { _count: { select: { questions: true } } } } },
      });
      if (!s) return;
      const next = s.currentQuestion + 1;
      if (next >= s.quiz._count.questions) {
        // Завершаем
        await prisma.quizSession.update({
          where: { id: s.id },
          data: { status: 'FINISHED', finishedAt: new Date() },
        });
        const board = await leaderboard(s.id);
        io.to(s.roomCode).emit('quiz:finished', board);
        return ack?.({ ok: true, finished: true });
      }
      // Переходим к следующему вопросу
      const updated = await prisma.quizSession.update({
        where: { id: s.id },
        data: { currentQuestion: next, questionStarted: new Date() },
      });
      const q = await publicQuestion(s.id, next);
      if (q) {
        io.to(s.roomCode).emit('question:show', {
          ...q,
          ...questionTiming(q, updated.questionStarted),
        });
      }
      ack?.({ ok: true });
    });

    // 5. Досрочное завершение сессии (новая команда для хоста)
    socket.on('host:finish', async (_, ack) => {
      if (!socket.data.host) return;
      const s = await prisma.quizSession.update({
        where: { id: socket.data.sessionId },
        data: { status: 'FINISHED', finishedAt: new Date() },
      });
      const board = await leaderboard(s.id);
      io.to(s.roomCode).emit('quiz:finished', board);
      ack?.({ ok: true });
    });

    // Участник отправляет ответ
    socket.on('answer:submit', async ({ questionId, optionIds }, ack) => {
	  try {
		const pId = socket.data.participationId;
		const sId = socket.data.sessionId;
		if (!pId || !sId) {
		  return ack?.({ ok: false, error: 'Not joined' });
		}

		const s = await prisma.quizSession.findUnique({
		  where: { id: sId },
		  include: {
			quiz: {
			  include: {
				questions: {
				  orderBy: { order: 'asc' },
				  include: { options: true },
				},
			  },
			},
		  },
		});
		if (!s || s.status !== 'ACTIVE') {
		  return ack?.({ ok: false, error: 'Quiz is not active' });
		}

		// Проверка, что вопрос был начат (защита от null)
		if (!s.questionStarted) {
		  return ack?.({ ok: false, error: 'Question not started' });
		}

		const q = s.quiz.questions[s.currentQuestion];
		if (!q || q.id !== questionId) {
		  return ack?.({ ok: false, error: 'Question is closed' });
		}

		const responseMs = Date.now() - s.questionStarted.getTime();

		// Защита от отрицательного времени (если часы на клиенте сбиты)
		if (responseMs < 0) {
		  return ack?.({ ok: false, error: 'Invalid response time' });
		}
		
		// Валидация и расчёт очков
		const { isCorrect, points } = validateAndScore(
		  {
			id: q.id,
			type: q.type,
			points: q.points,
			timeLimit: q.timeLimit || s.quiz.defaultTimeSec,
			options: q.options.map((o: any) => ({ id: o.id, isCorrect: o.isCorrect })),
		  },
		  optionIds as string[],
		  responseMs
		);

		// Если points стал NaN (защита), заменяем на 0
		const safePoints = Number.isFinite(points) ? points : 0;

		// Сохраняем ответ
		await prisma.$transaction([
		  prisma.answer.create({
			data: {
			  sessionId: sId,
			  participationId: pId,
			  questionId: q.id,
			  optionIds: [...new Set(optionIds as string[])],
			  isCorrect,
			  responseMs,
			  pointsAwarded: safePoints,
			},
		  }),
		  prisma.participation.update({
			where: { id: pId },
			data: { score: { increment: safePoints } },
		  }),
		]);

		// Отправляем прогресс
		const answeredCount = await prisma.answer.count({
		  where: { sessionId: sId, questionId: q.id },
		});
		const totalParticipants = await prisma.participation.count({
		  where: { sessionId: sId },
		});
		io.to(s.roomCode).emit('question:progress', {
		  answered: answeredCount,
		  total: totalParticipants,
		});

		ack?.({ ok: true, isCorrect, points: safePoints });
	  } catch (e: any) {
		console.error('ANSWER_ERROR full:', e);
	  console.error('ANSWER_ERROR message:', e.message);
	  console.error('ANSWER_ERROR code:', e.code);
	  console.error('ANSWER_ERROR stack:', e.stack);
	  if (e.meta) console.error('ANSWER_ERROR meta:', e.meta);
	  if (e.code === 'P2002') {
		return ack?.({ ok: false, error: 'Answer already submitted' });
	  }
	  ack?.({ ok: false, error: 'Answer failed' });
	  }
	});
    // Запрос таблицы лидеров
    socket.on('leaderboard:get', async (_, ack) => {
      if (socket.data.sessionId) ack?.(await leaderboard(socket.data.sessionId));
    });

    // Отключение сокета. Для хоста запускаем отложенную очистку комнаты.
    // Небольшая задержка позволяет пережить обычное обновление страницы.
    socket.on('disconnect', async () => {
      const sessionId = socket.data.sessionId as string | undefined;
      const roomCode = socket.data.roomCode as string | undefined;

      if (!sessionId || !roomCode) return;

      if (!socket.data.host) {
        try {
          io.to(roomCode).emit('lobby:update', await leaderboard(sessionId));
        } catch {
          // Сессия могла быть удалена одновременно с отключением участника.
        }
        return;
      }

      const previousTimer = hostCleanupTimers.get(sessionId);
      if (previousTimer) clearTimeout(previousTimer);

      const cleanupTimer = setTimeout(async () => {
        hostCleanupTimers.delete(sessionId);

        try {
          const sockets = await io.in(roomCode).fetchSockets();
          const hostReconnected = sockets.some(connectedSocket =>
            connectedSocket.data.host && connectedSocket.data.sessionId === sessionId
          );
          if (hostReconnected) return;

          const session = await prisma.quizSession.findUnique({ where: { id: sessionId } });
          if (!session) return;

          if (session.status === SessionStatus.LOBBY) {
            io.to(roomCode).emit('room:closed', {
              message: 'Организатор покинул комнату. Комната закрыта.',
            });
            await prisma.quizSession.delete({ where: { id: sessionId } });
          } else if (session.status === SessionStatus.ACTIVE) {
            await prisma.quizSession.update({
              where: { id: sessionId },
              data: { status: SessionStatus.FINISHED, finishedAt: new Date() },
            });
            io.to(roomCode).emit('room:closed', {
              message: 'Организатор покинул игру. Квиз завершён.',
            });
          }

          // После уведомления освобождаем сокеты комнаты.
          setTimeout(() => io.in(roomCode).disconnectSockets(true), 250);
        } catch (error) {
          console.error('HOST_DISCONNECT_CLEANUP_ERROR', error);
        }
      }, HOST_DISCONNECT_GRACE_MS);

      hostCleanupTimers.set(sessionId, cleanupTimer);
    });
  });
}