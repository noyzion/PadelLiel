import { CircleCheck, Hourglass } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PendingGate } from '@/components/auth/pending-gate';
import { LogoutButton } from '@/components/logout-button';
import { Alert } from '@/components/ui/card';
import { requireUser } from '@/server/auth';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'ההרשמה התקבלה' };

export default async function PendingPage() {
  const { profile } = await requireUser();
  if (profile.role === 'admin') redirect('/admin');
  if (profile.approval_status === 'approved') redirect('/');

  const inactive = profile.approval_status === 'inactive';
  const rejected = profile.approval_status === 'rejected';
  const blocked = rejected || inactive;

  return (
    <div className="flex flex-col items-center gap-6 py-4 text-center sm:py-0">
      <span
        className={
          blocked
            ? 'grid size-16 place-items-center rounded-full bg-danger-soft text-danger'
            : 'grid size-16 place-items-center rounded-full bg-success-soft text-success'
        }
        aria-hidden="true"
      >
        {blocked ? <Hourglass className="size-8" /> : <CircleCheck className="size-8" />}
      </span>

      <div className="flex flex-col gap-2">
        <h1 className="text-title font-semibold">
          {inactive ? 'החשבון אינו פעיל' : rejected ? 'הבקשה לא אושרה' : 'ההרשמה שלך התקבלה'}
        </h1>
        {blocked ? null : (
          <p className="text-body text-muted">
            איזה כיף שהצטרפת! הצוות שלנו יאשר את החשבון שלך בקרוב, ואז תוכלי להתחיל לבחור אימונים.
          </p>
        )}
      </div>

      {inactive ? (
        <Alert tone="red" className="text-start">
          החשבון שלך הוגדר כלא פעיל. אם זו טעות או שאת רוצה לחזור להתאמן, אפשר לפנות ישירות לצוות שלנו.
        </Alert>
      ) : rejected ? (
        <Alert tone="red" className="text-start">
          אם זו טעות, אפשר לפנות ישירות לצוות שלנו.
        </Alert>
      ) : null}

      {blocked ? null : <PendingGate />}
      <LogoutButton variant="secondary" />
    </div>
  );
}
