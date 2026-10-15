import type { Metadata } from 'next';
import { AuthHeading } from '@/components/auth/auth-heading';
import { RegisterForm } from '@/components/auth/auth-forms';

export const metadata: Metadata = { title: 'הצטרפות לקהילה' };

export default function RegisterPage() {
  return (
    <>
      <AuthHeading title="הצטרפות לקהילה" />
      <RegisterForm />
    </>
  );
}
