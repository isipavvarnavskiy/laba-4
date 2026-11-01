import 'dotenv/config';
import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { getAddressError, getEmailError, getPasswordError, getPersonNameError, isValidEmail, normalizeAddress, normalizeEmail, normalizePersonName, normalizeRussianPhone } from '../shared/validation.js';

const sessions = new Map();
let pool;
const serviceAppearance = {
  'women-haircut': { tone: 'clay' },
  'men-haircut': { tone: 'sage' },
  styling: { tone: 'rose' },
  coloring: { tone: 'blue' },
  toning: { tone: 'sand' },
  'hair-care': { tone: 'olive' },
  manicure: { tone: 'rose' },
  'nail-care': { tone: 'clay' },
};

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function getPool() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new ApiError(503, 'Не задан DATABASE_URL. Скопируйте .env.example в .env и укажите пароль PostgreSQL.');
  }
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      max: 10,
    });
    pool.on('error', (error) => console.error('Ошибка соединения с PostgreSQL:', error.message));
  }
  return pool;
}

function send(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  });
  response.end(JSON.stringify(payload));
}

async function readBody(request) {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new ApiError(413, 'Размер запроса превышает допустимый предел.');
  }
  if (!raw) return {};
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new ApiError(400, 'Переданы некорректные данные.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'Ожидается объект с данными формы.');
  }
  return body;
}

function getSession(request) {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
  return token ? sessions.get(token) : null;
}

function getSessionToken(request) {
  return request.headers.authorization?.replace(/^Bearer\s+/i, '') || null;
}

function requireUser(request) {
  const token = getSessionToken(request);
  const user = token ? sessions.get(token) : null;
  if (!user) throw new ApiError(401, 'Войдите в аккаунт, чтобы выполнить это действие.');
  if (user.isActive === false) {
    sessions.delete(token);
    throw new ApiError(401, 'Этот аккаунт отключён. Обратитесь к администратору.');
  }
  return user;
}

function requireAdmin(request) {
  const user = requireUser(request);
  if (user.role !== 'admin') throw new ApiError(403, 'Это действие доступно только администратору.');
  return user;
}

function publicUser(row) {
  return {
    id: String(row.id),
    name: row.name,
    email: row.email,
    role: row.role,
    roleTitle: row.role_title,
    phone: row.phone || '',
    defaultAddress: row.default_address || '',
    isActive: row.is_active !== false,
    discountCoupon: row.coupon_code
      ? { code: row.coupon_code, discountPercent: Number(row.coupon_discount_percent) }
      : null,
  };
}

function publicService(row) {
  const appearance = serviceAppearance[row.id] || { tone: 'clay' };
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    duration: Number(row.duration_minutes),
    price: Number(row.price),
    categoryId: row.category_id,
    categoryName: row.category_name,
    discountPercent: Number(row.discount_percent),
    tone: appearance.tone,
    label: Number(row.discount_percent) ? '−' + row.discount_percent + '%' : '',
  };
}

function apiErrorStatus(error) {
  if (error instanceof ApiError) return error.status;
  if (error instanceof SyntaxError) return 400;
  if (['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', '28P01', '3D000', '3F000'].includes(error.code)) return 503;
  if (error.code === '23505') return 409;
  if (['23503', '23514', '22P02'].includes(error.code)) return 400;
  return 500;
}

function apiErrorMessage(error, status) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof SyntaxError) return 'Переданы некорректные данные.';
  if (error.code === '28P01') return 'PostgreSQL отклонил пароль. Укажите настоящий пароль пользователя postgres в DATABASE_URL файла .env.';
  if (error.code === '3D000') return 'База данных из DATABASE_URL не найдена. Создайте её в PostgreSQL или исправьте имя в .env.';
  if (error.code === '3F000') return 'Схема базы данных не найдена. Выполните server/schema.sql в выбранной базе.';
  if (status === 503) return 'Не удалось подключиться к PostgreSQL. Проверьте .env и убедитесь, что сервер PostgreSQL запущен.';
  if (error.code === '23505') return 'Запись с такими данными уже существует.';
  if (error.code === '23503') return 'Связанные данные не найдены или используются другими записями.';
  if (error.code === '23514' || error.code === '22P02') return 'Проверьте значения полей запроса.';
  return 'Внутренняя ошибка API.';
}

async function getServices(db) {
  const result = await db.query(
    'SELECT s.id, s.name, s.description, s.duration_minutes, s.price, s.category_id, c.name AS category_name, s.discount_percent FROM services s JOIN categories c ON c.id = s.category_id WHERE s.is_active = TRUE ORDER BY c.name, s.name',
  );
  return result.rows.map(publicService);
}

async function getAppointments(db, user) {
  const result = await db.query(
    "SELECT a.id::text AS id, a.user_id::text AS user_id, u.name AS user_name, u.email AS user_email, a.scheduled_at, a.status, a.total_amount, a.created_at, COALESCE((SELECT p.status FROM payments p WHERE p.appointment_id = a.id ORDER BY p.created_at DESC LIMIT 1), 'Ожидает оплаты') AS payment_status FROM appointments a JOIN users u ON u.id = a.user_id WHERE ($1::boolean OR a.user_id = $2::bigint) ORDER BY a.scheduled_at DESC",
    [user.role === 'admin', user.id],
  );
  if (result.rows.length === 0) return [];

  const ids = result.rows.map((appointment) => appointment.id);
  const itemResult = await db.query(
    'SELECT aps.appointment_id::text AS appointment_id, aps.service_id, COALESCE(s.name, aps.service_id) AS service_name, aps.quantity, aps.unit_price, aps.discount_percent FROM appointment_services aps LEFT JOIN services s ON s.id = aps.service_id WHERE aps.appointment_id = ANY($1::uuid[]) ORDER BY aps.appointment_id, s.name',
    [ids],
  );
  const itemsByAppointment = new Map(ids.map((id) => [id, []]));
  for (const row of itemResult.rows) {
    itemsByAppointment.get(row.appointment_id)?.push({
      serviceId: row.service_id,
      serviceName: row.service_name,
      quantity: Number(row.quantity),
      unitPrice: Number(row.unit_price),
      discountPercent: Number(row.discount_percent),
    });
  }

  return result.rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    userEmail: row.user_email,
    items: itemsByAppointment.get(row.id) || [],
    scheduledAt: row.scheduled_at,
    total: Number(row.total_amount),
    status: row.status,
    createdAt: row.created_at,
    paymentStatus: row.payment_status,
  }));
}

