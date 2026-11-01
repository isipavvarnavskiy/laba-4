import React from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import { apiRequest } from '../api/client.js';

const CartContext = createContext(null);
const LEGACY_STORAGE_KEY = 'aura-salon-cart';
const STORAGE_PREFIX = 'aura-salon-cart:user:';

function getStorageKey(user) {
  return user?.id && user.role !== 'admin' ? `${STORAGE_PREFIX}${user.id}` : null;
}

function cartReducer(state, action) {
  if (action.type === 'switch-owner') {
    return { ownerKey: action.ownerKey, items: action.items };
  }
  if (action.type === 'sync-server-cart') {
    if (action.ownerKey !== state.ownerKey) return state;
    return { ...state, items: action.items };
  }
  if (action.ownerKey !== state.ownerKey) return state;

  const { items } = state;
  switch (action.type) {
    case 'add': {
      const existingItem = items.find((item) => item.id === action.product.id);
      if (existingItem) {
        return {
          ...state,
          items: items.map((item) =>
            item.id === action.product.id
              ? { ...action.product, quantity: Math.min(10, item.quantity + 1) }
              : item,
          ),
        };
      }
      return { ...state, items: [...items, { ...action.product, quantity: 1 }] };
    }
    case 'remove':
      return { ...state, items: items.filter((item) => item.id !== action.id) };
    case 'change-quantity':
      return {
        ...state,
        items: items.flatMap((item) => {
          if (item.id !== action.id) return [item];
          const quantity = Math.min(10, Math.max(0, item.quantity + action.delta));
          return quantity > 0 ? [{ ...item, quantity }] : [];
        }),
      };
    case 'clear':
      return { ...state, items: [] };
    default:
      return state;
  }
}

function readSavedCart(storageKey) {
  if (!storageKey) return [];
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }) {
  const { user } = useAuth();
  const ownerKey = getStorageKey(user);
  const [loading, setLoading] = useState(Boolean(ownerKey));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [cart, dispatch] = useReducer(
    cartReducer,
    ownerKey,
    (key) => ({ ownerKey: key, items: readSavedCart(key) }),
  );

  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // Keep the active cart usable if browser storage is unavailable.
    }
    if (cart.ownerKey !== ownerKey) {
      dispatch({ type: 'switch-owner', ownerKey, items: readSavedCart(ownerKey) });
    }
  }, [cart.ownerKey, ownerKey]);

  useEffect(() => {
    let active = true;
    dispatch({ type: 'switch-owner', ownerKey, items: readSavedCart(ownerKey) });
    setError('');
    if (!ownerKey) {
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    apiRequest('/cart')
      .then((savedItems) => {
        if (!active) return;
        if (!Array.isArray(savedItems)) throw new Error('Сервер вернул корзину в неверном формате.');
        dispatch({ type: 'sync-server-cart', ownerKey, items: savedItems });
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || 'Не удалось загрузить корзину с сервера.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [ownerKey]);

  useEffect(() => {
    if (cart.ownerKey !== ownerKey) return;
    try {
      if (ownerKey) {
        localStorage.setItem(ownerKey, JSON.stringify(cart.items));
      } else if (cart.items.length > 0) {
        dispatch({ type: 'clear', ownerKey });
      }
    } catch {
      // The cart remains usable if browser storage is unavailable.
    }
  }, [cart.items, cart.ownerKey, ownerKey]);

  const items = cart.ownerKey === ownerKey ? cart.items : [];

  const requestCartChange = useCallback(async (path, options = {}) => {
    if (!ownerKey) throw new Error('Войдите в аккаунт, чтобы изменить корзину.');
    setSaving(true);
    setError('');
    try {
      const result = await apiRequest(path, options);
      const savedItems = Array.isArray(result) ? result : Array.isArray(result?.items) ? result.items : null;
      if (!savedItems) throw new Error('Сервер вернул корзину в неверном формате.');
      dispatch({ type: 'sync-server-cart', ownerKey, items: savedItems });
      return savedItems;
    } catch (requestError) {
      setError(requestError.message || 'Не удалось сохранить корзину.');
      throw requestError;
    } finally {
      setSaving(false);
    }
  }, [ownerKey]);

  const refreshCart = useCallback(async () => {
    if (!ownerKey) return [];
    setLoading(true);
    setError('');
    try {
      const savedItems = await apiRequest('/cart');
      if (!Array.isArray(savedItems)) throw new Error('Сервер вернул корзину в неверном формате.');
      dispatch({ type: 'sync-server-cart', ownerKey, items: savedItems });
      return savedItems;
    } catch (requestError) {
      setError(requestError.message || 'Не удалось загрузить корзину с сервера.');
      return null;
    } finally {
      setLoading(false);
    }
  }, [ownerKey]);

  const addItem = useCallback((product) => requestCartChange('/cart/items', {
      method: 'POST',
      body: JSON.stringify({ serviceId: product.id }),
    }), [requestCartChange]);
  const removeItem = useCallback((id) => requestCartChange(`/cart/items/${encodeURIComponent(id)}`, { method: 'DELETE' }), [requestCartChange]);
  const changeQuantity = useCallback((id, delta) => {
    const current = cart.items.find((item) => item.id === id);
    const quantity = Math.min(10, (current?.quantity || 1) + delta);
    if (quantity <= 0) {
      return requestCartChange(`/cart/items/${encodeURIComponent(id)}`, { method: 'DELETE' });
    }
    return requestCartChange(`/cart/items/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity }),
    });
  }, [cart.items, requestCartChange]);
  const clearCart = useCallback(async () => {
    await requestCartChange('/cart', { method: 'DELETE' });
    dispatch({ type: 'sync-server-cart', ownerKey, items: [] });
  }, [ownerKey, requestCartChange]);

  const itemCount = useMemo(
    () => items.reduce((count, item) => count + item.quantity, 0),
    [items],
  );
  const totalPrice = useMemo(
    () => items.reduce((sum, item) => {
      const unitPrice = Math.round(item.price * (100 - (item.discountPercent || 0)) / 100);
      return sum + unitPrice * item.quantity;
    }, 0),
    [items],
  );

  const value = useMemo(
    () => ({ items, itemCount, totalPrice, loading, saving, error, refreshCart, addItem, removeItem, changeQuantity, clearCart }),
    [items, itemCount, totalPrice, loading, saving, error, refreshCart, addItem, removeItem, changeQuantity, clearCart],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used inside CartProvider');
  }
  return context;
}
