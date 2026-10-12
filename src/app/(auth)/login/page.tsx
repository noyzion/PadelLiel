import type { Metadata } from 'next';
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
      <h1 className="mb-5 text-title font-semibold">ברוכה הבאה</h1>
      <LoginForm next={next} notice={error === 'link' ? 'link' : undefined} />
    </>
  );
}
