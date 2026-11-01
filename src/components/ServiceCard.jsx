import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../contexts/CartContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { formatPrice } from '../utils/formatPrice.js';
import { getServiceArtwork } from '../utils/serviceArtwork.js';
import { apiRequest } from '../api/client.js';

export default function ServiceCard({ service }) {
  const { addItem, items } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const quantityInCart = items.find((item) => item.id === service.id)?.quantity || 0;
  const quantityLimitReached = quantityInCart >= 10;
  const hasDiscount = Number(service.discountPercent) > 0;
  const discountedPrice = Math.round(service.price * (100 - (service.discountPercent || 0)) / 100);
  const [reviews, setReviews] = useState([]);
  const [reviewsOpen, setReviewsOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [reviewSending, setReviewSending] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [cartError, setCartError] = useState('');

  useEffect(() => {
    if (!reviewsOpen) return undefined;
    let active = true;
    setReviewLoading(true);
    setReviewError('');
    apiRequest(`/services/${encodeURIComponent(service.id)}/reviews`)
      .then((data) => { if (active) setReviews(Array.isArray(data) ? data : []); })
      .catch((error) => { if (active) setReviewError(error.message); })
      .finally(() => { if (active) setReviewLoading(false); });
    return () => { active = false; };
  }, [reviewsOpen, service.id]);

  async function handleAddToCart() {
    if (!user) {
      navigate('/login', { state: { from: '/catalog' } });
      return;
    }
    if (quantityLimitReached || adding) return;
    setAdding(true);
    setCartError('');
    try {
      await addItem(service);
      navigate('/cart', { state: { addedService: service.name } });
    } catch (error) {
      setCartError(error.message || 'Не удалось добавить услугу в корзину.');
    } finally {
      setAdding(false);
    }
  }

  async function submitReview(event) {
    event.preventDefault();
    if (!user) {
      navigate('/login', { state: { from: '/catalog' } });
      return;
    }
    setReviewSending(true);
    setReviewError('');
    if (comment.trim().length < 2) {
      setReviewError('Комментарий должен содержать не менее 2 символов.');
      setReviewSending(false);
      return;
    }
    try {
      const saved = await apiRequest(`/services/${encodeURIComponent(service.id)}/reviews`, {
        method: 'POST',
        body: JSON.stringify({ rating: Number(rating), comment }),
      });
      setReviews((current) => [saved, ...current.filter((review) => review.userName !== saved.userName)]);
      setComment('');
    } catch (error) {
      setReviewError(error.message || 'Не удалось сохранить отзыв.');
    } finally {
      setReviewSending(false);
    }
  }

  return (
    <article className="product-card">
      <div className={'product-art product-art--' + service.tone} aria-hidden="true">
        {hasDiscount && <span className="product-label">−{service.discountPercent}%</span>}
        <img className="product-image" src={getServiceArtwork(service.id)} alt="" loading="lazy" />
      </div>

      <div className="product-info">
        <p className="product-category">{service.categoryName || 'Услуга'}</p>
        <div className="product-heading">
          <h2>{service.name}</h2>
          <span className="price">
            {hasDiscount && <del>{formatPrice(service.price)}</del>}
            {formatPrice(discountedPrice)}
          </span>
        </div>
        <p className="product-description">{service.description}</p>
        <p className="service-duration">{service.duration} минут</p>
        <button className="review-toggle" type="button" onClick={() => setReviewsOpen((open) => !open)}>
          {reviewsOpen ? 'Скрыть отзывы' : 'Отзывы'}
        </button>
        {reviewsOpen && (
          <div className="reviews-panel">
            {reviewLoading && <p className="state-message" role="status">Загружаются отзывы…</p>}
            {reviews.length === 0
              ? !reviewLoading && !reviewError && <p className="summary-note">Отзывов пока нет.</p>
              : reviews.map((review) => (
                <article className="review-item" key={review.id}>
                  <strong>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</strong>
                  <p>{review.comment}</p>
                  <small>{review.userName}</small>
                </article>
              ))}
            {!user && reviewError && <p className="form-error" role="alert">{reviewError}</p>}
            {user && user.role !== 'admin' && (
              <form className="review-form" onSubmit={submitReview}>
                <label htmlFor={`rating-${service.id}`}>Оценка</label>
                <select id={`rating-${service.id}`} value={rating} onChange={(event) => setRating(event.target.value)}>
                  {[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} из 5</option>)}
                </select>
                <label htmlFor={`comment-${service.id}`}>Комментарий</label>
                <textarea
                  id={`comment-${service.id}`}
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  minLength={2}
                  maxLength={1000}
                  required
                  placeholder="Расскажите о впечатлениях"
                />
                {reviewError && <p className="form-error" role="alert">{reviewError}</p>}
                <button className="review-submit" type="submit" disabled={reviewSending}>
                  {reviewSending ? 'Сохраняем…' : 'Оставить отзыв'}
                </button>
              </form>
            )}
            {!user && <p className="summary-note">Войдите, чтобы оставить отзыв.</p>}
            {user?.role === 'admin' && reviewError && <p className="form-error" role="alert">{reviewError}</p>}
          </div>
        )}
        {user?.role !== 'admin' && (
          <div className="product-actions">
            <button className="add-button" type="button" onClick={handleAddToCart} disabled={quantityLimitReached || adding}>
              {adding
                ? 'Добавляем…'
                : quantityLimitReached
                ? 'Максимум 10 услуг'
                : user
                  ? <><span aria-hidden="true">＋</span> Выбрать услугу</>
                  : 'Войти, чтобы выбрать'}
            </button>
            {cartError && <p className="form-error" role="alert">{cartError}</p>}
          </div>
        )}
      </div>
    </article>
  );
}
