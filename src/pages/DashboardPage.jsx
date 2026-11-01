import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useServices } from '../contexts/ServicesContext.jsx';
import { formatPrice, formatServiceCount } from '../utils/formatPrice.js';
import RussianPhoneInput from '../components/RussianPhoneInput.jsx';
import { formatRussianPhoneInput, getAddressError, getEmailError, getPasswordError, getPersonNameError, isValidRussianPhone, normalizeAddress, normalizeEmail, normalizePersonName, PASSWORD_RULES_TEXT } from '../../shared/validation.js';

function formatDate(dateString) {
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(dateString));
}

export default function DashboardPage() {
  const { user, updateAccount, changePassword } = useAuth();
  const { services, categories, refreshCatalog, addCategory, deleteCategory, updateCategory, updateService, setServiceDiscount, createPersonalCoupon } = useServices();
  const [appointments, setAppointments] = useState([]);
  const [loadingAppointments, setLoadingAppointments] = useState(true);
  const [appointmentsError, setAppointmentsError] = useState('');
  const [appointmentActionId, setAppointmentActionId] = useState(null);
  const [appointmentActionMessage, setAppointmentActionMessage] = useState('');
  const [appointmentActionError, setAppointmentActionError] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [categoryReplacements, setCategoryReplacements] = useState({});
  const [couponEmail, setCouponEmail] = useState('');
  const [couponPercent, setCouponPercent] = useState(10);
  const [selectedService, setSelectedService] = useState('');
  const [servicePercent, setServicePercent] = useState(30);
  const [adminMessage, setAdminMessage] = useState('');
  const [adminError, setAdminError] = useState('');
  const [working, setWorking] = useState(false);
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState('');
  const [accountForm, setAccountForm] = useState({
    name: user.name || '',
    email: user.email || '',
    phone: formatRussianPhoneInput(user.phone || ''),
    defaultAddress: user.defaultAddress || '',
  });
  const [accountMessage, setAccountMessage] = useState('');
  const [accountError, setAccountError] = useState('');
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmation: '' });
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [serviceForm, setServiceForm] = useState({ name: '', description: '', duration: 60, price: 0, categoryId: '', discountPercent: 0 });
  const [serviceMessage, setServiceMessage] = useState('');
  const [serviceError, setServiceError] = useState('');
  const [serviceManagementError, setServiceManagementError] = useState('');
  const [editingServiceId, setEditingServiceId] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState('');
  const [categoryEditName, setCategoryEditName] = useState('');
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminUsersLoading, setAdminUsersLoading] = useState(false);
  const [adminUsersError, setAdminUsersError] = useState('');
  const [adminUserMessage, setAdminUserMessage] = useState('');
  const [adminUserForm, setAdminUserForm] = useState({ name: '', email: '', phone: '', defaultAddress: '', password: '' });
  const [editingAdminUserId, setEditingAdminUserId] = useState('');
  const [adminUserEditForm, setAdminUserEditForm] = useState({ name: '', email: '', phone: '', defaultAddress: '' });
  const [passwordResetRequests, setPasswordResetRequests] = useState([]);
  const [passwordResetLoading, setPasswordResetLoading] = useState(false);
  const [passwordResetError, setPasswordResetError] = useState('');
  const [passwordResetActionId, setPasswordResetActionId] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState(null);
  const [adminReviews, setAdminReviews] = useState([]);
  const [adminReviewsLoading, setAdminReviewsLoading] = useState(false);
  const [adminReviewsError, setAdminReviewsError] = useState('');

  useEffect(() => {
    let active = true;
    setLoadingAppointments(true);
    apiRequest('/appointments')
      .then((data) => { if (active) setAppointments(Array.isArray(data) ? data : []); })
      .catch((error) => { if (active) setAppointmentsError(error.message); })
      .finally(() => { if (active) setLoadingAppointments(false); });
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    let active = true;
    setOrdersLoading(true);
    apiRequest('/orders')
      .then((data) => { if (active) setOrders(Array.isArray(data) ? data : []); })
      .catch((error) => { if (active) setOrdersError(error.message); })
      .finally(() => { if (active) setOrdersLoading(false); });
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    setAccountForm({
      name: user.name || '',
      email: user.email || '',
      phone: formatRussianPhoneInput(user.phone || ''),
      defaultAddress: user.defaultAddress || '',
    });
  }, [user]);

  useEffect(() => {
    if (user.role !== 'admin') return undefined;
    let active = true;
    setAdminUsersLoading(true);
    setPasswordResetLoading(true);
    setAdminReviewsLoading(true);
    apiRequest('/admin/users')
      .then((data) => { if (active) setAdminUsers(Array.isArray(data) ? data : []); })
      .catch((error) => { if (active) setAdminUsersError(error.message || 'Не удалось загрузить пользователей.'); })
      .finally(() => { if (active) setAdminUsersLoading(false); });
    apiRequest('/admin/password-reset-requests')
      .then((data) => { if (active) setPasswordResetRequests(Array.isArray(data) ? data : []); })
      .catch((error) => { if (active) setPasswordResetError(error.message || 'Не удалось загрузить запросы на восстановление пароля.'); })
      .finally(() => { if (active) setPasswordResetLoading(false); });
    apiRequest('/admin/reviews')
      .then((data) => { if (active) setAdminReviews(Array.isArray(data) ? data : []); })
      .catch((error) => { if (active) setAdminReviewsError(error.message || 'Не удалось загрузить отзывы.'); })
      .finally(() => { if (active) setAdminReviewsLoading(false); });
    return () => { active = false; };
  }, [user.role]);

  async function runAdminAction(action, message) {
    setAdminMessage('');
    setAdminError('');
    setWorking(true);
    try {
      const result = await action();
      setAdminMessage(typeof message === 'function' ? message(result) : message);
    } catch (error) {
      setAdminError(error.message || 'Не удалось выполнить операцию.');
    } finally {
      setWorking(false);
    }
  }

  function performAdminAction(event, action, message) {
    event.preventDefault();
    return runAdminAction(action, message);
  }

  async function changeAppointment(appointment) {
    const isAdmin = user.role === 'admin';
    const actionText = isAdmin ? 'удалить запись' : 'отменить запись';
    if (!window.confirm(`Вы уверены, что хотите ${actionText}?`)) return;

    setAppointmentActionId(appointment.id);
    setAppointmentActionMessage('');
    setAppointmentActionError('');
    try {
      if (isAdmin) {
        await apiRequest(`/appointments/${encodeURIComponent(appointment.id)}`, { method: 'DELETE' });
        setAppointments((current) => current.filter((item) => item.id !== appointment.id));
        setAppointmentActionMessage('Запись удалена.');
      } else {
        const result = await apiRequest(`/appointments/${encodeURIComponent(appointment.id)}/cancel`, { method: 'POST' });
        setAppointments((current) => current.map((item) => item.id === appointment.id
          ? { ...item, status: result.status, paymentStatus: item.paymentStatus === 'Оплачен' ? item.paymentStatus : 'Отменён' }
          : item));
        setAppointmentActionMessage('Запись отменена.');
      }
    } catch (error) {
      setAppointmentActionError(error.message || 'Не удалось изменить запись.');
    } finally {
      setAppointmentActionId(null);
    }
  }

  async function saveAccount(event) {
    event.preventDefault();
    setAccountMessage('');
    setAccountError('');
    const nameError = getPersonNameError(accountForm.name);
    const emailError = getEmailError(accountForm.email);
    const addressError = accountForm.defaultAddress.trim() ? getAddressError(accountForm.defaultAddress, 'Адрес по умолчанию') : '';
    if (nameError || emailError || !isValidRussianPhone(accountForm.phone) || addressError) {
      setAccountError(nameError || emailError || (!isValidRussianPhone(accountForm.phone) ? 'Введите номер в формате +7(900)123-45-67.' : addressError));
      return;
    }
    try {
      await updateAccount({
        ...accountForm,
        name: normalizePersonName(accountForm.name),
        email: normalizeEmail(accountForm.email),
        phone: formatRussianPhoneInput(accountForm.phone),
        defaultAddress: normalizeAddress(accountForm.defaultAddress),
      });
      setAccountMessage('Личные данные сохранены.');
    } catch (error) {
      setAccountError(error.message || 'Не удалось сохранить профиль.');
    }
  }

  async function savePassword(event) {
    event.preventDefault();
    setPasswordMessage('');
    setPasswordError('');
    if (passwordForm.newPassword !== passwordForm.confirmation) {
      setPasswordError('Новые пароли не совпадают.');
      return;
    }
    const passwordValidationError = getPasswordError(passwordForm.newPassword);
    if (passwordValidationError) {
      setPasswordError(passwordValidationError);
      return;
    }
    if (passwordForm.currentPassword === passwordForm.newPassword) {
      setPasswordError('Новый пароль должен отличаться от текущего.');
      return;
    }
    try {
      await changePassword(passwordForm.currentPassword, passwordForm.newPassword);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmation: '' });
      setPasswordMessage('Пароль изменён.');
    } catch (error) {
      setPasswordError(error.message || 'Не удалось изменить пароль.');
    }
  }

  async function saveService(event) {
    event.preventDefault();
    setServiceMessage('');
    setServiceError('');
    try {
      if (editingServiceId) {
        await updateService(editingServiceId, serviceForm);
        setServiceMessage('Изменения услуги сохранены.');
        setEditingServiceId('');
      } else {
        await apiRequest('/services', {
          method: 'POST',
          body: JSON.stringify(serviceForm),
        });
        await refreshCatalog();
        setServiceMessage('Услуга добавлена в каталог.');
      }
      setServiceForm({ name: '', description: '', duration: 60, price: 0, categoryId: categories[0]?.id || '', discountPercent: 0 });
    } catch (error) {
      setServiceError(error.message || 'Не удалось добавить услугу.');
    }
  }

  function editService(service) {
    setEditingServiceId(service.id);
    setServiceForm({
      name: service.name,
      description: service.description,
      duration: service.duration,
      price: service.price,
      categoryId: service.categoryId,
      discountPercent: service.discountPercent,
    });
    setServiceMessage('');
    setServiceError('');
  }

  async function saveCategoryName(event, category) {
    event.preventDefault();
    try {
      const saved = await updateCategory(category.id, categoryEditName);
      setEditingCategoryId('');
      setCategoryEditName('');
      setAdminMessage(`Название категории изменено на «${saved.name}».`);
      setAdminError('');
    } catch (error) {
      setAdminError(error.message || 'Не удалось изменить категорию.');
    }
  }

  async function deleteService(service) {
    if (!window.confirm(`Удалить услугу «${service.name}»?`)) return;
    setServiceManagementError('');
    try {
      await apiRequest(`/services/${encodeURIComponent(service.id)}`, { method: 'DELETE' });
      await refreshCatalog();
      setServiceMessage(`Услуга «${service.name}» удалена из каталога.`);
    } catch (error) {
      setServiceManagementError(error.message || 'Не удалось удалить услугу.');
    }
  }

  async function createAdminUser(event) {
    event.preventDefault();
    setAdminUsersError('');
    setAdminUserMessage('');
    const nameError = getPersonNameError(adminUserForm.name);
    const emailError = getEmailError(adminUserForm.email);
    const passwordError = getPasswordError(adminUserForm.password);
    const addressError = adminUserForm.defaultAddress.trim() ? getAddressError(adminUserForm.defaultAddress, 'Адрес по умолчанию') : '';
    if (nameError || emailError || passwordError || !isValidRussianPhone(adminUserForm.phone) || addressError) {
      setAdminUsersError(nameError || emailError || passwordError || (!isValidRussianPhone(adminUserForm.phone) ? 'Введите номер в формате +7(900)123-45-67.' : addressError));
      return;
    }
    try {
      const created = await apiRequest('/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          ...adminUserForm,
          name: normalizePersonName(adminUserForm.name),
          email: normalizeEmail(adminUserForm.email),
          phone: formatRussianPhoneInput(adminUserForm.phone),
          defaultAddress: normalizeAddress(adminUserForm.defaultAddress),
        }),
      });
      setAdminUsers((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name, 'ru')));
      setAdminUserForm({ name: '', email: '', phone: '', defaultAddress: '', password: '' });
      setAdminUserMessage(`Аккаунт клиента ${created.email} создан.`);
    } catch (error) {
      setAdminUsersError(error.message || 'Не удалось создать аккаунт клиента.');
    }
  }

  function editAdminUser(account) {
    setEditingAdminUserId(account.id);
    setAdminUserEditForm({
      name: account.name,
      email: account.email,
      phone: formatRussianPhoneInput(account.phone || ''),
      defaultAddress: account.defaultAddress || '',
    });
    setAdminUsersError('');
    setAdminUserMessage('');
  }

  async function saveAdminUser(event) {
    event.preventDefault();
    setAdminUsersError('');
    const nameError = getPersonNameError(adminUserEditForm.name);
    const emailError = getEmailError(adminUserEditForm.email);
    const addressError = adminUserEditForm.defaultAddress.trim() ? getAddressError(adminUserEditForm.defaultAddress, 'Адрес по умолчанию') : '';
    if (nameError || emailError || !isValidRussianPhone(adminUserEditForm.phone) || addressError) {
      setAdminUsersError(nameError || emailError || (!isValidRussianPhone(adminUserEditForm.phone) ? 'Введите номер в формате +7(900)123-45-67.' : addressError));
      return;
    }
    try {
      const saved = await apiRequest(`/admin/users/${encodeURIComponent(editingAdminUserId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...adminUserEditForm,
          name: normalizePersonName(adminUserEditForm.name),
          email: normalizeEmail(adminUserEditForm.email),
          phone: formatRussianPhoneInput(adminUserEditForm.phone),
          defaultAddress: normalizeAddress(adminUserEditForm.defaultAddress),
        }),
      });
      setAdminUsers((current) => current.map((account) => account.id === saved.id ? saved : account));
      setEditingAdminUserId('');
      setAdminUserMessage(`Данные клиента ${saved.email} сохранены.`);
    } catch (error) {
      setAdminUsersError(error.message || 'Не удалось сохранить данные клиента.');
    }
  }

  async function deleteAdminUser(account) {
    if (!window.confirm(`Удалить аккаунт клиента ${account.email}?`)) return;
    setAdminUsersError('');
    try {
      const result = await apiRequest(`/admin/users/${encodeURIComponent(account.id)}`, { method: 'DELETE' });
      setAdminUsers((current) => current.filter((item) => item.id !== account.id));
      setAdminUserMessage(result.archived
        ? `Аккаунт ${account.email} отключён. История заказов и записей сохранена.`
        : `Аккаунт ${account.email} удалён.`);
    } catch (error) {
      setAdminUsersError(error.message || 'Не удалось удалить аккаунт клиента.');
    }
  }

  async function processPasswordReset(request) {
    setPasswordResetActionId(request.id);
    setPasswordResetError('');
    setTemporaryPassword(null);
    try {
      const result = await apiRequest(`/admin/password-reset-requests/${encodeURIComponent(request.id)}`, { method: 'POST' });
      setPasswordResetRequests((current) => current.filter((item) => item.id !== request.id));
      setTemporaryPassword(result);
    } catch (error) {
      setPasswordResetError(error.message || 'Не удалось сбросить пароль.');
    } finally {
      setPasswordResetActionId('');
    }
  }

  async function dismissPasswordReset(request) {
    setPasswordResetActionId(request.id);
    setPasswordResetError('');
    try {
      await apiRequest(`/admin/password-reset-requests/${encodeURIComponent(request.id)}/dismiss`, { method: 'POST' });
      setPasswordResetRequests((current) => current.filter((item) => item.id !== request.id));
    } catch (error) {
      setPasswordResetError(error.message || 'Не удалось закрыть запрос.');
    } finally {
      setPasswordResetActionId('');
    }
  }

  async function deleteAdminReview(review) {
    if (!window.confirm(`Удалить отзыв клиента «${review.userName}» об услуге «${review.serviceName}»?`)) return;
    try {
      await apiRequest(`/reviews/${encodeURIComponent(review.id)}`, { method: 'DELETE' });
      setAdminReviews((current) => current.filter((item) => item.id !== review.id));
    } catch (error) {
      setAdminReviewsError(error.message || 'Не удалось удалить отзыв.');
    }
  }

  async function updateOrder(order, status) {
    try {
      const updated = await apiRequest(`/orders/${encodeURIComponent(order.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setOrders((current) => current.map((item) => item.id === order.id ? { ...item, status: updated.status } : item));
    } catch (error) {
      setOrdersError(error.message || 'Не удалось изменить статус заказа.');
    }
  }

  async function updateAppointment(appointment, status) {
    setAppointmentActionError('');
    try {
      const updated = await apiRequest(`/appointments/${encodeURIComponent(appointment.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setAppointments((current) => current.map((item) => item.id === appointment.id ? {
        ...item,
        status: updated.status,
        paymentStatus: updated.status === 'Отменена' && item.paymentStatus !== 'Оплачен' ? 'Отменён' : item.paymentStatus,
      } : item));
    } catch (error) {
      setAppointmentActionError(error.message || 'Не удалось изменить статус записи.');
    }
  }

  async function deleteOrder(order) {
    if (!window.confirm(`Удалить заказ №${order.id.slice(0, 8)}?`)) return;
    try {
      await apiRequest(`/orders/${encodeURIComponent(order.id)}`, { method: 'DELETE' });
      setOrders((current) => current.filter((item) => item.id !== order.id));
    } catch (error) {
      setOrdersError(error.message || 'Не удалось удалить заказ.');
    }
  }

  return (
    <section className="content-page dashboard-page" aria-labelledby="dashboard-title">
      <div className="dashboard-intro">
        <p className="eyebrow"><span /> {user.role === 'admin' ? 'УПРАВЛЕНИЕ САЛОНОМ' : 'ЛИЧНЫЙ КАБИНЕТ'}</p>
        <h1 id="dashboard-title">Здравствуйте, {user.name}</h1>
        <p className="intro-copy">{user.role === 'admin' ? 'Управляйте каталогом услуг, категориями и скидками.' : 'Здесь отображаются ваши записи и персональная скидка.'}</p>
      </div>

      {user.discountCoupon && (
        <div className="coupon-banner">
          <span className="coupon-mark" aria-hidden="true">%</span>
          <div>
            <p className="eyebrow">ПЕРСОНАЛЬНЫЙ КУПОН</p>
            <strong>{user.discountCoupon.code}</strong>
            <span>Скидка {user.discountCoupon.discountPercent}% применится при записи.</span>
          </div>
        </div>
      )}

      {user.role === 'admin' && (
        <section className="admin-section" aria-labelledby="admin-tools-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">КАТАЛОГ И СКИДКИ</p>
              <h2 id="admin-tools-title">Инструменты администратора</h2>
            </div>
          </div>
          {adminMessage && <p className="success-banner" role="status">{adminMessage}</p>}
          {adminError && <p className="form-error admin-error" role="alert">{adminError}</p>}
          <div className="admin-grid">
            <form className="admin-card" onSubmit={(event) => performAdminAction(
              event,
              () => addCategory(categoryName),
              (category) => `Категория «${category.name}» добавлена и появилась в фильтре каталога.`,
            )}>
              <p className="eyebrow">НОВАЯ КАТЕГОРИЯ</p>
              <h3>Добавить в каталог</h3>
              <label htmlFor="new-category">Название категории</label>
              <input
                id="new-category"
                value={categoryName}
                onChange={(event) => setCategoryName(event.target.value)}
                placeholder="Например, Макияж"
                minLength={2}
                maxLength={80}
                required
              />
              <button className="add-button" type="submit" disabled={working}>Добавить категорию</button>
              <p className="admin-card-note">Сейчас категорий: {categories.length}</p>
            </form>
            <form className="admin-card" onSubmit={saveService}>
              <p className="eyebrow">{editingServiceId ? 'РЕДАКТИРОВАНИЕ УСЛУГИ' : 'НОВАЯ УСЛУГА'}</p>
              <h3>{editingServiceId ? 'Изменить услугу' : 'Добавить в каталог'}</h3>
              <label htmlFor="service-name">Название</label>
              <input id="service-name" value={serviceForm.name} onChange={(event) => setServiceForm({ ...serviceForm, name: event.target.value })} minLength={2} maxLength={160} required />
              <label htmlFor="service-description">Описание</label>
              <textarea id="service-description" value={serviceForm.description} onChange={(event) => setServiceForm({ ...serviceForm, description: event.target.value })} minLength={2} maxLength={2000} required />
              <label htmlFor="service-category">Категория</label>
              <select id="service-category" value={serviceForm.categoryId || categories[0]?.id || ''} onChange={(event) => setServiceForm({ ...serviceForm, categoryId: event.target.value })} required>
                <option value="" disabled>Выберите категорию</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
              <label htmlFor="service-duration">Длительность, минут</label>
              <input id="service-duration" type="number" min="5" max="600" value={serviceForm.duration} onChange={(event) => setServiceForm({ ...serviceForm, duration: event.target.value })} required />
              <label htmlFor="service-price">Цена, ₽</label>
              <input id="service-price" type="number" min="0" max="10000000" step="0.01" value={serviceForm.price} onChange={(event) => setServiceForm({ ...serviceForm, price: event.target.value })} required />
              <label htmlFor="service-discount-new">Скидка, %</label>
              <input id="service-discount-new" type="number" min="0" max="70" value={serviceForm.discountPercent} onChange={(event) => setServiceForm({ ...serviceForm, discountPercent: event.target.value })} required />
              {serviceMessage && <p className="success-banner">{serviceMessage}</p>}
              {serviceError && <p className="form-error" role="alert">{serviceError}</p>}
              <button className="add-button" type="submit">{editingServiceId ? 'Сохранить изменения' : 'Добавить услугу'}</button>
              {editingServiceId && <button className="text-link" type="button" onClick={() => { setEditingServiceId(''); setServiceForm({ name: '', description: '', duration: 60, price: 0, categoryId: categories[0]?.id || '', discountPercent: 0 }); }}>Отменить редактирование</button>}
            </form>
            <section className="admin-card service-management-card" aria-labelledby="manage-services-title">
              <p className="eyebrow">УПРАВЛЕНИЕ УСЛУГАМИ</p>
              <h3 id="manage-services-title">Каталог услуг</h3>
              {serviceManagementError && <p className="form-error" role="alert">{serviceManagementError}</p>}
              <div className="admin-service-list">
                {services.map((service) => (
                  <div className="admin-service-row" key={service.id}>
                    <div>
                      <strong>{service.name}</strong>
                      <small>{service.categoryName} · {formatPrice(service.price)}</small>
                    </div>
                    <div className="admin-row-actions">
                      <button className="category-delete-button" type="button" onClick={() => editService(service)}>Изменить</button>
                      <button className="category-delete-button" type="button" onClick={() => deleteService(service)}>Удалить</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="admin-card category-management-card" aria-labelledby="manage-categories-title">
              <p className="eyebrow">УПРАВЛЕНИЕ КАТЕГОРИЯМИ</p>
              <h3 id="manage-categories-title">Категории каталога</h3>
              {categories.length === 0 ? (
                <p className="admin-card-note">Категорий пока нет.</p>
              ) : (
                <div className="admin-category-list">
                  {categories.map((category) => {
                    const serviceCount = category.serviceCount ?? 0;
                    const replacementCategories = categories.filter((item) => item.id !== category.id);
                    const replacementCategoryId = categoryReplacements[category.id]
                      ?? replacementCategories[0]?.id
                      ?? '';
                    const replacementCategory = replacementCategories.find((item) => item.id === replacementCategoryId);
                    return (
                      <div className="admin-category-row" key={category.id}>
                        <div className="admin-category-title">
                          <strong>{category.name}</strong>
                          <small>{formatServiceCount(serviceCount)}</small>
                        </div>
                        <button
                          className="category-delete-button"
                          type="button"
                          onClick={() => {
                            setEditingCategoryId(category.id);
                            setCategoryEditName(category.name);
                            setAdminError('');
                          }}
                        >Изменить</button>
                        <button
                          className="category-delete-button"
                          type="button"
                          disabled={working || (serviceCount > 0 && replacementCategories.length === 0)}
                          onClick={() => runAdminAction(
                            () => deleteCategory(category.id, replacementCategoryId),
                            (result) => result.movedServices
                              ? `Категория «${result.name}» удалена, ${formatServiceCount(result.movedServices)} перенесено в «${result.movedTo}».`
                              : `Категория «${result.name}» удалена.`,
                          )}
                        >
                          Удалить
                        </button>
                        {editingCategoryId === category.id && (
                          <form className="admin-category-edit" onSubmit={(event) => saveCategoryName(event, category)}>
                            <label htmlFor={`category-name-${category.id}`}>Новое название</label>
                            <input
                              id={`category-name-${category.id}`}
                              value={categoryEditName}
                              onChange={(event) => setCategoryEditName(event.target.value)}
                              minLength={2}
                              maxLength={80}
                              required
                            />
                            <div className="admin-row-actions">
                              <button className="category-delete-button" type="submit">Сохранить</button>
                              <button className="category-delete-button" type="button" onClick={() => setEditingCategoryId('')}>Отмена</button>
                            </div>
                          </form>
                        )}
                        {serviceCount > 0 && (
                          <select
                            className="category-replacement-select"
                            aria-label={`Куда перенести услуги из категории «${category.name}»`}
                            value={replacementCategoryId}
                            onChange={(event) => setCategoryReplacements((current) => ({ ...current, [category.id]: event.target.value }))}
                            disabled={working || replacementCategories.length === 0}
                          >
                            <option value="" disabled>
                              {replacementCategories.length ? 'Выберите категорию для переноса услуг' : 'Сначала создайте другую категорию'}
                            </option>
                            {replacementCategories.map((replacement) => (
                              <option key={replacement.id} value={replacement.id}>{replacement.name}</option>
                            ))}
                          </select>
                        )}
                        {serviceCount > 0 && replacementCategory && (
                          <p className="category-replacement-note">
                            Услуги переместятся в «{replacementCategory.name}».
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="admin-card-note">Для категорий с услугами выбрана категория переноса. Её можно изменить перед удалением.</p>
            </section>

            <form className="admin-card" onSubmit={(event) => performAdminAction(
              event,
              () => setServiceDiscount(selectedService, servicePercent),
              `Скидка на услугу обновлена: ${servicePercent}%.`,
            )}>
              <p className="eyebrow">ОБЩАЯ СКИДКА</p>
              <h3>Скидка на услугу</h3>
              <label htmlFor="discount-service">Услуга</label>
              <select id="discount-service" value={selectedService} onChange={(event) => setSelectedService(event.target.value)} required>
                <option value="" disabled>Выберите услугу</option>
                {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
              </select>
              <label htmlFor="service-discount">Размер скидки, %</label>
              <input id="service-discount" type="number" min="0" max="70" value={servicePercent} onChange={(event) => setServicePercent(event.target.value)} required />
              <button className="add-button" type="submit" disabled={working || !selectedService}>Сохранить скидку</button>
            </form>

            <form className="admin-card" onSubmit={(event) => performAdminAction(
              event,
              () => createPersonalCoupon(couponEmail, couponPercent),
              (result) => `Купон ${result.discountCoupon.code} (${result.discountCoupon.discountPercent}%) выдан пользователю ${result.email}.`,
            )}>
              <p className="eyebrow">ПЕРСОНАЛЬНЫЙ КУПОН</p>
              <h3>Выдать скидку клиенту</h3>
              <label htmlFor="coupon-email">Email пользователя</label>
              <input id="coupon-email" type="email" value={couponEmail} onChange={(event) => setCouponEmail(event.target.value)} onBlur={() => setCouponEmail(normalizeEmail(couponEmail))} maxLength={254} placeholder="name@example.com" required />
              <label htmlFor="coupon-percent">Размер скидки, %</label>
              <input id="coupon-percent" type="number" min="1" max="50" value={couponPercent} onChange={(event) => setCouponPercent(event.target.value)} required />
              <button className="add-button" type="submit" disabled={working}>Выдать купон</button>
            </form>
          </div>
        </section>
      )}

      {user.role === 'admin' && (
        <section className="account-section" aria-labelledby="admin-users-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">УЧЁТНЫЕ ЗАПИСИ</p>
              <h2 id="admin-users-title">Клиенты</h2>
            </div>
          </div>
          {adminUserMessage && <p className="success-banner" role="status">{adminUserMessage}</p>}
          {adminUsersError && <p className="form-error" role="alert">{adminUsersError}</p>}
          <div className="account-grid">
            <form className="admin-card" onSubmit={createAdminUser}>
              <p className="eyebrow">НОВЫЙ КЛИЕНТ</p>
              <label htmlFor="admin-new-user-name">ФИО</label>
              <input id="admin-new-user-name" value={adminUserForm.name} onChange={(event) => setAdminUserForm({ ...adminUserForm, name: event.target.value })} minLength={2} maxLength={120} required />
              <label htmlFor="admin-new-user-email">Email</label>
              <input id="admin-new-user-email" type="email" value={adminUserForm.email} onChange={(event) => setAdminUserForm({ ...adminUserForm, email: event.target.value })} onBlur={() => setAdminUserForm({ ...adminUserForm, email: normalizeEmail(adminUserForm.email) })} maxLength={254} required />
              <label htmlFor="admin-new-user-phone">Телефон</label>
              <RussianPhoneInput id="admin-new-user-phone" value={adminUserForm.phone} onChange={(phone) => setAdminUserForm({ ...adminUserForm, phone })} required />
              <label htmlFor="admin-new-user-address">Адрес по умолчанию</label>
              <input id="admin-new-user-address" value={adminUserForm.defaultAddress} onChange={(event) => setAdminUserForm({ ...adminUserForm, defaultAddress: event.target.value })} maxLength={250} />
              <label htmlFor="admin-new-user-password">Временный пароль</label>
              <input id="admin-new-user-password" type="password" value={adminUserForm.password} onChange={(event) => setAdminUserForm({ ...adminUserForm, password: event.target.value })} minLength={8} maxLength={128} required />
              <small className="field-hint">{PASSWORD_RULES_TEXT}</small>
              <button className="add-button" type="submit">Создать аккаунт</button>
            </form>
            <section className="admin-card" aria-label="Список клиентов">
              <p className="eyebrow">КЛИЕНТЫ</p>
              {adminUsersLoading && <p className="state-message" role="status">Загружаются клиенты…</p>}
              {!adminUsersLoading && adminUsers.length === 0 && <p className="admin-card-note">Клиентов пока нет.</p>}
              <div className="admin-user-list">
                {adminUsers.map((account) => (
                  <article className="admin-user-item" key={account.id}>
                    {editingAdminUserId === account.id ? (
                      <form className="admin-user-edit" onSubmit={saveAdminUser}>
                        <label htmlFor={`edit-user-name-${account.id}`}>ФИО</label>
                        <input id={`edit-user-name-${account.id}`} value={adminUserEditForm.name} onChange={(event) => setAdminUserEditForm({ ...adminUserEditForm, name: event.target.value })} minLength={2} maxLength={120} required />
                        <label htmlFor={`edit-user-email-${account.id}`}>Email</label>
                        <input id={`edit-user-email-${account.id}`} type="email" value={adminUserEditForm.email} onChange={(event) => setAdminUserEditForm({ ...adminUserEditForm, email: event.target.value })} onBlur={() => setAdminUserEditForm({ ...adminUserEditForm, email: normalizeEmail(adminUserEditForm.email) })} maxLength={254} required />
                        <label htmlFor={`edit-user-phone-${account.id}`}>Телефон</label>
                        <RussianPhoneInput id={`edit-user-phone-${account.id}`} value={adminUserEditForm.phone} onChange={(phone) => setAdminUserEditForm({ ...adminUserEditForm, phone })} required />
                        <label htmlFor={`edit-user-address-${account.id}`}>Адрес по умолчанию</label>
                        <input id={`edit-user-address-${account.id}`} value={adminUserEditForm.defaultAddress} onChange={(event) => setAdminUserEditForm({ ...adminUserEditForm, defaultAddress: event.target.value })} maxLength={250} />
                        <div className="admin-row-actions">
                          <button className="category-delete-button" type="submit">Сохранить</button>
                          <button className="category-delete-button" type="button" onClick={() => setEditingAdminUserId('')}>Отмена</button>
                        </div>
                      </form>
                    ) : (
                      <div className="admin-user-row">
                        <div className="admin-category-title">
                          <strong>{account.name}</strong>
                          <small>{account.email} · {account.phone}</small>
                          {account.defaultAddress && <small>{account.defaultAddress}</small>}
                          {account.discountCoupon && <small>Купон {account.discountCoupon.code} · {account.discountCoupon.discountPercent}%</small>}
                        </div>
                        <div className="admin-row-actions">
                          <button className="category-delete-button" type="button" onClick={() => editAdminUser(account)}>Изменить</button>
                          <button className="category-delete-button" type="button" onClick={() => deleteAdminUser(account)}>Удалить</button>
                        </div>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>
          </div>
        </section>
      )}

      {user.role === 'admin' && (
        <section className="account-section" aria-labelledby="password-reset-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">ПОМОЩЬ С ВХОДОМ</p>
              <h2 id="password-reset-title">Восстановление пароля</h2>
            </div>
          </div>
          <p className="intro-copy">После сброса передайте временный пароль пользователю по телефону. При следующем входе он сможет заменить его в личном кабинете.</p>
          {temporaryPassword && (
            <div className="success-banner reset-password-result" role="status">
              <span aria-hidden="true">✓</span>
              <div>Для {temporaryPassword.email} временный пароль: <strong>{temporaryPassword.temporaryPassword}</strong></div>
              <button className="category-delete-button" type="button" onClick={() => setTemporaryPassword(null)}>Скрыть</button>
            </div>
          )}
          {passwordResetError && <p className="form-error dashboard-panel-message" role="alert">{passwordResetError}</p>}
          {passwordResetLoading && <p className="state-message dashboard-panel-message" role="status">Загружаются запросы…</p>}
          {!passwordResetLoading && passwordResetRequests.length === 0 && <p className="dashboard-empty-state">Ожидающих запросов нет.</p>}
          <div className="appointment-list">
            {passwordResetRequests.map((request) => (
              <article className="appointment-row admin-data-row" key={request.id}>
                <div className="admin-category-title">
                  <strong>{request.userName}</strong>
                  <small>{request.email} · {request.phone || 'телефон не указан'}</small>
                  <small>Запрос: {formatDate(request.createdAt)}</small>
                </div>
                <div className="admin-row-actions">
                  <button className="appointment-action-button" type="button" disabled={passwordResetActionId !== ''} onClick={() => processPasswordReset(request)}>
                    {passwordResetActionId === request.id ? 'Сбрасываем…' : 'Сбросить пароль'}
                  </button>
                  <button className="category-delete-button" type="button" disabled={passwordResetActionId !== ''} onClick={() => dismissPasswordReset(request)}>Закрыть запрос</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {user.role === 'admin' && (
        <section className="appointments-section" aria-labelledby="admin-reviews-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">ОТЗЫВЫ КЛИЕНТОВ</p>
              <h2 id="admin-reviews-title">Управление отзывами</h2>
            </div>
          </div>
          {adminReviewsLoading && <p className="state-message dashboard-panel-message" role="status">Загружаются отзывы…</p>}
          {adminReviewsError && <p className="form-error dashboard-panel-message" role="alert">{adminReviewsError}</p>}
          {!adminReviewsLoading && !adminReviewsError && adminReviews.length === 0 && <p className="dashboard-empty-state">Отзывов пока нет.</p>}
          <div className="appointment-list">
            {adminReviews.map((review) => (
              <article className="appointment-row admin-data-row" key={review.id}>
                <div className="admin-category-title">
                  <strong>{review.serviceName} · {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</strong>
                  <small>{review.userName} · {formatDate(review.createdAt)}</small>
                  <p>{review.comment}</p>
                </div>
                <button className="category-delete-button" type="button" onClick={() => deleteAdminReview(review)}>Удалить отзыв</button>
              </article>
            ))}
          </div>
        </section>
      )}

      {user.role !== 'admin' && (
        <section className="account-section" aria-labelledby="account-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">ПРОФИЛЬ</p>
              <h2 id="account-title">Личные данные</h2>
            </div>
          </div>
          <div className="account-grid">
            <form className="admin-card" onSubmit={saveAccount}>
              <label htmlFor="account-name">ФИО</label>
              <input id="account-name" value={accountForm.name} onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })} minLength={2} maxLength={120} required />
              <label htmlFor="account-email">Email</label>
              <input id="account-email" type="email" value={accountForm.email} onChange={(event) => setAccountForm({ ...accountForm, email: event.target.value })} onBlur={() => setAccountForm({ ...accountForm, email: normalizeEmail(accountForm.email) })} maxLength={254} required />
              <label htmlFor="account-phone">Телефон</label>
              <RussianPhoneInput id="account-phone" value={accountForm.phone} onChange={(phone) => setAccountForm({ ...accountForm, phone })} required />
              <label htmlFor="account-address">Адрес по умолчанию</label>
              <input id="account-address" value={accountForm.defaultAddress} onChange={(event) => setAccountForm({ ...accountForm, defaultAddress: event.target.value })} maxLength={250} />
              {accountMessage && <p className="success-banner">{accountMessage}</p>}
              {accountError && <p className="form-error" role="alert">{accountError}</p>}
              <button className="add-button" type="submit">Сохранить данные</button>
            </form>
            <form className="admin-card" onSubmit={savePassword}>
              <p className="eyebrow">БЕЗОПАСНОСТЬ</p>
              <h3>Изменить пароль</h3>
              <label htmlFor="current-password">Текущий пароль</label>
              <input id="current-password" type="password" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm({ ...passwordForm, currentPassword: event.target.value })} required />
              <label htmlFor="new-password">Новый пароль</label>
              <input id="new-password" type="password" minLength={8} maxLength={128} value={passwordForm.newPassword} onChange={(event) => setPasswordForm({ ...passwordForm, newPassword: event.target.value })} required />
              <small className="field-hint">{PASSWORD_RULES_TEXT}</small>
              <label htmlFor="new-password-confirmation">Повторите новый пароль</label>
              <input id="new-password-confirmation" type="password" minLength={8} maxLength={128} value={passwordForm.confirmation} onChange={(event) => setPasswordForm({ ...passwordForm, confirmation: event.target.value })} required />
              {passwordMessage && <p className="success-banner">{passwordMessage}</p>}
              {passwordError && <p className="form-error" role="alert">{passwordError}</p>}
              <button className="add-button" type="submit">Изменить пароль</button>
            </form>
          </div>
        </section>
      )}

      <section className="orders-section appointments-section" aria-labelledby="orders-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ИСТОРИЯ ЗАКАЗОВ</p>
            <h2 id="orders-title">{user.role === 'admin' ? 'Заказы клиентов' : 'Мои заказы'}</h2>
          </div>
        </div>
        {ordersLoading && <p className="state-message dashboard-panel-message">Загружаются заказы…</p>}
        {!ordersLoading && ordersError && <p className="form-error dashboard-panel-message" role="alert">{ordersError}</p>}
        {!ordersLoading && !ordersError && orders.length === 0 && <p className="dashboard-empty-state">Заказов пока нет.</p>}
        {!ordersLoading && orders.length > 0 && (
          <div className="appointment-list">
            {orders.map((order) => (
              <article className="appointment-row" key={order.id}>
                <div>
                  <p className="product-category">{order.deliveryDate} · {order.status}</p>
                  <h3>{order.items.map((item) => `${item.serviceName} × ${item.quantity}`).join(', ')}</h3>
                  <p className="summary-note">Доставка: {order.deliveryAddress}{user.role === 'admin' ? ` · ${order.userName} · ${order.userEmail}` : ''}</p>
                </div>
                <div className="appointment-actions">
                  <strong>{formatPrice(order.total)}</strong>
                  {user.role === 'admin' && (
                    <>
                      <select value={order.status} onChange={(event) => updateOrder(order, event.target.value)} aria-label="Статус заказа">
                        {['Новый', 'Подтверждён', 'Выполнен', 'Отменён'].map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                      <button className="appointment-action-button" type="button" onClick={() => deleteOrder(order)}>Удалить заказ</button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="appointments-section" aria-labelledby="appointments-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ЗАПИСИ И ПЛАТЕЖИ</p>
            <h2 id="appointments-title">{user.role === 'admin' ? 'Записи клиентов' : 'Мои записи'}</h2>
          </div>
          <Link className="text-link" to="/catalog">Каталог услуг ↗</Link>
        </div>
        {loadingAppointments && <p className="state-message dashboard-panel-message" role="status">Загружаются записи…</p>}
        {!loadingAppointments && appointmentsError && <p className="form-error dashboard-panel-message" role="alert">{appointmentsError}</p>}
        {appointmentActionMessage && <p className="success-banner" role="status">{appointmentActionMessage}</p>}
        {appointmentActionError && <p className="form-error" role="alert">{appointmentActionError}</p>}
        {!loadingAppointments && !appointmentsError && appointments.length === 0 && (
          <div className="dashboard-empty-state">
            <strong>Записей пока нет</strong>
            <p>{user.role === 'admin' ? 'Новые записи клиентов появятся здесь после оформления.' : 'Выберите услуги в каталоге, чтобы создать первую запись.'}</p>
          </div>
        )}
        {!loadingAppointments && appointments.length > 0 && (
          <div className="appointment-list">
            {appointments.map((appointment) => (
              <article className="appointment-row" key={appointment.id}>
                <div>
                  <p className="product-category">{formatDate(appointment.scheduledAt)} · {appointment.status}</p>
                  <h3>{appointment.items.map((item) => `${item.serviceName} × ${item.quantity}`).join(', ')}</h3>
                  {user.role === 'admin' && <p className="summary-note">Клиент: {appointment.userName} · {appointment.userEmail}</p>}
                  <p className="summary-note">Платёж: {appointment.paymentStatus || 'Ожидает оплаты'} · в салоне</p>
                </div>
                <div className="appointment-actions">
                  <strong>{formatPrice(appointment.total)}</strong>
                  {user.role === 'admin' && (
                    <select
                      value={appointment.status}
                      onChange={(event) => updateAppointment(appointment, event.target.value)}
                      aria-label={`Статус записи ${appointment.id.slice(0, 8)}`}
                      disabled={appointmentActionId !== null}
                    >
                      {['Новая', 'Подтверждена', 'Выполнена', 'Отменена'].map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  )}
                  {(user.role === 'admin' || appointment.status !== 'Отменена') && (
                    <button
                      className="appointment-action-button"
                      type="button"
                      disabled={appointmentActionId !== null}
                      onClick={() => changeAppointment(appointment)}
                      aria-label={`${user.role === 'admin' ? 'Удалить' : 'Отменить'} запись ${appointment.id.slice(0, 8)}`}
                    >
                      {appointmentActionId === appointment.id
                        ? 'Обработка…'
                        : user.role === 'admin' ? 'Удалить запись' : 'Отменить запись'}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
