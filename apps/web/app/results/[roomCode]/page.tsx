'use client';

import { use, useEffect, useState } from 'react';
import { API } from '../../../lib/api';

export default function Results({ params }: { params: Promise<{ roomCode: string }> }) {
  const { roomCode } = use(params);
  const [session, setSession] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API}/sessions/${roomCode}`)
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Не удалось загрузить результаты');
        setSession(data);
      })
      .catch(err => setError(err.message));
  }, [roomCode]);

  return (
    <main className="container section" style={{ maxWidth: 760 }}>
      <div className="page-header center"><span className="eyebrow">Комната {roomCode}</span><h1>Результаты</h1><p className="muted">{session?.quiz?.title}</p></div>
      {error && <div className="alert alert-error">{error}</div>}
      {!session && !error && <div className="loading"><span className="spinner" /> Загружаем результаты…</div>}
      {session && <div className="card">{session.participants?.length ? session.participants.map((player: any, index: number) => <div className="leader" key={player.id}><span><span className="rank">{index + 1}</span>{player.nickname}</span><b>{player.score} баллов</b></div>) : <p className="muted center">Результатов пока нет.</p>}</div>}
    </main>
  );
}
