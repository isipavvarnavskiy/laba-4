import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../api/client.js';

const ServicesContext = createContext(null);

export function ServicesProvider({ children }) {
  const [services, setServices] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refreshCatalog = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [loadedServices, loadedCategories] = await Promise.all([
        apiRequest('/services'),
        apiRequest('/categories'),
      ]);
      if (!Array.isArray(loadedServices) || !Array.isArray(loadedCategories)) {
        throw new Error('Сервер вернул данные каталога в неверном формате.');
      }
      setServices(loadedServices);
      setCategories(loadedCategories);
    } catch (loadError) {
      setError(loadError.message || 'Не удалось загрузить каталог услуг.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshCatalog();
  }, [refreshCatalog]);

  const addCategory = useCallback(async (name) => {
    const category = await apiRequest('/categories', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    await refreshCatalog();
    return category;
  }, [refreshCatalog]);

  const deleteCategory = useCallback(async (categoryId, replacementCategoryId = '') => {
    const query = replacementCategoryId
      ? `?replacementCategoryId=${encodeURIComponent(replacementCategoryId)}`
      : '';
    const removed = await apiRequest(`/categories/${encodeURIComponent(categoryId)}${query}`, {
      method: 'DELETE',
    });
    await refreshCatalog();
    return removed;
  }, [refreshCatalog]);

  const updateCategory = useCallback(async (categoryId, name) => {
    const category = await apiRequest(`/categories/${encodeURIComponent(categoryId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
    await refreshCatalog();
    return category;
  }, [refreshCatalog]);

  const updateService = useCallback(async (serviceId, service) => {
    const updated = await apiRequest(`/services/${encodeURIComponent(serviceId)}`, {
      method: 'PATCH',
      body: JSON.stringify(service),
    });
    await refreshCatalog();
    return updated;
  }, [refreshCatalog]);

  const setServiceDiscount = useCallback(async (serviceId, discountPercent) => {
    const updated = await apiRequest(`/services/${encodeURIComponent(serviceId)}/discount`, {
      method: 'PATCH',
      body: JSON.stringify({ discountPercent: Number(discountPercent) }),
    });
    await refreshCatalog();
    return updated;
  }, [refreshCatalog]);

  const createPersonalCoupon = useCallback((email, discountPercent) => apiRequest('/coupons/personal', {
    method: 'POST',
    body: JSON.stringify({ email, discountPercent: Number(discountPercent) }),
  }), []);

  const value = useMemo(() => ({
    services,
    categories,
    loading,
    error,
    refreshCatalog,
    addCategory,
    deleteCategory,
    updateCategory,
    updateService,
    setServiceDiscount,
    createPersonalCoupon,
  }), [services, categories, loading, error, refreshCatalog, addCategory, deleteCategory, updateCategory, updateService, setServiceDiscount, createPersonalCoupon]);

  return <ServicesContext.Provider value={value}>{children}</ServicesContext.Provider>;
}

export function useServices() {
  const context = useContext(ServicesContext);
  if (!context) throw new Error('useServices must be used inside ServicesProvider');
  return context;
}
