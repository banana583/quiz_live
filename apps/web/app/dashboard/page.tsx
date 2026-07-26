'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { getStoredUser, StoredUser } from '../../lib/auth';

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [launchingId, setLaunchingId] = useState('');
  const [deletingId, setDeletingId] = useState('');

  useEffect(() => {
    const stored = getStoredUser();
    if (!stored || !localStorage.getItem('token')) {
      router.replace('/login');
      return;
    }
    setUser(stored);
    Promise.all([stored.role === 'ORGANIZER' ? api('/quizzes') : Promise.resolve([]), api('/history')])
      .then(([quizData, historyData]) => { setQuizzes(quizData); setHistory(historyData); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [router]);

  const stats = useMemo(() => {
    if (user?.role === 'ORGANIZER') {
      return {
        first: quizzes.length,
        second: quizzes.reduce((sum, q) => sum + (q._count?.sessions || 0), 0),
        third: history.reduce((sum, s) => sum + (s.participantCount || s.participants?.length || 0), 0),
      };
    }
    const scores = history.map(item => item.score || 0);
    return { first: history.length, second: scores.reduce((a, b) => a + b, 0), third: scores.length ? Math.max(...scores) : 0 };
  }, [quizzes, history, user]);

  async function launch(id: string) {
    if (launchingId) return;
    setError(''); setLaunchingId(id);
    try {
      const session = await api(`/quizzes/${id}/sessions`, { method: 'POST' });
      router.push(`/host/${session.roomCode}`);
    } catch (err: any) { setError(err.message); setLaunchingId(''); }
  }

  async function removeQuiz(id: string, title: string) {
    if (deletingId || !window.confirm(`Удалить квиз «${title}»? Это действие нельзя отменить.`)) return;
    setError(''); setDeletingId(id);
    try {
      await api(`/quizzes/${id}`, { method: 'DELETE' });
      setQuizzes(current => current.filter(q => q.id !== id));
    } catch (err: any) { setError(err.message); }
    finally { setDeletingId(''); }
  }

  if (loading) return <main className="container"><div className="loading"><span className="spinner" /> Загружаем кабинет…</div></main>;
  const organizer = user?.role === 'ORGANIZER';

  return (
    <main className="container section">
      <div className="row-between page-header">
        <div><span className="eyebrow">Личный кабинет</span><h1>Привет, {user?.name}</h1><p className="muted">{organizer ? 'Управляйте квизами и запускайте новые игры.' : 'Здесь хранится история ваших результатов.'}</p></div>
        {organizer ? <Link className="btn" href="/create">+ Новый квиз</Link> : <Link className="btn" href="/join">Войти в квиз</Link>}
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      <div className="stat-grid">
        <div className="stat-card"><span>{organizer ? 'Мои квизы' : 'Пройдено квизов'}</span><strong>{stats.first}</strong></div>
        <div className="stat-card"><span>{organizer ? 'Всего запусков' : 'Всего баллов'}</span><strong>{stats.second}</strong></div>
        <div className="stat-card"><span>{organizer ? 'Участников в истории' : 'Лучший результат'}</span><strong>{stats.third}</strong></div>
      </div>

      {organizer ? (
        <section>
          <div className="row-between"><h2>Мои квизы</h2><span className="muted">{quizzes.length} шт.</span></div>
          {quizzes.length === 0 ? (
            <div className="card empty-state"><h2>Квизов пока нет</h2><p className="muted">Создайте первый квиз и пригласите участников.</p><Link className="btn" href="/create">Создать квиз</Link></div>
          ) : (
            <div className="quiz-grid">
              {quizzes.map(q => (
                <article className="card quiz-card" key={q.id}>
                  <span className="pill">{q.category}</span>
                  <h2 className="break-text">{q.title}</h2>
                  {q.description && <p className="muted break-text">{q.description}</p>}
                  <div className="quiz-meta"><span>{q._count?.questions || 0} вопросов</span><span>{q._count?.sessions || 0} запусков</span></div>
                  <div className="quiz-actions">
                    <button className="btn" disabled={launchingId === q.id} onClick={() => launch(q.id)}>{launchingId === q.id ? 'Создаём…' : 'Запустить'}</button>
                    <Link className="btn btn-secondary" href={`/create?id=${q.id}`}>Редактировать</Link>
                    <button className="btn btn-danger" disabled={deletingId === q.id} onClick={() => removeQuiz(q.id, q.title)}>{deletingId === q.id ? 'Удаляем…' : 'Удалить'}</button>
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className="row-between" style={{ marginTop: 38 }}><h2>История запусков</h2></div>
          <div className="card card-flat">
            {history.length === 0 ? <p className="muted">Запусков пока нет.</p> : history.map((item, index) => (
              <div className="leader" key={item.id || index}><span><strong>{item.quiz?.title}</strong><br/><small className="muted">{new Date(item.createdAt).toLocaleString('ru-RU')}</small></span><span>{item.participantCount || item.participants?.length || 0} участников</span></div>
            ))}
          </div>
        </section>
      ) : (
        <section><h2>История участия</h2><div className="card card-flat">
          {history.length === 0 ? <div className="empty-state"><h2>История пуста</h2><p className="muted">Подключитесь к активной комнате и пройдите первый квиз.</p><Link className="btn" href="/join">Присоединиться</Link></div> : history.map((item, index) => (
            <div className="leader" key={item.id || index}><span><span className="rank">{index + 1}</span><strong>{item.session?.quiz?.title || 'Квиз'}</strong><br/><small className="muted">{new Date(item.joinedAt).toLocaleString('ru-RU')}</small></span><b>{item.score || 0} баллов{item.rank ? ` · ${item.rank} место` : ''}</b></div>
          ))}
        </div></section>
      )}
    </main>
  );
}
