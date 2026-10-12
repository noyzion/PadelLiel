import type { Metadata } from 'next';
import Link from 'next/link';
import { ApprovalBadge, SkillLevelBadge } from '@/components/domain/badges';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui/card';
import { DataTable, Td, THead, Th, Tr } from '@/components/ui/data-table';
import { FilterChips } from '@/components/ui/filter-chips';
import { SearchField } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { levelLabel } from '@/lib/domain/labels';
import type { ApprovalStatus, MemberOverview } from '@/lib/domain/types';
import { currentMonthStart } from '@/lib/time';
import { requireAdmin } from '@/server/auth';
import { listMembers } from '@/server/services/admin-members';
import { getSkillLevels } from '@/server/services/settings';

export const metadata: Metadata = { title: 'מתאמנות' };

const FILTERS: { value: ApprovalStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'הכול' },
  { value: 'pending', label: 'ממתינות לאישור' },
  { value: 'approved', label: 'מאושרות' },
  { value: 'rejected', label: 'נדחו' },
];

function SubscriptionBadge({ m }: { m: MemberOverview }) {
  if (!m.plan_name) return <Badge tone="amber">ללא מנוי</Badge>;
  return (
    <Badge tone={m.has_active_subscription ? 'rose' : 'amber'}>
      {m.plan_name}
      {m.has_active_subscription ? '' : ' · לא פעיל'}
    </Badge>
  );
}

function monthlyUsage(m: MemberOverview): string | null {
  return m.has_active_subscription ? `נוצלו ${m.used} · נותרו ${m.remaining}` : null;
}

export default async function AdminMembersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const params = await searchParams;
  const { db } = await requireAdmin();
  const monthStart = currentMonthStart();
  const [members, levels] = await Promise.all([listMembers(db, monthStart), getSkillLevels(db)]);

  const status = FILTERS.some((f) => f.value === params.status) ? (params.status as ApprovalStatus | 'all') : 'all';
  const q = (params.q ?? '').trim();
  const needle = q.toLowerCase();

  const countOf = (value: ApprovalStatus | 'all') => (value === 'all' ? members.length : members.filter((m) => m.approval_status === value).length);
  const pendingCount = countOf('pending');
  const filtered = members.filter((m) => {
    if (status !== 'all' && m.approval_status !== status) return false;
    if (!needle) return true;
    return [m.full_name, m.phone ?? '', m.email ?? ''].some((v) => v.toLowerCase().includes(needle));
  });

  const hrefFor = (value: string) => {
    const query = new URLSearchParams();
    if (q) query.set('q', q);
    if (value !== 'all') query.set('status', value);
    const s = query.toString();
    return s ? `/admin/members?${s}` : '/admin/members';
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="מתאמנות" description={`${members.length} רשומות${pendingCount ? ` · ${pendingCount} ממתינות לאישור` : ''}`} />

      <form method="get" role="search" className="flex flex-col gap-3 sm:flex-row">
        {status !== 'all' ? <input type="hidden" name="status" value={status} /> : null}
        <SearchField name="q" defaultValue={q} label="חיפוש לפי שם, טלפון או אימייל" placeholder="חיפוש לפי שם, טלפון או אימייל" className="flex-1" />
        <Button type="submit" variant="secondary">
          חיפוש
        </Button>
      </form>

      <FilterChips
        label="סינון לפי סטטוס אישור"
        selected={status}
        hrefFor={hrefFor}
        chips={FILTERS.map((f) => ({ ...f, count: countOf(f.value) }))}
      />

      {filtered.length === 0 ? (
        <EmptyState title="לא נמצאו מתאמנות" description="נסי לשנות את החיפוש או את הסינון." />
      ) : (
        <>
          {/* Phones: short cards */}
          <div className="flex flex-col gap-2 md:hidden">
            {filtered.map((m) => (
              <Link key={m.id} href={`/admin/members/${m.id}`} className="block">
                <Card className="flex flex-col gap-3 p-4 transition-colors duration-150 hover:border-navy-900/40">
                  <div className="min-w-0">
                    <p className="truncate text-body font-semibold text-navy-900">{m.full_name}</p>
                    <p className="truncate text-caption text-muted">
                      <span dir="ltr">{m.phone ?? '—'}</span> · <span dir="ltr">{m.email ?? '—'}</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <ApprovalBadge status={m.approval_status} />
                    <SkillLevelBadge label={levelLabel(m.skill_level_code, levels)} />
                    <SubscriptionBadge m={m} />
                    {monthlyUsage(m) ? <Badge tone="neutral">{monthlyUsage(m)}</Badge> : null}
                  </div>
                </Card>
              </Link>
            ))}
          </div>

          {/* Desktop: table */}
          <DataTable caption="רשימת מתאמנות" className="hidden md:block">
            <THead>
              <Tr>
                <Th>שם</Th>
                <Th>טלפון</Th>
                <Th>רמה</Th>
                <Th>מנוי</Th>
                <Th>שימוש החודש</Th>
                <Th>סטטוס</Th>
              </Tr>
            </THead>
            <tbody>
              {filtered.map((m) => (
                <Tr key={m.id} className="hover:bg-navy-50/60">
                  <Td className="font-semibold">
                    <Link href={`/admin/members/${m.id}`} className="text-navy-900 underline-offset-4 hover:underline">
                      {m.full_name}
                    </Link>
                    <div className="text-caption font-normal text-muted" dir="ltr">
                      {m.email ?? '—'}
                    </div>
                  </Td>
                  <Td>
                    <span dir="ltr">{m.phone ?? '—'}</span>
                  </Td>
                  <Td>
                    <SkillLevelBadge label={levelLabel(m.skill_level_code, levels)} />
                  </Td>
                  <Td>
                    <SubscriptionBadge m={m} />
                  </Td>
                  <Td>{monthlyUsage(m) ?? '—'}</Td>
                  <Td>
                    <ApprovalBadge status={m.approval_status} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </DataTable>
        </>
      )}
    </div>
  );
}
