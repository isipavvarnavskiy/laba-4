import React from 'react';
import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <section className="content-page not-found-page">
      <p className="eyebrow"><span /> СТРАНИЦА НЕ НАЙДЕНА</p>
      <h1>Такой страницы нет</h1>
      <p className="intro-copy">Проверьте адрес или вернитесь к каталогу.</p>
      <Link className="primary-link" to="/catalog">Открыть каталог</Link>
    </section>
  );
}