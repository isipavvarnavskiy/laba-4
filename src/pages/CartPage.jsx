import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useCart } from '../contexts/CartContext.jsx';
import { useServices } from '../contexts/ServicesContext.jsx';
import { formatPrice, formatServiceCount } from '../utils/formatPrice.js';
import { getServiceArtwork } from '../utils/serviceArtwork.js';

function tomorrowAtNoon() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(12, 0, 0, 0);
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

function todayDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date());
}

function formatDate(dateString) {
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(dateString));
}

export default function CartPage() {
  const { items, itemCount, removeItem, changeQuantity, clearCart, loading: cartLoading, saving: cartSaving, error: cartError, refreshCart } = useCart();
  const { user } = useAuth();
  const { services } = useServices();
  const location = useLocation();
  const navigate = useNavigate();
  const addedService = location.state?.addedService;
  const [scheduledAt, setScheduledAt] = useState(tomorrowAtNoon);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [booking, setBooking] = useState(null);
  const [order, setOrder] = useState(null);
  const [deliveryAddress, setDeliveryAddress] = useState(user?.defaultAddress || '');
  const [deliveryDate, setDeliveryDate] = useState(todayDate());
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const couponPercent = user?.discountCoupon?.discountPercent || 0;

  const itemsWithPrices = items.map((item) => {
    const currentService = services.find((service) => service.id === item.id);
    const currentItem = currentService ? { ...item, ...currentService, quantity: item.quantity } : item;
    const discountPercent = Math.max(currentItem.discountPercent || 0, couponPercent);
    const unitPrice = Math.round(currentItem.price * (100 - discountPercent) / 100);
    return { ...currentItem, discountPercent, unitPrice };
  });
  const totalPrice = itemsWithPrices.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  async function handleBooking(event) {
    event.preventDefault();
    if (!user) {
      navigate('/login', { state: { from: '/cart' } });
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const result = await apiRequest('/appointments', {
        method: 'POST',
        body: JSON.stringify({
          scheduledAt,
          items: items.map((item) => ({ serviceId: item.id, quantity: item.quantity })),
        }),
      });
      setBooking(result);
      clearCart().catch(() => {});
    } catch (bookingError) {
      setError(bookingError.message || 'Не удалось создать запись.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleOrder(event) {
    event.preventDefault();
    if (!user) {
      navigate('/login', { state: { from: '/cart' } });
      return;
    }
    setOrderSubmitting(true);
    setError('');
    try {
      const result = await apiRequest('/orders', {
        method: 'POST',
        body: JSON.stringify({ deliveryAddress, deliveryDate }),
      });
      setOrder(result);
      await refreshCart();
    } catch (orderError) {
      setError(orderError.message || 'Не удалось оформить заказ.');
    } finally {
      setOrderSubmitting(false);
    }
  }

  return (
    <section className="content-page" aria-labelledby="cart-title">
      <div className="page-intro">
        <div>
          <p className="eyebrow"><span /> ЗАПИСЬ В САЛОН
          </p>
          <h1 id="cart-title">Корзина услуг</h1>
          <p className="intro-copy">Проверьте выбранные процедуры и укажите удобное время.</p>
        </div>
        {itemCount > 0 && <p className="catalog-note">{formatServiceCount(itemCount)}</p>}
      </div>

      {addedService && !booking && (
        <p className="success-banner" role="status">
          <span aria-hidden="true">✓</span>
          «{addedService}» добавлена в корзину.
        </p>
      )}

      {booking && (
        <div className="success-banner booking-success" role="status">
          <span aria-hidden="true">✓</span>
          <div>
            <strong>Запись создана.</strong>
            <p>Время: {formatDate(booking.appointment.scheduledAt)}. Номер записи: {booking.appointment.id.slice(0, 8)}. Оплата — в салоне.</p>
          </div>
        </div>
      )}

      {order && (
        <div className="success-banner booking-success" role="status">
          <span aria-hidden="true">✓</span>
          <div>
            <strong>Заказ оформлен.</strong>
            <p>Доставка: {order.deliveryDate}. Адрес: {order.deliveryAddress}. Номер заказа: {order.id.slice(0, 8)}.</p>
          </div>
        </div>
      )}

      {cartLoading && <p className="state-message" role="status">Загружается ваша корзина…</p>}
      {cartError && (
        <div className="error-state" role="alert">
          <p>{cartError}</p>
          <button className="add-button" type="button" onClick={refreshCart}>Обновить корзину</button>
        </div>
      )}

      {cartLoading && items.length === 0 ? null : items.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon" aria-hidden="true">✳</span>
          <h2>{booking ? 'Корзина очищена' : 'Корзина пока пуста'}</h2>
          <p>{booking
            ? 'Выбранные услуги сохранены в разделе «Кабинет».'
            : user
              ? 'Выберите процедуры в каталоге, чтобы записаться.'
              : 'Войдите в аккаунт, чтобы корзина сохранялась отдельно для вас.'}</p>
          <Link className="primary-link" to={booking ? '/dashboard' : user ? '/catalog' : '/login'}>
            {booking ? 'Посмотреть запись' : user ? 'Открыть каталог услуг' : 'Войти'}
          </Link>
          {!user && <Link className="text-link cart-register-link" to="/register">Зарегистрироваться</Link>}
        </div>
      ) : (
        <div className="cart-layout">
          <div className="cart-list" aria-label="Услуги в корзине">
            {itemsWithPrices.map((item) => (
              <article className="cart-row" key={item.id}>
                <div className={'cart-row-art product-art--' + item.tone} aria-hidden="true">
                  <img className="cart-row-image" src={getServiceArtwork(item.id)} alt="" loading="lazy" />
                </div>
                <div className="cart-item-copy">
                  <p className="product-category">{item.categoryName || 'Услуга'} · {item.duration} мин.</p>
                  <h2>{item.name}</h2>
                  <p className="cart-unit-price">
                    {item.discountPercent > 0 && <del>{formatPrice(item.price)} </del>}
                    {formatPrice(item.unitPrice)} за услугу
                    {item.discountPercent > 0 && <span className="discount-note"> · скидка {item.discountPercent}%</span>}
                  </p>
                  <div className="quantity-control" role="group" aria-label={'Количество услуги «' + item.name + '»'}>
                    <button
                      className="quantity-button"
                      type="button"
                      aria-label={'Уменьшить количество: ' + item.name}
                      disabled={cartSaving}
                      onClick={() => changeQuantity(item.id, -1).catch(() => {})}
                    >−</button>
                    <output className="quantity-value" aria-live="polite">{item.quantity}</output>
                    <button
                      className="quantity-button"
                      type="button"
                      aria-label={'Увеличить количество: ' + item.name}
                      disabled={item.quantity >= 10 || cartSaving}
                      onClick={() => changeQuantity(item.id, 1).catch(() => {})}
                    >+</button>
                  </div>
                </div>
                <div className="cart-item-side">
                  <strong>{formatPrice(item.unitPrice * item.quantity)}</strong>
                  <button className="remove-item" type="button" disabled={cartSaving} onClick={() => removeItem(item.id).catch(() => {})}>
                    Удалить
                  </button>
                </div>
              </article>
            ))}
          </div>

          <aside className="cart-summary" aria-label="Детали корзины">
            <p className="eyebrow">ВАША ЗАПИСЬ</p>
            <div className="summary-total">
              <span>Итого</span>
              <strong>{formatPrice(totalPrice)}</strong>
            </div>
            <p className="summary-note">Услуг в корзине: {itemCount}</p>
            {user?.discountCoupon && (
              <p className="coupon-note">
                Персональный купон {user.discountCoupon.code} · скидка {user.discountCoupon.discountPercent}%. Применится большая из скидок: по купону или на услугу.
              </p>
            )}
            <form className="booking-form" onSubmit={handleBooking}>
              <label htmlFor="appointment-time">Дата и время</label>
              <input
                id="appointment-time"
                type="datetime-local"
                min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
                required
              />
              {error && <p className="form-error" role="alert">{error}</p>}
              {user ? (
                <button className="add-button booking-submit" type="submit" disabled={submitting || cartSaving}>
                  {submitting ? 'Создаётся запись…' : 'Записаться'}
                </button>
              ) : (
                <button className="add-button booking-submit" type="submit">Войти и записаться</button>
              )}
            </form>
            <form className="booking-form order-form" onSubmit={handleOrder}>
              <p className="eyebrow">ДОСТАВКА</p>
              <label htmlFor="delivery-address">Адрес доставки</label>
              <input
                id="delivery-address"
                type="text"
                value={deliveryAddress}
                onChange={(event) => setDeliveryAddress(event.target.value)}
                minLength={5}
                maxLength={250}
                placeholder="Город, улица, дом, квартира"
                required
              />
              <label htmlFor="delivery-date">Дата доставки</label>
              <input
                id="delivery-date"
                type="date"
                min={todayDate()}
                value={deliveryDate}
                onChange={(event) => setDeliveryDate(event.target.value)}
                required
              />
              <button className="add-button booking-submit" type="submit" disabled={orderSubmitting || cartSaving}>
                {orderSubmitting ? 'Оформляем заказ…' : 'Оформить заказ'}
              </button>
            </form>
            <Link className="primary-link summary-link" to="/catalog">Выбрать ещё услуги</Link>
            <button className="clear-cart" type="button" disabled={cartSaving} onClick={() => clearCart().catch(() => {})}>Очистить корзину</button>
          </aside>
        </div>
      )}
    </section>
  );
}
