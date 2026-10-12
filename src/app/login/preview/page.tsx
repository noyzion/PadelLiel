import { AppShell } from '@/components/shell/app-shell';
import { SessionCard } from '@/components/member/session-card';
import { SubscriptionSummary } from '@/components/member/subscription-summary';
import { NextSessionCard } from '@/components/member/next-session-card';
import { PageHeader, EmptyState, Alert, Badge } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FilterChips } from '@/components/ui/filter-chips';

const s = {
  id: 'x', session_date: '2026-10-14', start_time: '07:30:00', end_time: '08:30:00', starts_at: '2026-10-14T04:30:00Z', ends_at: '2026-10-14T05:30:00Z',
  week_start: '2026-10-11', skill_level_code: 'beginner', capacity: 4, status: 'PUBLISHED', registration_open: true, notes: null, occupied_count: 2,
  waitlist_count: 0, my_booking_id: null, my_booking_status: null, my_waitlist_entry_id: null, my_waitlist_position: null, block_reason: null,
  cancellation_deadline: '2026-10-13T20:30:00Z', is_late_window: false,
} as const;

export default function Preview() {
  return (
    <AppShell nav={[{ href: '/', label: 'בית', icon: 'home', exact: true }, { href: '/schedule', label: 'אימונים', icon: 'calendar' }, { href: '/bookings', label: 'ההרשמות שלי', icon: 'bookings' }, { href: '/profile', label: 'פרופיל', icon: 'profile' }]}>
      <PageHeader title="בוקר טוב, נועה" description="רמת משחק: מתחילות" />
      <div className="mb-5"><FilterChips label="x" selected="all" hrefFor={() => '#'} chips={[{ value: 'all', label: 'הכול', count: 5 }, { value: 'p', label: 'ממתינות', count: 2 }]} /></div>
      <div className="grid gap-5 md:grid-cols-2">
        <SubscriptionSummary allowance={{ week_start: '2026-10-11', plan_id: 'p', plan_name: 'מנוי', plan_limit: 2, adjustments: 0, effective_limit: 2, used: 1, remaining: 1, has_active_subscription: true }} title="האימונים שלי השבוע" cutoffHours={8} />
        <SessionCard session={{ ...s }} levelLabel="מתחילות" cutoffHours={8} />
        <SessionCard session={{ ...s, occupied_count: 4, my_booking_id: 'b', my_booking_status: 'CONFIRMED' }} levelLabel="מתקדמות" cutoffHours={8} />
        <EmptyState title="עוד לא פורסמו אימונים לשבוע הזה" description="אימונים חדשים יופיעו כאן כשיפורסמו." />
        <div className="flex flex-col gap-3">
          <Alert tone="blue" title="מדיניות ביטול">ביטול עד 8 שעות לפני האימון מחזיר את האימון למכסה.</Alert>
          <div className="flex gap-2"><Badge tone="rose">מתחילות</Badge><Badge tone="green">אושרה</Badge><Badge tone="amber">ממתינה</Badge></div>
          <div className="flex gap-2"><Button>הרשמה</Button><Button variant="accent">רשימת המתנה</Button><Button variant="secondary">ביטול</Button></div>
        </div>
      </div>
    </AppShell>
  );
}
