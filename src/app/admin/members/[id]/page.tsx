import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AllowanceAdjustForm, MemberProfileEditor, SubscriptionManager } from '@/components/admin/member-panels';
import { BackLink } from '@/components/admin/session-panels';
import { BookingStatusBadge } from '@/components/domain/badges';
import { Badge, Card, PageHeader, ProgressBar, SectionHeading } from '@/components/ui/card';
import { DataTable, Td, THead, Th, Tr } from '@/components/ui/data-table';
import { levelLabel } from '@/lib/domain/labels';
import type { Allowance } from '@/lib/domain/types';
import { currentMonthStart, formatDateHe, formatInstantHe, formatMonthHe, formatTimeRange, israelToday, shiftMonth } from '@/lib/time';
import { requireAdmin } from '@/server/auth';
import { getMemberDetail, type MemberBookingRow } from '@/server/services/admin-members';
import { listPlans } from '@/server/services/admin-plans';
import { getSkillLevels } from '@/server/services/settings';

export const metadata: Metadata = { title: 'פרטי מתאמנת' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function AllowanceSummary({ title, allowance }: { title: string; allowance: Allowance }) {
  return (
    <Card className="flex flex-col gap-2 p-4">
      <p className="text-caption font-medium text-muted">{title}</p>
      {allowance.has_active_subscription ? (
        <>
          <p className="text-title font-semibold tabular-nums">
            {allowance.used} / {allowance.effective_limit}
          </p>
          <ProgressBar value={allowance.used} max={allowance.effective_limit} label={title} />
          <p className="text-caption text-muted">
            נותרו {allowance.remaining}
            {allowance.adjustments !== 0 ? ` · התאמה ידנית ${allowance.adjustments > 0 ? '+' : ''}${allowance.adjustments}` : ''}
          </p>
        </>
      ) : (
        <p className="text-small text-muted">אין מנוי פעיל בחודש הזה</p>
      )}
    </Card>
  );
}

export default async function AdminMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { db } = await requireAdmin();
  const month = currentMonthStart();

  const [detail, plans, levels] = await Promise.all([getMemberDetail(db, id, month), listPlans(db), getSkillLevels(db)]);
  if (!detail) notFound();

  const { profile, subscriptions, thisMonth, nextMonth, usage, bookings, adjustments } = detail;
  const adjustMonths = [month, shiftMonth(month, 1), shiftMonth(month, -1), shiftMonth(month, -2)];
  const nowIso = new Date().toISOString();
  const upcoming = bookings.filter((b) => b.status === 'CONFIRMED' && b.session && b.session.starts_at >= nowIso);
  const history = bookings.filter((b) => !upcoming.includes(b));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <BackLink href="/admin/members">חזרה לרשימת המתאמנות</BackLink>
        <PageHeader title={profile.full_name} description={levelLabel(profile.skill_level_code, levels)} />
        <p className="text-small text-muted">
          <span dir="ltr">{profile.phone ?? '-'}</span> · <span dir="ltr">{profile.email ?? '-'}</span> · הצטרפה {formatInstantHe(profile.created_at)}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <AllowanceSummary title={`החודש · ${formatMonthHe(month)}`} allowance={thisMonth} />
        <AllowanceSummary title={`החודש הבא · ${formatMonthHe(shiftMonth(month, 1))}`} allowance={nextMonth} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <MemberProfileEditor
          memberId={profile.id}
          approval={profile.approval_status}
          level={profile.skill_level_code}
          notes={profile.admin_notes ?? ''}
          levels={levels}
        />
        <SubscriptionManager
          memberId={profile.id}
          subscriptions={subscriptions}
          plans={plans}
          today={israelToday()}
        />
      </div>

      <AllowanceAdjustForm memberId={profile.id} months={adjustMonths} />

      <section aria-labelledby="usage" className="flex flex-col gap-3">
        <SectionHeading id="usage">שימוש חודשי</SectionHeading>
        <DataTable caption="שימוש חודשי">
          <THead>
            <Tr>
              <Th>חודש</Th>
              <Th>מכסה</Th>
              <Th>נוצל</Th>
              <Th>השתתפה</Th>
              <Th>ביטול מאוחר</Th>
              <Th>לא הגיעה</Th>
            </Tr>
          </THead>
          <tbody>
            {usage.map((u) => (
              <Tr key={u.month_start}>
                <Td>{formatMonthHe(u.month_start)}</Td>
                <Td>{u.effective_limit}</Td>
                <Td>{u.used}</Td>
                <Td>{u.attended}</Td>
                <Td>{u.late_cancellations}</Td>
                <Td>{u.no_shows}</Td>
              </Tr>
            ))}
          </tbody>
        </DataTable>
      </section>

      <section aria-labelledby="upcoming" className="flex flex-col gap-3">
        <SectionHeading id="upcoming">אימונים קרובים ({upcoming.length})</SectionHeading>
        {upcoming.length === 0 ? <p className="text-small text-muted">אין אימונים קרובים.</p> : null}
        <BookingList items={upcoming} />
      </section>

      <section aria-labelledby="history" className="flex flex-col gap-3">
        <SectionHeading id="history">היסטוריה ({history.length})</SectionHeading>
        {history.length === 0 ? <p className="text-small text-muted">אין היסטוריה.</p> : null}
        <BookingList items={history} />
      </section>

      {adjustments.length > 0 ? (
        <section aria-labelledby="adjustments" className="flex flex-col gap-3">
          <SectionHeading id="adjustments">התאמות מכסה</SectionHeading>
          <Card className="p-0">
            <ul className="divide-y divide-line">
              {adjustments.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-small">
                  <div>
                    <p className="font-medium">
                      {a.delta > 0 ? '+' : ''}
                      {a.delta} · {formatMonthHe(a.month_start)}
                    </p>
                    <p className="text-caption text-muted">{a.reason}</p>
                  </div>
                  <span className="text-caption text-muted">{formatInstantHe(a.created_at)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}
    </div>
  );
}

function BookingList({ items }: { items: MemberBookingRow[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((b) =>
        b.session ? (
          <li key={b.id}>
            <Link href={`/admin/sessions/${b.session.id}`} className="block">
              <Card className="flex flex-wrap items-center justify-between gap-2 p-4 transition-colors hover:border-pink-200">
                <div>
                  <p className="font-semibold">{formatDateHe(b.session.session_date)}</p>
                  <p className="text-caption text-muted tabular-nums">{formatTimeRange(b.session.start_time, b.session.end_time)}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  {b.allowance_restored ? <Badge tone="green">הוחזר למכסה</Badge> : null}
                  <BookingStatusBadge status={b.status} />
                </div>
              </Card>
            </Link>
          </li>
        ) : null,
      )}
    </ul>
  );
}
