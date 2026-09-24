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
