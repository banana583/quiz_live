'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getStoredUser, logout, StoredUser } from '../lib/auth';

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setUser(getStoredUser());
    setOpen(false);
  }, [pathname]);

  function signOut() {
    logout();
    setUser(null);
    router.push('/');
    router.refresh();
  }

  const active = (href: string) => pathname === href ? 'nav-link active' : 'nav-link';

  return (
    <header className="site-header">
      <nav className="nav container nav-container">
        <Link className="brand" href="/">
          <span className="brand-mark">Q</span>
          Quiz Live
        </Link>

        <button className="menu-button" onClick={() => setOpen(v => !v)} aria-label="Открыть меню">
          ☰
        </button>

        <div className={`navlinks ${open ? 'open' : ''}`}>
          <Link className={active('/')} href="/">Главная</Link>
          <Link className={active('/join')} href="/join">Присоединиться</Link>
          {user && <Link className={active('/dashboard')} href="/dashboard">Кабинет</Link>}
          {user?.role === 'ORGANIZER' && <Link className={active('/create')} href="/create">Создать квиз</Link>}

          {user ? (
            <div className="user-menu">
              <div>
                <strong>{user.name}</strong>
                <span>{user.role === 'ORGANIZER' ? 'Организатор' : 'Участник'}</span>
              </div>
              <button className="btn btn-ghost btn-small" onClick={signOut}>Выйти</button>
            </div>
          ) : (
            <div className="row nav-auth">
              <Link className="btn btn-ghost btn-small" href="/login">Войти</Link>
              <Link className="btn btn-small" href="/register">Регистрация</Link>
            </div>
          )}
        </div>
      </nav>
    </header>
  );
}
