import type { Metadata } from 'next';
import { BackLink } from '@/components/admin/session-panels';
import { Card, EmptyState, PageHeader } from '@/components/ui/card';
import { formatInstantHe } from '@/lib/time';
import { requireAdmin } from '@/server/auth';
import { getAuditLog } from '@/server/services/dashboard';

export const metadata: Metadata = { title: 'יומן פעולות' };

const OPERATION_HE: Record<string, string> = { insert: 'נוצר', update: 'עודכן', delete: 'נמחק', reset_password: 'סיסמה אופסה' };
const ENTITY_HE: Record<string, string> = {
  profiles: 'מתאמנת',
  subscription_plans: 'תוכנית מנוי',
  member_subscriptions: 'מנוי',
  sessions: 'אימון',
  bookings: 'הרשמה',
  allowance_adjustments: 'התאמת מכסה',
  app_settings: 'הגדרה',
  waitlist_entries: 'רשימת המתנה',
};

function describe(action: string, entityType: string) {
  const [operation = ''] = action.split(':');
  return `${ENTITY_HE[entityType] ?? entityType} · ${OPERATION_HE[operation] ?? operation}`;
}

export default async function AdminAuditPage() {
  const { db } = await requireAdmin();
  const logs = await getAuditLog(db, 150);
  return (
    <div className="flex flex-col gap-5">
      <div>
        <BackLink href="/admin/settings">חזרה להגדרות</BackLink>
        <PageHeader title="יומן פעולות" description="150 הפעולות האחרונות, כולל שינויי סטטוס, התאמות מכסה ושיבוצים ידניים" />
      </div>
      {logs.length === 0 ? (
        <EmptyState title="אין פעולות ביומן" />
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-line">
            {logs.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-small">
                <div>
                  <p className="font-medium">{describe(l.action, l.entity_type)}</p>
                  <p className="text-caption text-muted">{l.actor_name}</p>
                </div>
                <span className="text-caption text-muted">{formatInstantHe(l.created_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
