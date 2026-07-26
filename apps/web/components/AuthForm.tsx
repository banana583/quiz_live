'use client';

import { useState } from 'react';
import { api } from '../lib/api';
import { useRouter } from 'next/navigation';

type Mode = 'login' | 'register';

export default function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'PARTICIPANT' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);

    try {
      const payload = mode === 'login'
        ? { email: form.email.trim(), password: form.password }
        : { ...form, name: form.name.trim(), email: form.email.trim() };
      const data = await api(`/auth/${mode}`, { method: 'POST', body: JSON.stringify(payload) });
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      router.push('/dashboard');
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Не удалось выполнить запрос');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit}>
      {mode === 'register' && (
        <>
          <label>
            Имя
            <input className="input" value={form.name} placeholder="Как к вам обращаться" required minLength={2} onChange={e => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>
            Роль
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
              <option value="PARTICIPANT">Участник</option>
              <option value="ORGANIZER">Организатор</option>
            </select>
          </label>
        </>
      )}

      <label>
        Email
        <input className="input" type="email" value={form.email} placeholder="name@example.com" required onChange={e => setForm({ ...form, email: e.target.value })} />
      </label>
      <label>
        Пароль
        <input className="input" type="password" value={form.password} placeholder="Минимум 8 символов" required minLength={8} onChange={e => setForm({ ...form, password: e.target.value })} />
      </label>

      {error && <div className="alert alert-error">{error}</div>}
      <button className="btn btn-block" disabled={loading}>
        {loading ? 'Подождите…' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
      </button>
    </form>
  );
}
