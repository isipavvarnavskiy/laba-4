import React, { useEffect, useState } from 'react';
import ServiceCard from '../components/ServiceCard.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useServices } from '../contexts/ServicesContext.jsx';
import { formatServiceCount } from '../utils/formatPrice.js';

export default function CatalogPage() {
  const { user } = useAuth();
  const { services, categories, loading, error, refreshCatalog } = useServices();
  const [selectedCategories, setSelectedCategories] = useState([]);
  useEffect(() => {
    const availableCategoryNames = new Set(categories.map((category) => category.name));
    setSelectedCategories((current) => current.filter((name) => availableCategoryNames.has(name)));
  }, [categories]);
  const visibleServices = selectedCategories.length
    ? services.filter((service) => selectedCategories.includes(service.categoryName))
    : services;

  function toggleCategory(categoryName) {
    setSelectedCategories((current) => current.includes(categoryName)
      ? current.filter((name) => name !== categoryName)
      : [...current, categoryName]);
  }

  return (
    <section className="catalog-page" aria-labelledby="catalog-title">
      <div className="page-intro">
        <div>
          <p className="eyebrow"><span /> САЛОН AURA</p>
          <h1 id="catalog-title">Услуги для вас</h1>
          <p className="intro-copy">
            {user?.role === 'admin'
              ? 'Просматривайте каталог услуг и управляйте категориями в панели администратора.'
              : 'Выберите услугу и удобное время — запись можно оформить через корзину.'}
          </p>
        </div>
        <p className="catalog-note">
          {formatServiceCount(services.length)}
          <br />
          в каталоге салона
        </p>
      </div>

      <div className="catalog-layout">
        <aside className="category-aside" aria-labelledby="category-title">
          <div className="category-aside-heading">
            <h2 id="category-title">Категории</h2>
            {selectedCategories.length > 0 && (
              <button className="reset-filters" type="button" onClick={() => setSelectedCategories([])}>
                Сбросить
              </button>
            )}
          </div>
          <div className="category-options">
            {categories.map((category) => (
              <label className="category-option" key={category.id}>
                <input
                  type="checkbox"
                  checked={selectedCategories.includes(category.name)}
                  onChange={() => toggleCategory(category.name)}
                />
                <span>{category.name}</span>
                <small>{category.serviceCount ?? 0}</small>
              </label>
            ))}
          </div>
          <p className="category-hint">Отметьте одну или несколько категорий.</p>
        </aside>

        <div className="catalog-results">
          {loading && <p className="state-message" role="status">Загружаются услуги…</p>}
          {!loading && error && (
            <div className="error-state" role="alert">
              <h2>Не удалось загрузить каталог</h2>
              <p>{error}</p>
              <button className="add-button" type="button" onClick={refreshCatalog}>Повторить запрос</button>
            </div>
          )}
          {!loading && !error && visibleServices.length > 0 && (
            <div className="product-grid">
              {visibleServices.map((service) => <ServiceCard key={service.id} service={service} />)}
            </div>
          )}
          {!loading && !error && visibleServices.length === 0 && (
            <div className="empty-state compact-empty">
              <h2>{services.length ? 'В этих категориях пока нет услуг' : 'Каталог пока пуст'}</h2>
              <p>Выберите другие категории или загляните позже.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
