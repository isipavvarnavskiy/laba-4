import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useCart } from '../contexts/CartContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useTheme } from '../contexts/ThemeContext.jsx';
import { formatServiceCount } from '../utils/formatPrice.js';

export default function SiteHeader() {
  const { itemCount } = useCart();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigation = [
    { to: '/catalog', label: 'Услуги', end: true },
    ...(user?.role !== 'admin' ? [{ to: '/cart', label: 'Корзина', end: true }] : []),
    ...(user ? [{ to: '/dashboard', label: user.role === 'admin' ? 'Администрирование' : 'Кабинет', end: true }] : []),
    ...(!user ? [{ to: '/login', label: 'Войти', end: true }] : []),
    ...(!user ? [{ to: '/register', label: 'Регистрация', end: true, isButton: true }] : []),
  ];

  return (
    <header className="topbar">
      <Link className="brand" to="/catalog" aria-label="AURA — салон красоты">
        <span className="brand-mark" aria-hidden="true">a.</span>
        <span>AURA <small>салон красоты</small></span>
      </Link>

      <nav className="topbar-nav" aria-label="Основная навигация">
        {navigation.map(({ to, label, end, isButton }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => 'nav-link' + (isActive ? ' is-active' : '') + (isButton ? ' registration-nav-link' : '')}
          >
            {label}
            {to === '/cart' && <span className="cart-count" aria-label={formatServiceCount(itemCount)}>{itemCount}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="topbar-actions">
        {user && <button className="logout-button" type="button" onClick={logout}>Выйти</button>}
        <button
          className="theme-toggle"
          type="button"
          onClick={toggleTheme}
          aria-label={'Переключить на ' + (theme === 'light' ? 'тёмную' : 'светлую') + ' тему'}
        >
          <span aria-hidden="true">{theme === 'light' ? '☾' : '☼'}</span>
          <span>{theme === 'light' ? 'Тёмная тема' : 'Светлая тема'}</span>
        </button>
      </div>
    </header>
  );
}
