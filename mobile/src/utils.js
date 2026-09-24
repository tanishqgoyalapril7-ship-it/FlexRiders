export const formatINR = (amount) => `₹${Math.round(Number(amount) || 0).toLocaleString('en-IN')}`;

export const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

export const formatDateTime = (value) =>
  value
    ? `${formatDate(value)}, ${new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : '';

export const getInitials = (name) =>
  (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('') || 'R';

// Payments that count towards earnings, matching the backend's calculate_rider_earnings.
const isEarning = (payment) => payment.status === 'PAID' || payment.status === 'PENDING';

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

export function summarizeEarnings(payments, now = new Date()) {
  const today = startOfDay(now);
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - 6);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const sumBetween = (from, to) =>
    payments
      .filter((p) => isEarning(p) && p.date >= from && (!to || p.date < to))
      .reduce((total, p) => total + p.amount, 0);

  const lastSevenDays = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + i);
    const next = new Date(day);
    next.setDate(day.getDate() + 1);
    return {
      label: day.toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 2),
      amount: sumBetween(day, next),
    };
  });

  return {
    today: sumBetween(today),
    week: sumBetween(weekStart),
    month: sumBetween(monthStart),
    lastMonth: sumBetween(lastMonthStart, monthStart),
    lastSevenDays,
  };
}

// Icon and colour tone for a notification, based on the backend's category.
export function notificationStyle(category, title = '') {
  if (category === 'PAYMENT') return { icon: 'cash-outline', tone: 'success' };
  if (category === 'BRAND' || title.includes('Brand')) return { icon: 'briefcase-outline', tone: 'primary' };
  if (category === 'REGISTRATION') return { icon: 'person-add-outline', tone: 'primary' };
  if (category === 'CAMPAIGN') return { icon: 'megaphone-outline', tone: 'primary' };
  return { icon: 'notifications-outline', tone: 'warning' };
}

export const formatShortDate = (value) =>
  value ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '';

export const formatDateRange = (start, end) => `${formatShortDate(start)} – ${formatDate(end)}`;
