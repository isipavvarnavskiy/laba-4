const rubles = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 0,
});

export function formatPrice(value) {
  return rubles.format(value);
}

export function formatServiceCount(count) {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${count} услуг`;
  if (last === 1) return `${count} услуга`;
  if (last >= 2 && last <= 4) return `${count} услуги`;
  return `${count} услуг`;
}
