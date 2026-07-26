'use client';

import { use, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import Link from 'next/link';

const URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000';

export default function Host({ params }: { params: Promise<{ roomCode: string }> }) {
  const { roomCode } = use(params);
  const socketRef = useRef<Socket | null>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [question, setQuestion] = useState<any>(null);
  const [quizInfo, setQuizInfo] = useState<{ title?: string; description?: string }>({});
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [moving, setMoving] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [questionDeadline, setQuestionDeadline] = useState<number | null>(null);
  const [questionNumber, setQuestionNumber] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [progressInfo, setProgressInfo] = useState({ answered: 0, total: 0 });
  const [copied, setCopied] = useState(false);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = io(URL);
    socketRef.current = socket;
    socket.on('connect', () => {
      setConnected(true);
      setError('');
      socket.emit('host:join', { roomCode, token: localStorage.getItem('token') }, (response: any) => {
        if (!response?.ok) setError(response?.error || 'Не удалось подключиться к комнате');
        if (response?.quiz) setQuizInfo(response.quiz);
      });
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('lobby:update', setPlayers);
    socket.on('question:show', value => {
      setQuestion(value);
      setQuizInfo({ title: value.quizTitle, description: value.quizDescription });
      setQuestionNumber(value.questionNumber || 1);
      setTotalQuestions(value.totalQuestions || 0);
      const remainingMs = Number.isFinite(value.remainingMs)
        ? Math.max(0, value.remainingMs)
        : value.questionEndsAt
          ? Math.max(0, new Date(value.questionEndsAt).getTime() - Date.now())
          : Math.max(0, (value.timeLimit || 0) * 1000);
      const deadline = Date.now() + remainingMs;
      setQuestionDeadline(deadline);
      setSeconds(Math.max(0, Math.ceil(remainingMs / 1000)));
      setStarting(false);
      setMoving(false);
      setFinished(false);
    });
    socket.on('question:progress', value => setProgressInfo(value));
    socket.on('quiz:finished', board => {
      setPlayers(board);
      setQuestion(null);
      setQuestionDeadline(null);
      setFinished(true);
      setMoving(false);
    });
    return () => { socket.close(); };
  }, [roomCode]);

  useEffect(() => {
    if (!question || questionDeadline === null) return;

    const updateTimer = () => {
      setSeconds(Math.max(0, Math.ceil((questionDeadline - Date.now()) / 1000)));
    };

    updateTimer();
    const timer = window.setInterval(updateTimer, 250);
    return () => window.clearInterval(timer);
  }, [question, questionDeadline]);

  useEffect(() => {
    if (!question || finished) return;
    const interval = window.setInterval(() => socketRef.current?.emit('leaderboard:get', null, (board: any[]) => board && setPlayers(board)), 2500);
    return () => window.clearInterval(interval);
  }, [question, finished]);

  function start() {
    if (starting || question) return;
    setError(''); setStarting(true);
    socketRef.current?.emit('host:start', null, (response: any) => {
      if (response && !response.ok) { setError(response.error); setStarting(false); }
    });
  }

  function next() {
    if (moving) return;
    setError(''); setMoving(true);
    socketRef.current?.emit('host:next', null, (response: any) => {
      if (response && !response.ok) { setError(response.error); setMoving(false); }
    });
  }

  async function copyCode() {
    await navigator.clipboard.writeText(roomCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  const totalTime = question?.timeLimit || 1;
  const progress = Math.max(0, Math.min(100, (seconds / totalTime) * 100));
  const timerClass = seconds <= 5 ? 'timer danger' : seconds <= 10 ? 'timer warning' : 'timer';

  return (
    <main className="container section">
      <div className="row-between page-header">
        <div><span className="eyebrow">Комната ведущего</span><h1 className="break-text">{finished ? 'Квиз завершён' : question ? `Вопрос ${questionNumber}` : quizInfo.title || 'Ожидание участников'}</h1></div>
        <Link className="btn btn-ghost" href="/dashboard">В кабинет</Link>
      </div>
      {!connected && <div className="alert alert-info" style={{ marginBottom: 18 }}>Восстанавливаем соединение…</div>}
      {error && <div className="alert alert-error" style={{ marginBottom: 18 }}>{error}</div>}

      <div className="host-layout">
        <section className="card">
          {!question && !finished && (
            <div className="center">
              {quizInfo.title && <h2 className="break-text">{quizInfo.title}</h2>}
              {quizInfo.description && <p className="muted break-text quiz-description">{quizInfo.description}</p>}
              <p className="muted">Код комнаты</p>
              <div className="room-code">{roomCode}</div>
              <button className="btn btn-secondary" onClick={copyCode}>{copied ? 'Код скопирован' : 'Скопировать код'}</button>
              <p className="muted" style={{ marginTop: 22 }}>Участники могут подключиться на странице «Присоединиться».</p>
              <button className="btn btn-large" style={{ marginTop: 18 }} disabled={starting || players.length === 0 || !connected} onClick={start}>
                {starting ? 'Запускаем…' : players.length === 0 ? 'Ждём участников' : 'Начать квиз'}
              </button>
            </div>
          )}

          {question && !finished && (
            <>
              <div className="row-between"><span className="pill">Вопрос {questionNumber}{totalQuestions ? ` из ${totalQuestions}` : ''}</span><span className={timerClass}>{seconds} сек.</span></div>
              <div className="progress" style={{ margin: '16px 0 24px' }}><div style={{ width: `${progress}%` }} /></div>
              <div className="question break-text">{question.text}</div>
              {question.imageUrl && <img className="image-preview" src={question.imageUrl} alt="Изображение вопроса" />}
              <p className="muted">{question.options.length} вариантов · {question.points} баллов · Ответили {progressInfo.answered} из {progressInfo.total || players.length}</p>
              <button className="btn btn-block" disabled={moving || !connected} onClick={next}>{moving ? 'Переходим…' : seconds > 0 ? 'Завершить вопрос и перейти дальше' : 'Следующий вопрос'}</button>
            </>
          )}

          {finished && (
            <div><div className="center"><span className="eyebrow">Результаты</span><h2>Итоговый лидерборд</h2></div>{players.map((player, index) => <div className="leader" key={`${player.nickname}-${index}`}><span><span className="rank">{index + 1}</span>{player.nickname}</span><b>{player.score} баллов</b></div>)}<Link className="btn btn-block" style={{ marginTop: 18 }} href="/dashboard">Вернуться в кабинет</Link></div>
          )}
        </section>

        <aside className="card host-sidebar">
          <div className="row-between"><h2 style={{ margin: 0 }}>{finished ? 'Лидерборд' : 'Участники'}</h2><span className="pill">{players.length}</span></div>
          <div style={{ marginTop: 12 }}>{players.length === 0 ? <p className="muted">Пока никто не подключился.</p> : players.map((player, index) => <div className="leader" key={`${player.nickname}-${index}`}><span className="break-text"><span className="rank">{index + 1}</span>{player.nickname}</span><b>{player.score}</b></div>)}</div>
        </aside>
      </div>
    </main>
  );
}
