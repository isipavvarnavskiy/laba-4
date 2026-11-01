import React, { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import RussianPhoneInput from '../components/RussianPhoneInput.jsx';
import { getEmailError, getPasswordError, getPersonNameError, isValidRussianPhone, normalizeEmail, normalizePersonName, PASSWORD_RULES_TEXT } from '../../shared/validation.js';

export default function RegisterPage() {
  const { user, register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    const nameError = getPersonNameError(name, 'Полное имя');
    if (nameError) { setError(nameError); return; }
    const emailError = getEmailError(email);
    if (emailError) { setError(emailError); return; }
    const passwordError = getPasswordError(password);
    if (passwordError) { setError(passwordError); return; }
    if (!isValidRussianPhone(phone)) {
      setError('Введите российский номер полностью в формате +7(900)123-45-67.');
      return;
    }
    if (password !== passwordConfirmation) {
      setError('Пароли не совпадают. Проверьте оба поля.');
      return;
    }

    setSubmitting(true);
    try {
      await register({ name: normalizePersonName(name), email: normalizeEmail(email), password, phone });
      navigate(location.state?.from || '/dashboard', { replace: true });
    } catch (registrationError) {
      setError(registrationError.message || 'Не удалось создать аккаунт.');
    } finally {
      setSubmitting(false);
    }
  }

  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <section className="content-page form-page" aria-labelledby="register-title">
      <div className="form-card">
        <p className="eyebrow"><span /> ЛИЧНЫЙ КАБИНЕТ</p>
        <h1 id="register-title">Регистрация в AURA</h1>
        <p className="intro-copy">Создайте аккаунт, чтобы записываться на услуги и применять персональный купон.</p>
        <form className="login-form" onSubmit={handleSubmit}>
          <label htmlFor="register-name">Полное имя</label>
          <input
            id="register-name"
            name="name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => setName(normalizePersonName(name))}
            placeholder="Фамилия Имя Отчество"
            minLength={2}
            maxLength={120}
            required
          />
          <label htmlFor="register-email">Email</label>
          <input
            id="register-email"
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
          <label htmlFor="register-phone">Телефон</label>
          <RussianPhoneInput
            id="register-phone"
            name="phone"
            value={phone}
            onChange={setPhone}
            required
          />
          <small className="field-hint">Формат номера: +7(900)123-45-67.</small>
          <label htmlFor="register-password">Пароль</label>
          <input
            id="register-password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Придумайте пароль"
            minLength={8}
            maxLength={128}
            required
          />
          <small className="field-hint">Требования: {PASSWORD_RULES_TEXT}</small>
          <label htmlFor="register-password-confirmation">Повторите пароль</label>
          <input
            id="register-password-confirmation"
            name="passwordConfirmation"
            type="password"
            autoComplete="new-password"
            value={passwordConfirmation}
            onChange={(event) => setPasswordConfirmation(event.target.value)}
            placeholder="Введите пароль ещё раз"
            minLength={8}
            maxLength={128}
            required
          />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="add-button login-submit" type="submit" disabled={submitting}>
            {submitting ? 'Создаём аккаунт…' : 'Зарегистрироваться'}
          </button>
        </form>
        <p className="auth-switch">Уже есть аккаунт? <Link to="/login">Войти</Link></p>
      </div>
    </section>
  );
}
