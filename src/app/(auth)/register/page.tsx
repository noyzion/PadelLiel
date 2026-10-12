import type { Metadata } from 'next';
import { RegisterForm } from '@/components/auth/auth-forms';

export const metadata: Metadata = { title: 'הרשמה' };

export default function RegisterPage() {
  return (
    <>
      <h1 className="mb-1 text-title font-bold">הצטרפות לקהילה</h1>
      <p className="mb-5 text-small text-muted">אחרי ההרשמה המאמנת תאשר אותך ותגדיר את המנוי והרמה שלך.</p>
      <RegisterForm />
    </>
  );
}
