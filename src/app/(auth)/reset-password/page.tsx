import type { Metadata } from 'next';
import { AuthHeading } from '@/components/auth/auth-heading';
import { ResetPasswordForm } from '@/components/auth/auth-forms';

export const metadata: Metadata = { title: 'איפוס סיסמה' };

export default function ResetPasswordPage() {
  return (
    <>
      <AuthHeading title="בחירת סיסמה חדשה" />
      <ResetPasswordForm />
    </>
  );
}
