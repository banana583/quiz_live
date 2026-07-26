import { prisma } from '../lib/prisma.js';

export function roomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export async function leaderboard(sessionId: string) {
  return prisma.participation.findMany({
    where: { sessionId },
    select: { nickname: true, score: true },
    orderBy: [{ score: 'desc' }, { joinedAt: 'asc' }],
  });
}

export async function publicQuestion(sessionId: string, index: number) {
  const s = await prisma.quizSession.findUnique({
    where: { id: sessionId },
    include: {
      quiz: {
        include: {
          questions: {
            orderBy: { order: 'asc' },
            include: { options: { orderBy: { order: 'asc' }, select: { id: true, text: true, order: true } } },
          },
        },
      },
    },
  });
  if (!s) return null;
  const q = s.quiz.questions[index];
  if (!q) return null;
  return {
    id: q.id,
    text: q.text,
    imageUrl: q.imageUrl,
    type: q.type,
    timeLimit: q.timeLimit || s.quiz.defaultTimeSec,
    points: q.points,
    options: q.options,
    questionNumber: index + 1,
    totalQuestions: s.quiz.questions.length,
    startedAt: s.questionStarted,
    quizTitle: s.quiz.title,
    quizDescription: s.quiz.description,
  };
}