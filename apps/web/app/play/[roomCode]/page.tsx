'use client';

import { use, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';

const URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000';

export default function Play({ params }: { params: Promise<{ roomCode: string }> }) {
  const { roomCode } = use(params);
  const name = useSearchParams().get('name') || 'Игрок';
  const socketRef = useRef<Socket | null>(null);
  const [question, setQuestion] = useState<any>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState('Подключение…');
  const [result, setResult] = useState('');
  const [board, setBoard] = useState<any[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [questionDeadline, setQuestionDeadline] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [questionNumber, setQuestionNumber] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [quizInfo, setQuizInfo] = useState<{ title?: string; description?: string }>({});

  useEffect(() => {
    const socket = io(URL);
    socketRef.current = socket;
    const participationKey = `quiz-participation-${roomCode}`;
    socket.emit(
      'participant:join',
      {
        roomCode,
        nickname: name,
        token: localStorage.getItem('token'),
        participationId: localStorage.getItem(participationKey),
      },
      (response: any) => {
        if (response?.ok) {
          if (response.participationId) {
            localStorage.setItem(participationKey, response.participationId);
          }
          if (response.quiz) setQuizInfo(response.quiz);
          setStatus(response.finished ? 'Квиз завершён' : 'Вы подключились. Ожидаем начала квиза.');
        } else {
          setStatus(response?.error || 'Не удалось войти в комнату');
        }
      }
    );
    socket.on('question:show', value => {
      setQuestion(value);
      setSelected([]);
      setResult('');
      setSubmitted(false);
      setIsCorrect(null);
      setSubmitting(false);
      const remainingMs = Number.isFinite(value.remainingMs)
        ? Math.max(0, value.remainingMs)
        : value.questionEndsAt
          ? Math.max(0, new Date(value.questionEndsAt).getTime() - Date.now())
          : Math.max(0, (value.timeLimit || 0) * 1000);
      const deadline = Date.now() + remainingMs;
      setQuestionDeadline(deadline);
      setSeconds(Math.max(0, Math.ceil(remainingMs / 1000)));
      setQuestionNumber(value.questionNumber || 1);
      setTotalQuestions(value.totalQuestions || 0);
      setQuizInfo({ title: value.quizTitle, description: value.quizDescription });
      if (value.answerState?.submitted) {
        setSubmitted(true);
        setIsCorrect(Boolean(value.answerState.isCorrect));
        setResult(value.answerState.isCorrect ? `Верно! +${value.answerState.points} баллов` : 'Ответ уже был принят. В этот раз неверно.');
      }
      setStatus('');
    });
    socket.on('quiz:finished', finalBoard => {
      setBoard(finalBoard);
      setQuestion(null);
      setQuestionDeadline(null);
      setStatus('Квиз завершён');
    });
    socket.on('room:closed', payload => {
      setQuestion(null);
      setQuestionDeadline(null);
      setBoard([]);
      setStatus(payload?.message || 'Комната закрыта организатором.');
      localStorage.removeItem(participationKey);
    });
    return () => { socket.close(); };
  }, [roomCode, name]);

  useEffect(() => {
    if (!question || questionDeadline === null) return;

    const updateTimer = () => {
      setSeconds(Math.max(0, Math.ceil((questionDeadline - Date.now()) / 1000)));
    };

    updateTimer();
    const timer = window.setInterval(updateTimer, 250);
    return () => window.clearInterval(timer);
  }, [question, questionDeadline]);

  function toggle(id: string) {
    if (!question || submitted || seconds <= 0) return;
    setSelected(current => question.type === 'SINGLE' ? [id] : current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  }

  function submit() {
    if (!question || submitting || submitted || selected.length === 0 || seconds <= 0) return;
    setSubmitting(true);
    socketRef.current?.emit('answer:submit', { questionId: question.id, optionIds: selected }, (response: any) => {
      setSubmitting(false);
      if (response?.ok) {
        setSubmitted(true);
        setIsCorrect(Boolean(response.isCorrect));
        setResult(
          response.isCorrect
            ? `Верно! +${response.points} баллов`
            : 'Ответ принят. В этот раз неверно.'
        );
      } else {
        setIsCorrect(null);
        setResult(response?.error || 'Не удалось отправить ответ');
      }
    });
  }

  const totalTime = question?.timeLimit || 1;
  const progress = Math.max(0, Math.min(100, (seconds / totalTime) * 100));
  const expired = seconds <= 0 && !!question && !submitted;

  return (
    <main className="container section" style={{ maxWidth: 820 }}>
      <div className="row-between page-header"><div><span className="eyebrow">Комната {roomCode}</span><h1>{name}</h1></div>{question && <span
  className={
    seconds <= 5
      ? 'timer danger'
      : seconds <= 10
        ? 'timer warning'
        : 'timer'
  }
>
  {seconds} сек.
</span>}</div>

      {status && !question && board.length === 0 && <div className="card center">{quizInfo.title && <h2 className="break-text">{quizInfo.title}</h2>}{quizInfo.description && <p className="muted break-text quiz-description">{quizInfo.description}</p>}<div className="loading"><span className="spinner" />{status}</div></div>}

      {question && (
        <section className="card">
          <div className="row-between"><span className="pill">Вопрос {questionNumber}{totalQuestions ? ` из ${totalQuestions}` : ''}</span><span className="muted">{question.type === 'SINGLE' ? 'Выберите один ответ' : 'Можно выбрать несколько'}</span></div>
          <div className="progress" style={{ margin: '16px 0 24px' }}><div style={{ width: `${progress}%` }} /></div>
          <div className="question break-text">{question.text}</div>
          {question.imageUrl && <img className="image-preview" src={question.imageUrl} alt="Изображение вопроса" />}

          <div className="answer-grid">
            {question.options.map((option: any) => (
              <button key={option.id} className={`answer-button ${selected.includes(option.id) ? 'selected' : ''}`} disabled={submitted || expired} onClick={() => toggle(option.id)}>{option.text}</button>
            ))}
          </div>

          {expired && <div className="alert alert-error" style={{ marginTop: 18 }}>Время закончилось. Ожидайте следующий вопрос.</div>}
          {result && (
            <div
              className={`alert ${isCorrect === true ? 'alert-success' : 'alert-error'}`}
              style={{ marginTop: 18 }}
            >
              {result}
            </div>
          )}
          <button className="btn btn-block" style={{ marginTop: 18 }} disabled={!selected.length || submitted || submitting || expired} onClick={submit}>{submitting ? 'Отправляем…' : submitted ? 'Ответ отправлен' : 'Ответить'}</button>
        </section>
      )}

      {board.length > 0 && (
        <section className="card">
          <div className="center"><span className="eyebrow">Финиш</span><h2>Итоговый лидерборд</h2></div>
          {board.map((player, index) => <div className="leader" key={`${player.nickname}-${index}`}><span><span className="rank">{index + 1}</span>{player.nickname}</span><b>{player.score} баллов</b></div>)}
        </section>
      )}
    </main>
  );
}
