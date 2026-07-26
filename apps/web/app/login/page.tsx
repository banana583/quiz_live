import Link from 'next/link';
import AuthForm from '../../components/AuthForm';

export default function LoginPage() {
  return <main className="container section" style={{ maxWidth: 520 }}><div className="page-header center"><span className="eyebrow">Авторизация</span><h1>Вход</h1><p className="muted">Войдите, чтобы открыть личный кабинет.</p></div><AuthForm mode="login"/><p className="center muted">Нет аккаунта? <Link href="/register" style={{ color: 'var(--primary)', fontWeight: 750 }}>Зарегистрироваться</Link></p></main>;
}
