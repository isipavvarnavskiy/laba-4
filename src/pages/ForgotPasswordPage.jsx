import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { normalizeEmail } from '../../shared/validation.js';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage('');
    setError('');
    setSubmitting(true);
    try {
      const result = await apiRequest('/auth/password-reset-requests', {
        method: 'POST',
        body: JSON.stringify({ email: normalizeEmail(email) }),
      });
      setMessage(result.message);
    } catch (requestError) {
      setError(requestError.message || 'Не удалось отправить запрос.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="content-page form-page" aria-labelledby="forgot-password-title">
      <div className="form-card">
        <p className="eyebrow"><span /> ЛИЧНЫЙ КАБИНЕТ</p>
        <h1 id="forgot-password-title">Восстановление пароля</h1>
        <p className="intro-copy">Укажите email. Запрос будет передан администратору для сброса пароля.</p>
        <form className="login-form" onSubmit={handleSubmit}>
          <label htmlFor="forgot-email">Email</label>
          <input
            id="forgot-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onBlur={() => setEmail(normalizeEmail(email))}
            maxLength={254}
            placeholder="name@example.com"
            required
          />
          {message && <p className="success-banner" role="status">{message}</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="add-button login-submit" type="submit" disabled={submitting}>
            {submitting ? 'Отправляем…' : 'Отправить запрос'}
          </button>
        </form>
        <p className="auth-switch"><Link to="/login">Вернуться ко входу</Link></p>
      </div>
    </section>
  );
}
