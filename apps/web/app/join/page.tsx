'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredUser } from '../../lib/auth';

export default function Join() {
  const user = typeof window !== 'undefined' ? getStoredUser() : null;
  const [code, setCode] = useState('');
  const [name, setName] = useState(user?.name || '');
  const [error, setError] = useState('');
  const router = useRouter();

  function join() {
    const cleanCode = code.trim().toUpperCase();
    const cleanName = name.trim();
    if (cleanCode.length !== 6) return setError('Код комнаты должен состоять из 6 символов.');
    if (cleanName.length < 2) return setError('Введите имя минимум из 2 символов.');
    router.push(`/play/${cleanCode}?name=${encodeURIComponent(cleanName)}`);
  }

  return (
    <main className="container section" style={{ maxWidth: 560 }}>
      <div className="page-header center"><span className="eyebrow">Подключение</span><h1>Войти в квиз</h1><p className="muted">Введите код комнаты, который показал ведущий.</p></div>
      <div className="card stack">
        <label>Код комнаты<input className="input center" style={{ fontSize: 28, letterSpacing: 6, textTransform: 'uppercase' }} maxLength={6} value={code} placeholder="A7K2QX" onChange={e => setCode(e.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase())} /></label>
        <label>Ваше имя<input className="input" value={name} placeholder="Имя участника" onChange={e => setName(e.target.value)} /></label>
        {error && <div className="alert alert-error">{error}</div>}
        <button className="btn btn-block" disabled={code.length !== 6 || name.trim().length < 2} onClick={join}>Подключиться</button>
      </div>
    </main>
  );
}
