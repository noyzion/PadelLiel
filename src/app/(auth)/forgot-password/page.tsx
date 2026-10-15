import type { Metadata } from 'next';
import { ForgotPasswordForm } from '@/components/auth/auth-forms';

export const metadata: Metadata = { title: 'איפוס סיסמה' };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="mb-1 text-title font-semibold">שכחת סיסמה?</h1>
      <p className="mb-5 text-small text-muted">נשלח לך קוד באימייל לבחירת סיסמה חדשה.</p>
      <ForgotPasswordForm />
    </>
  );
}
