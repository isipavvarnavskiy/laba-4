import React, { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { normalizeEmail } from '../../shared/validation.js';

export default function LoginPage() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(normalizeEmail(email), password);
      navigate(location.state?.from || '/dashboard', { replace: true });
    } catch (loginError) {
      setError(loginError.message || 'Не удалось выполнить вход.');
    } finally {
      setSubmitting(false);
    }
  }

  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <section className="content-page form-page" aria-labelledby="login-title">
      <div className="form-card">
        <p className="eyebrow"><span /> ЛИЧНЫЙ КАБИНЕТ</p>
        <h1 id="login-title">Войти в AURA</h1>
        <p className="intro-copy">Авторизуйтесь, чтобы оформить запись и применить персональный купон.</p>
        <form className="login-form" onSubmit={handleSubmit}>
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onBlur={() => setEmail(normalizeEmail(email))}
            placeholder="name@example.com"
            maxLength={254}
            required
          />
          <label htmlFor="login-password">Пароль</label>
          <input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Введите пароль"
            maxLength={128}
            required
          />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="add-button login-submit" type="submit" disabled={submitting}>
            {submitting ? 'Проверяем данные…' : 'Войти'}
          </button>
        </form>
        <p className="auth-switch"><Link to="/forgot-password">Забыли пароль?</Link></p>
        <div className="demo-credentials">
          <p><strong>Демо-клиент:</strong> anna@example.com / client123</p>
          <p><strong>Администратор:</strong> admin@aurasalon.ru / admin123</p>
        </div>
        <p className="auth-switch">Нет аккаунта? <Link to="/register" state={location.state}>Зарегистрироваться</Link></p>
      </div>
    </section>
  );
}
