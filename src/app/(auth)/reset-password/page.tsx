import type { Metadata } from 'next';
import { ResetPasswordForm } from '@/components/auth/auth-forms';

export const metadata: Metadata = { title: 'סיסמה חדשה' };

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="mb-5 text-title font-semibold">בחירת סיסמה חדשה</h1>
      <ResetPasswordForm />
    </>
  );
}