// Read the signed-in user's basket with service and category details from PostgreSQL joins.
async function getCart(db, user) {
  const result = await db.query(
    'SELECT s.id, s.name, s.description, s.duration_minutes, s.price, s.category_id, c.name AS category_name, s.discount_percent, ci.quantity FROM carts ca JOIN users u ON u.id = ca.user_id JOIN cart_items ci ON ci.cart_id = ca.id JOIN services s ON s.id = ci.service_id JOIN categories c ON c.id = s.category_id WHERE u.id = $1 AND s.is_active = TRUE ORDER BY s.name',
    [user.id],
  );
  return result.rows.map((row) => ({ ...publicService(row), quantity: Number(row.quantity) }));
}

// Return past delivery orders with their owners and service names resolved by JOINs.
async function getOrders(db, user) {
  const result = await db.query(
    'SELECT o.id::text AS id, o.user_id::text AS user_id, u.name AS user_name, u.email AS user_email, o.delivery_address, o.delivery_date::text AS delivery_date, o.status, o.total_amount, o.created_at FROM orders o JOIN users u ON u.id = o.user_id WHERE ($1::boolean OR o.user_id = $2::bigint) ORDER BY o.created_at DESC',
    [user.role === 'admin', user.id],
  );
  if (!result.rowCount) return [];

  const orderIds = result.rows.map((order) => order.id);
  const itemResult = await db.query(
    'SELECT oi.order_id::text AS order_id, s.name AS service_name, oi.quantity, oi.unit_price, oi.discount_percent FROM order_items oi JOIN services s ON s.id = oi.service_id WHERE oi.order_id = ANY($1::uuid[]) ORDER BY oi.order_id, s.name',
    [orderIds],
  );
  const itemsByOrder = new Map(orderIds.map((id) => [id, []]));
  for (const item of itemResult.rows) {
    itemsByOrder.get(item.order_id)?.push({
      serviceName: item.service_name,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price),
      discountPercent: Number(item.discount_percent),
    });
  }
  return result.rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    userEmail: row.user_email,
    deliveryAddress: row.delivery_address,
    deliveryDate: row.delivery_date,
    status: row.status,
    total: Number(row.total_amount),
    createdAt: row.created_at,
    items: itemsByOrder.get(row.id) || [],
  }));
}

// Load reviews together with reviewer and service names; clients never need a second lookup.
async function getServiceReviews(db, serviceId) {
  const result = await db.query(
    'SELECT r.id::text AS id, r.rating, r.comment, r.created_at, r.updated_at, u.name AS user_name, s.name AS service_name FROM service_reviews r JOIN users u ON u.id = r.user_id JOIN services s ON s.id = r.service_id WHERE r.service_id = $1 AND s.is_active = TRUE ORDER BY r.created_at DESC',
    [serviceId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    rating: Number(row.rating),
    comment: row.comment,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    userName: row.user_name,
    serviceName: row.service_name,
  }));
}

function validatePhone(value) {
  const phone = normalizeRussianPhone(value);
  if (!phone) throw new ApiError(400, 'Введите российский номер в формате +7(900)123-45-67.');
  return phone;
}

function validatePersonName(value, label = 'ФИО') {
  const name = normalizePersonName(value);
  const error = getPersonNameError(name, label);
  if (error) throw new ApiError(400, error);
  return name;
}

function validateEmail(value) {
  const email = normalizeEmail(value);
  if (!isValidEmail(email)) throw new ApiError(400, getEmailError(email));
  return email;
}

function validatePassword(value, label = 'Пароль') {
  const password = typeof value === 'string' ? value : '';
  const error = getPasswordError(password);
  if (error) throw new ApiError(400, error.replace(/^Пароль/u, label));
  return password;
}

function validateAddress(value, label = 'Адрес', optional = false) {
  const address = normalizeAddress(value);
  if (optional && !address) return '';
  const error = getAddressError(address, label);
  if (error) throw new ApiError(400, error);
  return address;
}

function validateComment(value, label = 'Отзыв') {
  const comment = String(value ?? '').normalize('NFKC').replace(/\r\n?/g, '\n').trim();
  if (comment.length < 2 || comment.length > 1000) {
    throw new ApiError(400, `${label} должен содержать от 2 до 1000 символов.`);
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(comment)) {
    throw new ApiError(400, `${label} содержит недопустимые управляющие символы.`);
  }
  return comment;
}

function generateTemporaryPassword() {
  const groups = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!#$%&*+-=?@'];
  const alphabet = groups.join('');
  const bytes = randomBytes(16);
  const characters = groups.map((group, index) => group[bytes[index] % group.length]);
  while (characters.length < 14) characters.push(alphabet[bytes[characters.length] % alphabet.length]);
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const randomIndex = randomBytes(4).readUInt32BE(0) % (index + 1);
    [characters[index], characters[randomIndex]] = [characters[randomIndex], characters[index]];
  }
  return characters.join('');
}

