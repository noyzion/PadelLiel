import { formatDayMonth, formatHours, weekEndOf, weekStartOf } from '@/lib/time';

/**
 * Builds the Hebrew announcement the admin pastes into the WhatsApp group.
 * (The app does not send WhatsApp messages itself.)
 */
export function buildWeeklyWhatsAppMessage(params: {
  weekStart: string;
  bookingUrl: string;
  cancellationCutoffHours?: number;
}): string {
  const start = weekStartOf(params.weekStart);
  const end = weekEndOf(params.weekStart);
  const hours = formatHours(params.cancellationCutoffHours ?? 8);
  return [
    'היי בנות,',
    `האימונים לשבוע ${formatDayMonth(start)}–${formatDayMonth(end)} פורסמו.`,
    'אפשר להירשם לאימונים, לבטל ולהצטרף לרשימת המתנה דרך הקישור:',
    params.bookingUrl,
    '',
    `תזכורת: ביטול עד ${hours} שעות לפני האימון מחזיר את האימון למכסה החודשית.`,
  ].join('\n');
}

/** wa.me link that opens WhatsApp with the message prefilled (the user picks the chat). */
export function whatsappShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function scheduleLink(appUrl: string, weekStart: string): string {
  const base = appUrl.replace(/\/+$/, '');
  return `${base}/schedule?week=${weekStartOf(weekStart)}`;
}
