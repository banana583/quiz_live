import Link from 'next/link';
import AuthForm from '../../components/AuthForm';

export default function RegisterPage() {
  return <main className="container section" style={{ maxWidth: 520 }}><div className="page-header center"><span className="eyebrow">Новый аккаунт</span><h1>Регистрация</h1><p className="muted">Выберите роль и создайте аккаунт.</p></div><AuthForm mode="register"/><p className="center muted">Уже есть аккаунт? <Link href="/login" style={{ color: 'var(--primary)', fontWeight: 750 }}>Войти</Link></p></main>;
}
