import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { apiRequest } from '../api/client.js';

const AuthContext = createContext(null);

function readSavedUser() {
  try {
    return JSON.parse(localStorage.getItem('aura-salon-user') || 'null');
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readSavedUser);

  const login = useCallback(async (email, password) => {
    const result = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    localStorage.setItem('aura-salon-token', result.token);
    localStorage.setItem('aura-salon-user', JSON.stringify(result.user));
    setUser(result.user);
    return result.user;
  }, []);

  const register = useCallback(async ({ name, email, password, phone }) => {
    const result = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, phone }),
    });
    localStorage.setItem('aura-salon-token', result.token);
    localStorage.setItem('aura-salon-user', JSON.stringify(result.user));
    setUser(result.user);
    return result.user;
  }, []);

  const updateAccount = useCallback(async (account) => {
    const result = await apiRequest('/account', {
      method: 'PATCH',
      body: JSON.stringify(account),
    });
    localStorage.setItem('aura-salon-user', JSON.stringify(result.user));
    setUser(result.user);
    return result.user;
  }, []);

  const changePassword = useCallback((currentPassword, newPassword) => apiRequest('/account/password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  }), []);

  const logout = useCallback(() => {
    if (localStorage.getItem('aura-salon-token')) {
      apiRequest('/auth/logout', { method: 'POST' }).catch(() => {});
    }
    localStorage.removeItem('aura-salon-token');
    localStorage.removeItem('aura-salon-user');
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, login, register, updateAccount, changePassword, logout }),
    [user, login, register, updateAccount, changePassword, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
