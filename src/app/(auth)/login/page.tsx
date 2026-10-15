import type { Metadata } from 'next';
import { AuthHeading } from '@/components/auth/auth-heading';
import { LoginForm } from '@/components/auth/auth-forms';

export const metadata: Metadata = { title: 'התחברות' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  return (
    <>
      <AuthHeading title="ברוכה הבאה">התחברי עם מספר הטלפון והסיסמה שלך.</AuthHeading>
      <LoginForm next={next} notice={error === 'link' ? 'link' : undefined} />
    </>
  );
}