// Create a delivery order from the server-side cart in one transaction.
async function createOrder(db, user, body) {
  const deliveryAddress = validateAddress(body.deliveryAddress, 'Адрес доставки');
  const deliveryDate = String(body.deliveryDate || '').trim();
  const parsedDate = new Date(`${deliveryDate}T00:00:00Z`);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)
    || !Number.isFinite(parsedDate.getTime())
    || parsedDate.toISOString().slice(0, 10) !== deliveryDate
    || deliveryDate < today) {
    throw new ApiError(400, 'Дата доставки не может быть раньше сегодняшнего дня.');
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const cartResult = await client.query(
      'SELECT id FROM carts WHERE user_id = $1 FOR UPDATE',
      [user.id],
    );
    const cartId = cartResult.rows[0]?.id;
    if (!cartId) throw new ApiError(400, 'Корзина пуста. Добавьте услуги перед оформлением заказа.');

    const itemsResult = await client.query(
      'SELECT s.id AS service_id, s.name AS service_name, s.price, s.discount_percent, ci.quantity FROM cart_items ci JOIN services s ON s.id = ci.service_id JOIN categories c ON c.id = s.category_id WHERE ci.cart_id = $1 AND s.is_active = TRUE ORDER BY s.name',
      [cartId],
    );
    if (!itemsResult.rowCount) throw new ApiError(400, 'Корзина пуста или выбранные услуги больше недоступны.');
    const userResult = await client.query(
      'SELECT coupon_discount_percent FROM users WHERE id = $1',
      [user.id],
    );
    const couponPercent = Number(userResult.rows[0]?.coupon_discount_percent || 0);
    const items = itemsResult.rows.map((item) => {
      const discountPercent = Math.max(Number(item.discount_percent), couponPercent);
      return {
        serviceId: item.service_id,
        serviceName: item.service_name,
        quantity: Number(item.quantity),
        discountPercent,
        unitPrice: Math.round(Number(item.price) * (100 - discountPercent) / 100),
      };
    });
    const total = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const orderResult = await client.query(
      "INSERT INTO orders (user_id, delivery_address, delivery_date, status, total_amount) VALUES ($1, $2, $3::date, 'Новый', $4) RETURNING id::text AS id, delivery_address, delivery_date::text AS delivery_date, status, total_amount, created_at",
      [user.id, deliveryAddress, deliveryDate, total],
    );
    const order = orderResult.rows[0];
    for (const item of items) {
      await client.query(
        'INSERT INTO order_items (order_id, service_id, quantity, unit_price, discount_percent) VALUES ($1, $2, $3, $4, $5)',
        [order.id, item.serviceId, item.quantity, item.unitPrice, item.discountPercent],
      );
    }
    await client.query('DELETE FROM cart_items WHERE cart_id = $1', [cartId]);
    await client.query('UPDATE carts SET updated_at = NOW() WHERE id = $1', [cartId]);
    await client.query('UPDATE users SET default_address = $1 WHERE id = $2', [deliveryAddress, user.id]);
    await client.query('COMMIT');
    return {
      id: order.id,
      deliveryAddress: order.delivery_address,
      deliveryDate: order.delivery_date,
      status: order.status,
      total: Number(order.total_amount),
      createdAt: order.created_at,
      items,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function createAppointment(db, user, body) {
  const scheduledAt = new Date(body.scheduledAt);
  if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt <= new Date()) {
    throw new ApiError(400, 'Выберите дату и время в будущем.');
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new ApiError(400, 'Добавьте услуги в корзину перед записью.');
  }

  const requestedItems = new Map();
  for (const item of body.items) {
    if (typeof item?.serviceId !== 'string' || !item.serviceId
      || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10) {
      throw new ApiError(400, 'В корзине должны быть услуги с количеством от 1 до 10.');
    }
    requestedItems.set(item.serviceId, (requestedItems.get(item.serviceId) || 0) + item.quantity);
  }
  if ([...requestedItems.values()].some((quantity) => quantity > 10)) {
    throw new ApiError(400, 'Количество каждой услуги не может превышать 10.');
  }

  const servicesResult = await db.query(
    'SELECT id, name, price, discount_percent FROM services WHERE id = ANY($1::varchar[]) AND is_active = TRUE',
    [[...requestedItems.keys()]],
  );
  const servicesById = new Map(servicesResult.rows.map((service) => [service.id, service]));
  if (servicesById.size !== requestedItems.size) {
    throw new ApiError(400, 'Одна из выбранных услуг больше недоступна. Обновите каталог.');
  }

  const couponPercent = Number(user.discountCoupon?.discountPercent || 0);
  const items = [...requestedItems].map(([serviceId, quantity]) => {
    const service = servicesById.get(serviceId);
    const discountPercent = Math.max(Number(service.discount_percent), couponPercent);
    const unitPrice = Math.round(Number(service.price) * (100 - discountPercent) / 100);
    return { serviceId, serviceName: service.name, quantity, unitPrice, discountPercent };
  });
  const total = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const appointmentResult = await client.query(
      "INSERT INTO appointments (user_id, scheduled_at, status, total_amount) VALUES ($1, $2, 'Новая', $3) RETURNING id::text AS id, user_id::text AS user_id, scheduled_at, status, total_amount, created_at",
      [user.id, scheduledAt.toISOString(), total],
    );
    const appointment = appointmentResult.rows[0];
    for (const item of items) {
      await client.query(
        'INSERT INTO appointment_services (appointment_id, service_id, quantity, unit_price, discount_percent) VALUES ($1, $2, $3, $4, $5)',
        [appointment.id, item.serviceId, item.quantity, item.unitPrice, item.discountPercent],
      );
    }
    const paymentResult = await client.query(
      "INSERT INTO payments (appointment_id, amount, method, status) VALUES ($1, $2, 'Оплата в салоне', 'Ожидает оплаты') RETURNING id::text AS id, appointment_id::text AS appointment_id, amount, method, status, created_at",
      [appointment.id, total],
    );
    await client.query('COMMIT');
    return {
      appointment: {
        id: appointment.id,
        userId: appointment.user_id,
        items,
        scheduledAt: appointment.scheduled_at,
        total: Number(appointment.total_amount),
        status: appointment.status,
        createdAt: appointment.created_at,
      },
      payment: {
        id: paymentResult.rows[0].id,
        appointmentId: paymentResult.rows[0].appointment_id,
        amount: Number(paymentResult.rows[0].amount),
        method: paymentResult.rows[0].method,
        status: paymentResult.rows[0].status,
        createdAt: paymentResult.rows[0].created_at,
      },
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function categoryIdFromName(name) {
  return name.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 50) || 'category';
}

function parseNumericField(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : Number.NaN;
  if (typeof value !== 'string' || !value.trim() || !/^-?\d+(?:\.\d+)?$/.test(value.trim())) return Number.NaN;
  return Number(value);
}

// Validate service forms once for both administrator create and edit requests.
async function parseServiceInput(db, body) {
  const name = String(body.name || '').trim();
  const description = String(body.description || '').trim();
  const durationValue = body.duration;
  const priceValue = body.price;
  const duration = parseNumericField(durationValue);
  const price = parseNumericField(priceValue);
  const discountPercent = parseNumericField(body.discountPercent ?? 0);
  const categoryId = String(body.categoryId || '').trim();
  if (name.length < 2 || name.length > 160) throw new ApiError(400, 'Название услуги должно содержать от 2 до 160 символов.');
  if (description.length < 2 || description.length > 2000) throw new ApiError(400, 'Описание услуги должно содержать от 2 до 2000 символов.');
  if (!Number.isInteger(duration) || duration < 5 || duration > 600) throw new ApiError(400, 'Длительность должна быть целым числом от 5 до 600 минут.');
  if (!Number.isFinite(price) || price < 0 || price > 10000000 || Math.round(price * 100) !== price * 100) throw new ApiError(400, 'Укажите корректную цену (до 10 000 000 ₽, не более двух знаков после запятой).');
  if (!Number.isInteger(discountPercent) || discountPercent < 0 || discountPercent > 70) throw new ApiError(400, 'Скидка должна быть целым числом от 0 до 70.');
  if (!categoryId) throw new ApiError(400, 'Выберите категорию услуги.');
  const category = await db.query('SELECT id FROM categories WHERE id = $1', [categoryId]);
  if (!category.rowCount) throw new ApiError(400, 'Выбранная категория не найдена.');
  return { name, description, duration, price, discountPercent, categoryId };
}

export function createApiServer() {
  const server = createServer(async (request, response) => {
    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      });
      response.end();
      return;
    }

    const url = new URL(request.url || '/', 'http://localhost');
    const pathname = url.pathname.replace(/\/$/, '') || '/';

    try {
      const db = getPool();
      if (request.method === 'GET' && pathname === '/api/health') {
        await db.query('SELECT 1');
        send(response, 200, { status: 'ok', database: 'postgresql' });
        return;
      }
      if (request.method === 'GET' && pathname === '/api/services') {
        send(response, 200, await getServices(db));
        return;
      }
      if (request.method === 'GET' && pathname === '/api/categories') {
        const result = await db.query(
          'SELECT c.id, c.name, COUNT(s.id)::int AS service_count FROM categories c LEFT JOIN services s ON s.category_id = c.id AND s.is_active = TRUE GROUP BY c.id, c.name ORDER BY c.name',
        );
        send(response, 200, result.rows.map((row) => ({ id: row.id, name: row.name, serviceCount: Number(row.service_count) })));
        return;
      }
      if (request.method === 'POST' && pathname === '/api/services') {
        requireAdmin(request);
        const service = await parseServiceInput(db, await readBody(request));
        const baseId = `custom-${categoryIdFromName(service.name)}`.slice(0, 55);
        let id = baseId;
        let suffix = 2;
        while ((await db.query('SELECT 1 FROM services WHERE id = $1', [id])).rowCount) {
          id = `${baseId.slice(0, 55 - String(suffix).length - 1)}-${suffix++}`;
        }
        const result = await db.query(
          'INSERT INTO services (id, name, description, duration_minutes, price, category_id, discount_percent) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name',
          [id, service.name, service.description, service.duration, service.price, service.categoryId, service.discountPercent],
        );
        send(response, 201, result.rows[0]);
        return;
      }
      if (request.method === 'POST' && pathname === '/api/auth/login') {
        const body = await readBody(request);
        const email = validateEmail(body.email);
        const password = String(body.password || '');
        if (!password || password.length > 128) throw new ApiError(400, 'Введите пароль длиной не более 128 символов.');
        const result = await db.query(
          'SELECT u.id, u.name, u.email, u.phone, u.default_address, u.coupon_code, u.coupon_discount_percent, r.name AS role, r.title AS role_title, (u.password_hash = crypt($2, u.password_hash)) AS password_valid FROM users u JOIN roles r ON r.id = u.role_id WHERE lower(u.email) = $1 AND u.is_active = TRUE LIMIT 1',
          [email, password],
        );
        const row = result.rows[0];
        if (!row || !row.password_valid) throw new ApiError(401, 'Проверьте email и пароль.');
        const token = randomUUID();
        const user = publicUser(row);
        sessions.set(token, user);
        send(response, 200, { token, user });
        return;
      }
      if (request.method === 'POST' && pathname === '/api/auth/register') {
        const body = await readBody(request);
        const name = validatePersonName(body.name, 'Полное имя');
        const email = validateEmail(body.email);
        const password = validatePassword(body.password);
        const phone = validatePhone(body.phone);

        const duplicate = await db.query('SELECT 1 FROM users WHERE lower(email) = $1 LIMIT 1', [email]);
        if (duplicate.rowCount) throw new ApiError(409, 'Пользователь с таким email уже зарегистрирован.');

        const roleResult = await db.query("SELECT id, title FROM roles WHERE name = 'client' LIMIT 1");
        const clientRole = roleResult.rows[0];
        if (!clientRole) throw new ApiError(503, 'В базе данных не настроена роль клиента. Выполните server/schema.sql.');

        let result;
        try {
          result = await db.query(
            'INSERT INTO users (name, email, password_hash, role_id, phone) VALUES ($1, $2, crypt($3, gen_salt(\'sha512crypt\')), $4, $5) RETURNING id, name, email, phone, default_address, coupon_code, coupon_discount_percent',
            [name, email, password, clientRole.id, phone],
          );
        } catch (error) {
          if (error.code === '23505') throw new ApiError(409, 'Пользователь с таким email уже зарегистрирован.');
          throw error;
        }

        const token = randomUUID();
        const user = publicUser({ ...result.rows[0], role: 'client', role_title: clientRole.title });
        sessions.set(token, user);
        send(response, 201, { token, user });
        return;
      }
      if (request.method === 'POST' && pathname === '/api/auth/logout') {
        const token = getSessionToken(request);
        if (token) sessions.delete(token);
        send(response, 200, { loggedOut: true });
        return;
      }
      if (request.method === 'GET' && pathname === '/api/appointments') {
        send(response, 200, await getAppointments(db, requireUser(request)));
        return;
      }
      if (request.method === 'POST' && pathname === '/api/appointments') {
        const user = requireUser(request);
        send(response, 201, await createAppointment(db, user, await readBody(request)));
        return;
      }
      const appointmentMatch = pathname.match(/^\/api\/appointments\/([^/]+)(?:\/(cancel))?$/);
      if (appointmentMatch && request.method === 'PATCH' && !appointmentMatch[2]) {
        requireAdmin(request);
        const appointmentId = decodeURIComponent(appointmentMatch[1]);
        const status = String((await readBody(request)).status || '');
        if (!['Новая', 'Подтверждена', 'Выполнена', 'Отменена'].includes(status)) {
          throw new ApiError(400, 'Выберите допустимый статус записи.');
        }
        const updated = await db.query(
          'UPDATE appointments SET status = $1 WHERE id = $2::uuid RETURNING id::text AS id, status',
          [status, appointmentId],
        );
        if (!updated.rowCount) throw new ApiError(404, 'Запись не найдена.');
        if (status === 'Отменена') {
          await db.query("UPDATE payments SET status = 'Отменён' WHERE appointment_id = $1::uuid AND status <> 'Оплачен'", [appointmentId]);
        }
        send(response, 200, updated.rows[0]);
        return;
      }
      if (appointmentMatch && request.method === 'DELETE' && !appointmentMatch[2]) {
        requireAdmin(request);
        let appointmentId;
        try {
          appointmentId = decodeURIComponent(appointmentMatch[1]);
        } catch {
          throw new ApiError(400, 'Передан некорректный идентификатор записи.');
        }
        const client = await db.connect();
        try {
          await client.query('BEGIN');
          const appointmentResult = await client.query(
            'SELECT id FROM appointments WHERE id = $1::uuid FOR UPDATE',
            [appointmentId],
          );
          if (!appointmentResult.rowCount) throw new ApiError(404, 'Запись не найдена.');
          await client.query('DELETE FROM payments WHERE appointment_id = $1::uuid', [appointmentId]);
          await client.query('DELETE FROM appointments WHERE id = $1::uuid', [appointmentId]);
          await client.query('COMMIT');
          send(response, 200, { id: appointmentId, deleted: true });
        } catch (error) {
          await client.query('ROLLBACK').catch(() => {});
          throw error;
        } finally {
          client.release();
        }
        return;
      }
      if (appointmentMatch && request.method === 'POST' && appointmentMatch[2] === 'cancel') {
        const user = requireUser(request);
        let appointmentId;
        try {
          appointmentId = decodeURIComponent(appointmentMatch[1]);
        } catch {
          throw new ApiError(400, 'Передан некорректный идентификатор записи.');
        }
        const client = await db.connect();
        try {
          await client.query('BEGIN');
          const appointmentResult = await client.query(
            'SELECT id::text AS id, user_id::text AS user_id, status FROM appointments WHERE id = $1::uuid FOR UPDATE',
            [appointmentId],
          );
          const appointment = appointmentResult.rows[0];
          if (!appointment) throw new ApiError(404, 'Запись не найдена.');
          if (appointment.user_id !== String(user.id)) {
            throw new ApiError(403, 'Можно отменить только собственную запись.');
          }
          if (appointment.status === 'Отменена') {
            throw new ApiError(409, 'Эта запись уже отменена.');
          }
          await client.query("UPDATE appointments SET status = 'Отменена' WHERE id = $1::uuid", [appointmentId]);
          await client.query("UPDATE payments SET status = 'Отменён' WHERE appointment_id = $1::uuid AND status <> 'Оплачен'", [appointmentId]);
          await client.query('COMMIT');
          send(response, 200, { id: appointmentId, status: 'Отменена' });
        } catch (error) {
          await client.query('ROLLBACK').catch(() => {});
          throw error;
        } finally {
          client.release();
        }
        return;
      }
      // Cart data is stored per user; signing out never deletes these rows.
      if (request.method === 'GET' && pathname === '/api/cart') {
        send(response, 200, await getCart(db, requireUser(request)));
        return;
      }
      if (request.method === 'DELETE' && pathname === '/api/cart') {
        const user = requireUser(request);
        await db.query('DELETE FROM cart_items ci USING carts ca WHERE ci.cart_id = ca.id AND ca.user_id = $1', [user.id]);
        await db.query('UPDATE carts SET updated_at = NOW() WHERE user_id = $1', [user.id]);
        send(response, 200, { items: [] });
        return;
      }
      if (request.method === 'POST' && pathname === '/api/cart/items') {
        const user = requireUser(request);
        const serviceId = String((await readBody(request)).serviceId || '').trim();
        const serviceResult = await db.query(
          'SELECT s.id FROM services s JOIN categories c ON c.id = s.category_id WHERE s.id = $1 AND s.is_active = TRUE',
          [serviceId],
        );
        if (!serviceResult.rowCount) throw new ApiError(404, 'Услуга не найдена или больше недоступна.');
        const client = await db.connect();
        try {
          await client.query('BEGIN');
          const cartResult = await client.query(
            'INSERT INTO carts (user_id) VALUES ($1) ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW() RETURNING id',
            [user.id],
          );
          const itemResult = await client.query(
            'INSERT INTO cart_items (cart_id, service_id, quantity) VALUES ($1, $2, 1) ON CONFLICT (cart_id, service_id) DO UPDATE SET quantity = cart_items.quantity + 1 WHERE cart_items.quantity < 10 RETURNING quantity',
            [cartResult.rows[0].id, serviceId],
          );
          if (!itemResult.rowCount) throw new ApiError(409, 'В корзине уже максимально допустимое количество этой услуги (10).');
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK').catch(() => {});
          throw error;
        } finally {
          client.release();
        }
        send(response, 200, await getCart(db, user));
        return;
      }
      const cartItemMatch = pathname.match(/^\/api\/cart\/items\/([^/]+)$/);
      if (cartItemMatch && (request.method === 'PATCH' || request.method === 'DELETE')) {
        const user = requireUser(request);
        const serviceId = decodeURIComponent(cartItemMatch[1]);
        const cartResult = await db.query('SELECT id FROM carts WHERE user_id = $1', [user.id]);
        const cartId = cartResult.rows[0]?.id;
        if (!cartId) throw new ApiError(404, 'Корзина не найдена.');
        if (request.method === 'DELETE') {
          const removed = await db.query('DELETE FROM cart_items WHERE cart_id = $1 AND service_id = $2 RETURNING service_id', [cartId, serviceId]);
          if (!removed.rowCount) throw new ApiError(404, 'Этой услуги нет в корзине.');
        } else {
          const quantity = parseNumericField((await readBody(request)).quantity);
          if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
            throw new ApiError(400, 'Количество услуги должно быть целым числом от 1 до 10.');
          }
          const updated = await db.query('UPDATE cart_items SET quantity = $1 WHERE cart_id = $2 AND service_id = $3 RETURNING quantity', [quantity, cartId, serviceId]);
          if (!updated.rowCount) throw new ApiError(404, 'Этой услуги нет в корзине.');
        }
        await db.query('UPDATE carts SET updated_at = NOW() WHERE id = $1', [cartId]);
        send(response, 200, await getCart(db, user));
        return;
      }
      if (request.method === 'GET' && pathname === '/api/orders') {
        send(response, 200, await getOrders(db, requireUser(request)));
        return;
      }
      if (request.method === 'POST' && pathname === '/api/orders') {
        send(response, 201, await createOrder(db, requireUser(request), await readBody(request)));
        return;
      }
      const orderMatch = pathname.match(/^\/api\/orders\/([^/]+)$/);
      if (orderMatch && (request.method === 'DELETE' || request.method === 'PATCH')) {
        requireAdmin(request);
        const orderId = decodeURIComponent(orderMatch[1]);
        if (request.method === 'DELETE') {
          const deleted = await db.query('DELETE FROM orders WHERE id = $1::uuid RETURNING id::text AS id', [orderId]);
          if (!deleted.rowCount) throw new ApiError(404, 'Заказ не найден.');
          send(response, 200, { id: deleted.rows[0].id, deleted: true });
        } else {
          const status = String((await readBody(request)).status || '');
          if (!['Новый', 'Подтверждён', 'Выполнен', 'Отменён'].includes(status)) {
            throw new ApiError(400, 'Выберите допустимый статус заказа.');
          }
          const updated = await db.query('UPDATE orders SET status = $1 WHERE id = $2::uuid RETURNING id::text AS id, status', [status, orderId]);
          if (!updated.rowCount) throw new ApiError(404, 'Заказ не найден.');
          send(response, 200, updated.rows[0]);
        }
        return;
      }
      const serviceReviewsMatch = pathname.match(/^\/api\/services\/([^/]+)\/reviews$/);
      if (serviceReviewsMatch && request.method === 'GET') {
        const serviceId = decodeURIComponent(serviceReviewsMatch[1]);
        send(response, 200, await getServiceReviews(db, serviceId));
        return;
      }
      if (request.method === 'GET' && pathname === '/api/admin/reviews') {
        requireAdmin(request);
        const result = await db.query(
          'SELECT r.id::text AS id, r.rating, r.comment, r.created_at, r.updated_at, u.name AS user_name, s.name AS service_name FROM service_reviews r JOIN users u ON u.id = r.user_id JOIN services s ON s.id = r.service_id ORDER BY r.created_at DESC',
        );
        send(response, 200, result.rows.map((row) => ({
          id: row.id,
          rating: Number(row.rating),
          comment: row.comment,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          userName: row.user_name,
          serviceName: row.service_name,
        })));
        return;
      }
      if (serviceReviewsMatch && request.method === 'POST') {
        const user = requireUser(request);
        const serviceId = decodeURIComponent(serviceReviewsMatch[1]);
        const body = await readBody(request);
        const rating = parseNumericField(body.rating);
        const comment = validateComment(body.comment);
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new ApiError(400, 'Оценка должна быть от 1 до 5.');
        const saved = await db.query(
          'INSERT INTO service_reviews (user_id, service_id, rating, comment) SELECT $1, s.id, $3, $4 FROM services s WHERE s.id = $2 AND s.is_active = TRUE ON CONFLICT (user_id, service_id) DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, updated_at = NOW() RETURNING id::text AS id',
          [user.id, serviceId, rating, comment],
        );
        if (!saved.rowCount) throw new ApiError(404, 'Услуга не найдена или больше недоступна.');
        const review = await db.query(
          'SELECT r.id::text AS id, r.rating, r.comment, r.created_at, r.updated_at, u.name AS user_name, s.name AS service_name FROM service_reviews r JOIN users u ON u.id = r.user_id JOIN services s ON s.id = r.service_id WHERE r.id = $1::uuid',
          [saved.rows[0].id],
        );
        const row = review.rows[0];
        send(response, 200, { id: row.id, rating: Number(row.rating), comment: row.comment, createdAt: row.created_at, updatedAt: row.updated_at, userName: row.user_name, serviceName: row.service_name });
        return;
      }
      const reviewMatch = pathname.match(/^\/api\/reviews\/([^/]+)$/);
      if (request.method === 'DELETE' && reviewMatch) {
        const user = requireUser(request);
        const reviewId = decodeURIComponent(reviewMatch[1]);
        const deleted = await db.query(
          'DELETE FROM service_reviews WHERE id = $1::uuid AND ($2::boolean OR user_id = $3::bigint) RETURNING id::text AS id',
          [reviewId, user.role === 'admin', user.id],
        );
        if (!deleted.rowCount) throw new ApiError(404, 'Отзыв не найден или у вас нет прав на его удаление.');
        send(response, 200, { id: deleted.rows[0].id, deleted: true });
        return;
      }
      if (request.method === 'PATCH' && pathname === '/api/account') {
        const user = requireUser(request);
        const body = await readBody(request);
        const name = validatePersonName(body.name);
        const email = validateEmail(body.email);
        const phone = validatePhone(body.phone);
        const defaultAddress = validateAddress(body.defaultAddress, 'Адрес по умолчанию', true);
        const saved = await db.query(
          'UPDATE users SET name = $1, email = $2, phone = $3, default_address = $4 WHERE id = $5 AND is_active = TRUE RETURNING id',
          [name, email, phone, defaultAddress || null, user.id],
        );
        if (!saved.rowCount) throw new ApiError(404, 'Аккаунт не найден.');
        const result = await db.query(
          'SELECT u.id, u.name, u.email, u.phone, u.default_address, u.coupon_code, u.coupon_discount_percent, r.name AS role, r.title AS role_title FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1',
          [user.id],
        );
        const updatedUser = publicUser(result.rows[0]);
        const token = getSessionToken(request);
        if (token) sessions.set(token, updatedUser);
        send(response, 200, { user: updatedUser });
        return;
      }
      if (request.method === 'POST' && pathname === '/api/account/password') {
        const user = requireUser(request);
        const body = await readBody(request);
        const currentPassword = String(body.currentPassword || '');
        if (!currentPassword || currentPassword.length > 128) throw new ApiError(400, 'Введите текущий пароль.');
        const newPassword = validatePassword(body.newPassword, 'Новый пароль');
        if (currentPassword === newPassword) throw new ApiError(400, 'Новый пароль должен отличаться от текущего.');
        const changed = await db.query(
          'UPDATE users SET password_hash = crypt($1, gen_salt(\'sha512crypt\')) WHERE id = $2 AND password_hash = crypt($3, password_hash) RETURNING id',
          [newPassword, user.id, currentPassword],
        );
        if (!changed.rowCount) throw new ApiError(400, 'Текущий пароль введён неверно.');
        send(response, 200, { message: 'Пароль изменён.' });
        return;
      }
      if (request.method === 'POST' && pathname === '/api/auth/password-reset-requests') {
        const email = validateEmail((await readBody(request)).email);
        await db.query(
          "INSERT INTO password_reset_requests (user_id) SELECT u.id FROM users u WHERE lower(u.email) = $1 AND u.is_active = TRUE AND NOT EXISTS (SELECT 1 FROM password_reset_requests p WHERE p.user_id = u.id AND p.status = 'Ожидает обработки')",
          [email],
        );
        send(response, 200, { message: 'Если аккаунт существует, запрос на сброс пароля передан администратору.' });
        return;
      }
      if (request.method === 'POST' && pathname === '/api/categories') {
        requireAdmin(request);
        const name = String((await readBody(request)).name || '').trim();
        if (name.length < 2 || name.length > 80) {
          throw new ApiError(400, 'Название категории должно содержать от 2 до 80 символов.');
        }
        const duplicate = await db.query('SELECT 1 FROM categories WHERE lower(name) = lower($1) LIMIT 1', [name]);
        if (duplicate.rowCount) throw new ApiError(409, 'Такая категория уже существует.');
        const baseId = categoryIdFromName(name);
        let id = baseId;
        let suffix = 2;
        while ((await db.query('SELECT 1 FROM categories WHERE id = $1', [id])).rowCount) {
          id = baseId.slice(0, 50 - String(suffix).length - 1) + '-' + suffix++;
        }
        const result = await db.query('INSERT INTO categories (id, name) VALUES ($1, $2) RETURNING id, name', [id, name]);
        send(response, 201, result.rows[0]);
        return;
      }

      const categoryMatch = pathname.match(/^\/api\/categories\/([^/]+)$/);
      if (request.method === 'PATCH' && categoryMatch) {
        requireAdmin(request);
        const categoryId = decodeURIComponent(categoryMatch[1]);
        const name = String((await readBody(request)).name || '').trim();
        if (name.length < 2 || name.length > 80) {
          throw new ApiError(400, 'Название категории должно содержать от 2 до 80 символов.');
        }
        const duplicate = await db.query(
          'SELECT 1 FROM categories WHERE lower(name) = lower($1) AND id <> $2 LIMIT 1',
          [name, categoryId],
        );
        if (duplicate.rowCount) throw new ApiError(409, 'Такая категория уже существует.');
        const updated = await db.query(
          'UPDATE categories SET name = $1 WHERE id = $2 RETURNING id, name',
          [name, categoryId],
        );
        if (!updated.rowCount) throw new ApiError(404, 'Категория не найдена.');
        send(response, 200, updated.rows[0]);
        return;
      }
      if (request.method === 'DELETE' && categoryMatch) {
        requireAdmin(request);
        let categoryId;
        try {
          categoryId = decodeURIComponent(categoryMatch[1]);
        } catch {
          throw new ApiError(400, 'Передан некорректный идентификатор категории.');
        }
        const replacementCategoryId = url.searchParams.get('replacementCategoryId') || '';
        const client = await db.connect();
        try {
          await client.query('BEGIN');
          const categoryResult = await client.query(
            'SELECT id, name FROM categories WHERE id = $1 FOR UPDATE',
            [categoryId],
          );
          const category = categoryResult.rows[0];
          if (!category) throw new ApiError(404, 'Категория не найдена.');

          const serviceCountResult = await client.query(
            'SELECT COUNT(*)::int AS count FROM services WHERE category_id = $1',
            [categoryId],
          );
          const serviceCount = Number(serviceCountResult.rows[0].count);
          let movedServices = 0;
          let movedTo = null;

          if (serviceCount > 0) {
            if (!replacementCategoryId) {
              throw new ApiError(409, 'Выберите другую категорию, в которую нужно перенести услуги.');
            }
            if (replacementCategoryId === categoryId) {
              throw new ApiError(400, 'Для переноса выберите категорию, отличную от удаляемой.');
            }
            const replacementResult = await client.query(
              'SELECT id, name FROM categories WHERE id = $1 FOR KEY SHARE',
              [replacementCategoryId],
            );
            if (!replacementResult.rowCount) throw new ApiError(404, 'Категория для переноса услуг не найдена.');
            movedTo = replacementResult.rows[0].name;
            const updateResult = await client.query(
              'UPDATE services SET category_id = $1 WHERE category_id = $2',
              [replacementCategoryId, categoryId],
            );
            movedServices = updateResult.rowCount;
          }

          await client.query('DELETE FROM categories WHERE id = $1', [categoryId]);
          await client.query('COMMIT');
          send(response, 200, { id: category.id, name: category.name, movedServices, movedTo });
        } catch (error) {
          await client.query('ROLLBACK').catch(() => {});
          if (error.code === '23503') {
            throw new ApiError(409, 'Категория используется услугами. Выберите категорию, в которую их нужно перенести.');
          }
          throw error;
        } finally {
          client.release();
        }
        return;
      }

      const discountMatch = pathname.match(/^\/api\/services\/([^/]+)\/discount$/);
      if (request.method === 'PATCH' && discountMatch) {
        requireAdmin(request);
        const discountPercent = parseNumericField((await readBody(request)).discountPercent);
        if (!Number.isInteger(discountPercent) || discountPercent < 0 || discountPercent > 70) {
          throw new ApiError(400, 'Скидка должна быть целым числом от 0 до 70.');
        }
        const result = await db.query(
          'UPDATE services SET discount_percent = $1 WHERE id = $2 RETURNING id, discount_percent',
          [discountPercent, decodeURIComponent(discountMatch[1])],
        );
        if (!result.rowCount) throw new ApiError(404, 'Услуга не найдена.');
        send(response, 200, {
          id: result.rows[0].id,
          discountPercent: Number(result.rows[0].discount_percent),
        });
        return;
      }
      const serviceMatch = pathname.match(/^\/api\/services\/([^/]+)$/);
      if (serviceMatch && request.method === 'PATCH') {
        requireAdmin(request);
        const serviceId = decodeURIComponent(serviceMatch[1]);
        const service = await parseServiceInput(db, await readBody(request));
        const updated = await db.query(
          'UPDATE services SET name = $1, description = $2, duration_minutes = $3, price = $4, category_id = $5, discount_percent = $6 WHERE id = $7 AND is_active = TRUE RETURNING id, name',
          [service.name, service.description, service.duration, service.price, service.categoryId, service.discountPercent, serviceId],
        );
        if (!updated.rowCount) throw new ApiError(404, 'Услуга не найдена или уже скрыта.');
        send(response, 200, updated.rows[0]);
        return;
      }
      if (serviceMatch && request.method === 'DELETE') {
        requireAdmin(request);
        const serviceId = decodeURIComponent(serviceMatch[1]);
        const references = await db.query(
          'SELECT (SELECT COUNT(*) FROM appointment_services aps JOIN appointments a ON a.id = aps.appointment_id WHERE aps.service_id = $1) + (SELECT COUNT(*) FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.service_id = $1) AS history_count FROM services s WHERE s.id = $1',
          [serviceId],
        );
        if (!references.rowCount) throw new ApiError(404, 'Услуга не найдена.');
        if (Number(references.rows[0].history_count) > 0) {
          await db.query('UPDATE services SET is_active = FALSE WHERE id = $1', [serviceId]);
          send(response, 200, { id: serviceId, deleted: true, archived: true });
        } else {
          await db.query('DELETE FROM services WHERE id = $1', [serviceId]);
          send(response, 200, { id: serviceId, deleted: true, archived: false });
        }
        return;
      }
      if (request.method === 'POST' && pathname === '/api/coupons/personal') {
        requireAdmin(request);
        const body = await readBody(request);
        const email = validateEmail(body.email);
        const discountPercent = parseNumericField(body.discountPercent);
        if (!Number.isInteger(discountPercent) || discountPercent < 1 || discountPercent > 50) {
          throw new ApiError(400, 'Персональная скидка должна быть от 1 до 50%.');
        }
        const couponCode = 'AURA' + discountPercent + '-' + randomUUID().slice(0, 4).toUpperCase();
        const result = await db.query(
          'UPDATE users SET coupon_code = $1, coupon_discount_percent = $2 WHERE lower(email) = $3 RETURNING email, coupon_code, coupon_discount_percent',
          [couponCode, discountPercent, email],
        );
        if (!result.rowCount) throw new ApiError(404, 'Пользователь с таким email не найден.');
        send(response, 200, {
          email: result.rows[0].email,
          discountCoupon: {
            code: result.rows[0].coupon_code,
            discountPercent: Number(result.rows[0].coupon_discount_percent),
          },
        });
        return;
      }
      const resetRequestAction = pathname.match(/^\/api\/admin\/password-reset-requests\/([^/]+)(?:\/(dismiss))?$/);
      if (request.method === 'GET' && pathname === '/api/admin/password-reset-requests') {
        requireAdmin(request);
        const result = await db.query(
          "SELECT p.id::text AS id, p.created_at, p.status, u.name AS user_name, u.email, u.phone FROM password_reset_requests p JOIN users u ON u.id = p.user_id WHERE p.status = 'Ожидает обработки' AND u.is_active = TRUE ORDER BY p.created_at",
        );
        send(response, 200, result.rows.map((row) => ({
          id: row.id,
          createdAt: row.created_at,
          status: row.status,
          userName: row.user_name,
          email: row.email,
          phone: row.phone || '',
        })));
        return;
      }
      if (resetRequestAction && request.method === 'POST' && resetRequestAction[2] === 'dismiss') {
        requireAdmin(request);
        const requestId = decodeURIComponent(resetRequestAction[1]);
        const result = await db.query(
          "UPDATE password_reset_requests SET status = 'Отклонён', resolved_at = NOW() WHERE id = $1::uuid AND status = 'Ожидает обработки' RETURNING id::text AS id",
          [requestId],
        );
        if (!result.rowCount) throw new ApiError(404, 'Запрос уже обработан или не найден.');
        send(response, 200, { id: result.rows[0].id, dismissed: true });
        return;
      }
      if (resetRequestAction && request.method === 'POST' && !resetRequestAction[2]) {
        requireAdmin(request);
        const requestId = decodeURIComponent(resetRequestAction[1]);
        const temporaryPassword = generateTemporaryPassword();
        const client = await db.connect();
        let resetUserId;
        try {
          await client.query('BEGIN');
          const requestResult = await client.query(
            "SELECT p.id::text AS id, u.id::text AS user_id, u.name, u.email FROM password_reset_requests p JOIN users u ON u.id = p.user_id WHERE p.id = $1::uuid AND p.status = 'Ожидает обработки' AND u.is_active = TRUE FOR UPDATE OF p, u",
            [requestId],
          );
          const resetRequest = requestResult.rows[0];
          if (!resetRequest) throw new ApiError(404, 'Запрос уже обработан или пользователь не найден.');
          resetUserId = resetRequest.user_id;
          await client.query(
            "UPDATE users SET password_hash = crypt($1, gen_salt('sha512crypt')) WHERE id = $2::bigint",
            [temporaryPassword, resetUserId],
          );
          await client.query(
            "UPDATE password_reset_requests SET status = 'Обработан', resolved_at = NOW() WHERE id = $1::uuid",
            [requestId],
          );
          await client.query('COMMIT');
          for (const [token, session] of sessions.entries()) {
            if (String(session.id) === String(resetUserId)) sessions.delete(token);
          }
          send(response, 200, {
            email: resetRequest.email,
            userName: resetRequest.name,
            temporaryPassword,
          });
        } catch (error) {
          await client.query('ROLLBACK').catch(() => {});
          throw error;
        } finally {
          client.release();
        }
        return;
      }
      if (request.method === 'POST' && pathname === '/api/admin/users') {
        requireAdmin(request);
        const body = await readBody(request);
        const name = validatePersonName(body.name);
        const email = validateEmail(body.email);
        const password = validatePassword(body.password, 'Временный пароль');
        const phone = validatePhone(body.phone);
        const defaultAddress = validateAddress(body.defaultAddress, 'Адрес по умолчанию', true);
        const result = await db.query(
          "INSERT INTO users (name, email, password_hash, role_id, phone, default_address) SELECT $1, $2, crypt($3, gen_salt('sha512crypt')), r.id, $4, $5 FROM roles r WHERE r.name = 'client' RETURNING id",
          [name, email, password, phone, defaultAddress || null],
        );
        if (!result.rowCount) throw new ApiError(503, 'В базе данных не настроена роль клиента. Выполните server/schema.sql.');
        const userResult = await db.query(
          'SELECT u.id, u.name, u.email, u.phone, u.default_address, u.is_active, u.coupon_code, u.coupon_discount_percent, r.name AS role, r.title AS role_title FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1',
          [result.rows[0].id],
        );
        send(response, 201, publicUser(userResult.rows[0]));
        return;
      }
      const adminUserMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
      if (adminUserMatch && request.method === 'PATCH') {
        requireAdmin(request);
        const userId = decodeURIComponent(adminUserMatch[1]);
        const body = await readBody(request);
        const name = validatePersonName(body.name);
        const email = validateEmail(body.email);
        const phone = validatePhone(body.phone);
        const defaultAddress = validateAddress(body.defaultAddress, 'Адрес по умолчанию', true);
        const updated = await db.query(
          'UPDATE users SET name = $1, email = $2, phone = $3, default_address = $4 WHERE id = $5::bigint AND is_active = TRUE AND role_id = (SELECT id FROM roles WHERE name = \'client\') RETURNING id',
          [name, email, phone, defaultAddress || null, userId],
        );
        if (!updated.rowCount) throw new ApiError(404, 'Активный клиент не найден.');
        const userResult = await db.query(
          'SELECT u.id, u.name, u.email, u.phone, u.default_address, u.is_active, u.coupon_code, u.coupon_discount_percent, r.name AS role, r.title AS role_title FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1',
          [userId],
        );
        send(response, 200, publicUser(userResult.rows[0]));
        return;
      }
      if (adminUserMatch && request.method === 'DELETE') {
        requireAdmin(request);
        const userId = decodeURIComponent(adminUserMatch[1]);
        const targetResult = await db.query(
          'SELECT u.id::text AS id, r.name AS role, (EXISTS (SELECT 1 FROM appointments a WHERE a.user_id = u.id) OR EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id)) AS has_history FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1::bigint AND u.is_active = TRUE',
          [userId],
        );
        const target = targetResult.rows[0];
        if (!target) throw new ApiError(404, 'Активный пользователь не найден.');
        if (target.role !== 'client') throw new ApiError(403, 'Учётные записи администраторов нельзя удалить из панели.');
        if (target.has_history) {
          await db.query('UPDATE users SET is_active = FALSE WHERE id = $1::bigint', [userId]);
        } else {
          await db.query('DELETE FROM users WHERE id = $1::bigint', [userId]);
        }
        for (const [token, session] of sessions.entries()) {
          if (String(session.id) === String(userId)) sessions.delete(token);
        }
        send(response, 200, { id: userId, deleted: true, archived: Boolean(target.has_history) });
        return;
      }
      if (request.method === 'GET' && pathname === '/api/admin/users') {
        requireAdmin(request);
        const result = await db.query(
          'SELECT u.id, u.name, u.email, u.phone, u.default_address, u.is_active, u.coupon_code, u.coupon_discount_percent, r.name AS role, r.title AS role_title FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = \'client\' ORDER BY u.name',
        );
        send(response, 200, result.rows.map(publicUser));
        return;
      }
      throw new ApiError(404, 'Такой адрес API не найден.');
    } catch (error) {
      const status = apiErrorStatus(error);
      if (status >= 500) console.error('Ошибка API:', error);
      send(response, status, { message: apiErrorMessage(error, status) });
    }
  });

  server.on('close', () => {
    sessions.clear();
    if (pool) {
      const activePool = pool;
      pool = undefined;
      activePool.end().catch((error) => console.error('Ошибка закрытия PostgreSQL pool:', error));
    }
  });
  return server;
}
