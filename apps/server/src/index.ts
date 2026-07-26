import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { prisma } from './lib/prisma.js';
import { setupQuizSocket } from './socket/quiz.js';
import authRoutes from './routes/auth.js';
import quizRoutes from './routes/quizzes.js';
import historyRoutes from './routes/history.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.WEB_ORIGIN || 'http://localhost:3000' },
});

app.use(cors({ origin: process.env.WEB_ORIGIN || 'http://localhost:3000' }));
app.use(express.json({ limit: '12mb' }));

// Подключаем маршруты
app.use('/auth', authRoutes);
app.use('/quizzes', quizRoutes);
app.use('/history', historyRoutes);

// Health check
app.get('/health', (_, res) => res.json({ ok: true }));

app.use(errorHandler);
// Сокеты
setupQuizSocket(io);

// Запуск
const port = Number(process.env.SERVER_PORT || 4000);
httpServer.listen(port, () => {
  console.log(`API and Socket.IO running on :${port}`);
});

// Экспорт для тестов (опционально)
export { app };