import Link from 'next/link';
import type { Metadata } from 'next';
import { AuthHeading } from '@/components/auth/auth-heading';
import { ForgotPasswordForm } from '@/components/auth/auth-forms';
import { Alert } from '@/components/ui/card';

export const metadata: Metadata = { title: 'שכחתי סיסמה' };

export default function ForgotPasswordPage() {
  return (
    <>
      <AuthHeading title="שכחת סיסמה?" />
      <div className="flex flex-col gap-5">
        <Alert tone="blue" title="נרשמת עם מספר טלפון?">
          פני אלינו ונעזור לך לבחור סיסמה חדשה.
        </Alert>
        <details className="group rounded-control border border-line bg-surface open:border-line-strong">
          <summary className="flex min-h-12 cursor-pointer items-center px-4 text-small font-semibold text-navy-900">
            יש לי חשבון עם אימייל
          </summary>
          <div className="border-t border-line p-4">
            <ForgotPasswordForm />
          </div>
        </details>
        <Link href="/login" className="text-center text-small font-medium text-navy-900 underline underline-offset-4">
          חזרה להתחברות
        </Link>
      </div>
    </>
  );
}
