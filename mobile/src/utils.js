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

/**
 * Add N days to 'YYYY-MM-DD' in UTC to prevent timezone skew.
 */
export function addDaysToDate(dateStr, days) {
  if (!dateStr) return '';
  const parts = dateStr.split('-').map(Number);
  if (parts.length < 3) return dateStr;
  const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days));
  return dt.toISOString().split('T')[0];
}

/**
 * Compute inclusive day duration between two 'YYYY-MM-DD' dates.
 */
export function computeDurationDays(startStr, endStr) {
  if (!startStr || !endStr) return 1;
  const p1 = startStr.split('-').map(Number);
  const p2 = endStr.split('-').map(Number);
  if (p1.length < 3 || p2.length < 3) return 1;
  const dt1 = Date.UTC(p1[0], p1[1] - 1, p1[2]);
  const dt2 = Date.UTC(p2[0], p2[1] - 1, p2[2]);
  const diffDays = Math.round((dt2 - dt1) / 86400000) + 1;
  return Math.max(1, diffDays);
}

/**
 * Compute end date from start date and duration days (inclusive).
 * end_date = start_date + duration - 1 day
 */
export function computeEndDate(startStr, durationDays) {
  return addDaysToDate(startStr, Math.max(1, Number(durationDays) || 1) - 1);
}

/**
 * Calculates remaining seconds until campaign start time for live real-time countdown.
 */
export function getSecondsUntilStart(startDateStr, dailyStartTime) {
  if (!startDateStr) return null;
  const now = new Date();
  let startHour = 10;
  let startMinute = 0;

  if (dailyStartTime) {
    const match = dailyStartTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (match) {
      let h = parseInt(match[1], 10);
      startMinute = parseInt(match[2], 10);
      const meridiem = (match[3] || '').toUpperCase();
      if (meridiem === 'PM' && h < 12) h += 12;
      if (meridiem === 'AM' && h === 12) h = 0;
      startHour = h;
    }
  }

  // Parse YYYY-MM-DD
  const parts = startDateStr.split('-').map(Number);
  const target = new Date(parts[0], parts[1] - 1, parts[2], startHour, startMinute, 0);
  const diffSec = Math.floor((target.getTime() - now.getTime()) / 1000);
  return diffSec;
}

/**
 * Formats remaining seconds into live real-time string: e.g. "OPENING IN 5H 45M"
 */
export function formatLiveOpeningCountdown(seconds) {
  if (seconds === null || isNaN(seconds)) return null;
  if (seconds <= 0) return 'STARTED';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `OPENING IN ${hrs}H ${String(mins).padStart(2, '0')}M`;
  }
  return `OPENING IN ${mins}M ${String(secs).padStart(2, '0')}S`;
}

