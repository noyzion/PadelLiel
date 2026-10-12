import { Hourglass } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PadelRackets } from '@/components/brand';
import { LogoutButton } from '@/components/logout-button';
import { Alert } from '@/components/ui/card';
import { requireUser } from '@/server/auth';

export const metadata: Metadata = { title: 'ממתינה לאישור' };

export default async function PendingPage() {
  const { profile } = await requireUser();
  if (profile.role === 'admin') redirect('/admin');
  if (profile.approval_status === 'approved') redirect('/');

  const rejected = profile.approval_status === 'rejected';
  const name = profile.full_name.split(' ')[0];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-3 text-center">
        {rejected ? (
          <span className="grid size-14 place-items-center rounded-full bg-danger-soft text-danger" aria-hidden="true">
            <Hourglass className="size-7" />
          </span>
        ) : (
          <PadelRackets className="w-24 text-pink-200" />
        )}
        <h1 className="text-title font-semibold">{rejected ? 'הבקשה לא אושרה' : `תודה שהצטרפת${name ? `, ${name}` : ''}`}</h1>
      </div>

      {rejected ? (
        <Alert tone="red">אם זו טעות, אפשר לפנות ישירות לצוות שלנו.</Alert>
      ) : (
        <>
          <p className="text-center text-body text-muted">
            הצוות שלנו יאשר את הצטרפותך, יגדיר לך רמה ומנוי, ואז תוכלי להירשם לאימונים. אין צורך לעשות שום דבר נוסף.
          </p>
          <Alert tone="blue" title="מה הלאה?">
            אפשר לסגור את העמוד ולחזור מאוחר יותר. ברגע שהחשבון יאושר, תוכלי להתחבר ולהירשם לאימונים.
          </Alert>
        </>
      )}
      <LogoutButton variant="secondary" className="self-center" />
    </div>
  );
}
