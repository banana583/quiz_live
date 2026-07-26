import { PrismaClient, UserRole, QuestionType } from '@prisma/client';
import bcrypt from 'bcryptjs';
const prisma = new PrismaClient();
async function main() {
  const passwordHash = await bcrypt.hash('Demo123!', 12);
  const user = await prisma.user.upsert({
    where: { email: 'organizer@example.com' },
    update: {},
    create: { name: 'Demo Organizer', email: 'organizer@example.com', passwordHash, role: UserRole.ORGANIZER }
  });
  const exists = await prisma.quiz.findFirst({ where: { ownerId: user.id, title: 'Демо-квиз: технологии' } });
  if (!exists) await prisma.quiz.create({ data: {
    title: 'Демо-квиз: технологии', category: 'Технологии', defaultTimeSec: 20, ownerId: user.id,
    questions: { create: [
      { text: 'Что означает HTML?', type: QuestionType.SINGLE, order: 0, options: { create: [
        { text: 'HyperText Markup Language', isCorrect: true, order: 0 }, { text: 'High Transfer Machine Language', order: 1 }, { text: 'Home Tool Markup Language', order: 2 }
      ]}},
      { text: 'Какие технологии выполняются в браузере?', type: QuestionType.MULTIPLE, order: 1, options: { create: [
        { text: 'JavaScript', isCorrect: true, order: 0 }, { text: 'CSS', isCorrect: true, order: 1 }, { text: 'PostgreSQL', order: 2 }, { text: 'Node.js', order: 3 }
      ]}}
    ]}
  }});
}
main().finally(() => prisma.$disconnect());
