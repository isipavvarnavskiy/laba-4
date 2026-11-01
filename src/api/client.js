const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export async function apiRequest(path, options = {}) {
  const token = localStorage.getItem('aura-salon-token');
  const headers = {
    Accept: 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    throw new Error('Не удалось связаться с сервером. Убедитесь, что приложение запущено командой npm run dev.');
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || `Ошибка запроса (${response.status}).`);
  }
  return payload;
}
