import Link from 'next/link';
import type { Metadata } from 'next';
import { AuthHeading } from '@/components/auth/auth-heading';
import { Alert } from '@/components/ui/card';

export const metadata: Metadata = { title: 'שכחתי סיסמה' };

export default function ForgotPasswordPage() {
  return (
    <>
      <AuthHeading title="שכחת סיסמה?" />
      <div className="flex flex-col gap-5">
        <Alert tone="blue">פני אלינו ונעזור לך לבחור סיסמה חדשה.</Alert>
        <Link href="/login" className="text-center text-small font-medium text-navy-900 underline underline-offset-4">
          חזרה להתחברות
        </Link>
      </div>
    </>
  );
}
