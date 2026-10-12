'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  forgotPasswordAction,
  loginAction,
  registerAction,
  resetPasswordAction,
  type AuthFormState,
} from '@/app/(auth)/actions';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/form';

const initial: AuthFormState = {};

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" loading={pending} className="w-full">
      {children}
    </Button>
  );
}

export function LoginForm({ next, notice }: { next?: string; notice?: 'link' }) {
  const [state, action] = useActionState(loginAction, initial);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {notice === 'link' ? <Alert tone="amber">הקישור אינו תקף או שפג תוקפו. נסי שוב.</Alert> : null}
      {state.error ? <Alert tone="red">{state.error}</Alert> : null}
      <input type="hidden" name="next" value={next ?? '/'} />
      <Field label="אימייל">
        {(p) => <Input {...p} name="email" type="email" autoComplete="email" inputMode="email" dir="ltr" required className="text-start" />}
      </Field>
      <Field label="סיסמה">
        {(p) => <Input {...p} name="password" type="password" autoComplete="current-password" dir="ltr" required className="text-start" />}
      </Field>
      <Submit>התחברות</Submit>
      <div className="flex flex-col items-center gap-2 text-small text-muted">
        <Link href="/forgot-password" className="font-medium text-navy-900 underline underline-offset-4">
          שכחתי סיסמה
        </Link>
        <span>
          עדיין לא רשומה?{' '}
          <Link href="/register" className="font-semibold text-pink-700 underline underline-offset-4">
            הרשמה לקהילה
          </Link>
        </span>
      </div>
    </form>
  );
}

export function RegisterForm() {
  const [state, action] = useActionState(registerAction, initial);

  if (state.success === 'confirm_email') {
    return (
      <Alert tone="green" title="כמעט סיימנו!">
        שלחנו לך אימייל לאישור הכתובת. לאחר האישור תוכלי להתחבר, והמאמנת תאשר את הצטרפותך לקהילה.
      </Alert>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <Alert tone="red">{state.error}</Alert> : null}
      <Field label="שם מלא">
        {(p) => <Input {...p} name="fullName" autoComplete="name" required />}
      </Field>
      <Field label="טלפון" hint="המאמנת תשתמש בו ליצירת קשר">
        {(p) => <Input {...p} name="phone" type="tel" autoComplete="tel" inputMode="tel" dir="ltr" required className="text-start" />}
      </Field>
      <Field label="אימייל">
        {(p) => <Input {...p} name="email" type="email" autoComplete="email" inputMode="email" dir="ltr" required className="text-start" />}
      </Field>
      <Field label="סיסמה" hint="לפחות 8 תווים">
        {(p) => <Input {...p} name="password" type="password" autoComplete="new-password" dir="ltr" minLength={8} required className="text-start" />}
      </Field>
      <Submit>יצירת חשבון</Submit>
      <p className="text-center text-small text-muted">
        כבר רשומה?{' '}
        <Link href="/login" className="font-semibold text-pink-700 underline underline-offset-4">
          התחברות
        </Link>
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(forgotPasswordAction, initial);

  if (state.success === 'reset_sent') {
    return (
      <Alert tone="green" title="נשלח">
        אם הכתובת רשומה אצלנו, נשלח אליה קישור לאיפוס הסיסמה.
      </Alert>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <Alert tone="red">{state.error}</Alert> : null}
      <Field label="אימייל">
        {(p) => <Input {...p} name="email" type="email" autoComplete="email" inputMode="email" dir="ltr" required className="text-start" />}
      </Field>
      <Submit>שליחת קישור לאיפוס</Submit>
      <Link href="/login" className="text-center text-small font-medium text-navy-900 underline underline-offset-4">
        חזרה להתחברות
      </Link>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useActionState(resetPasswordAction, initial);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <Alert tone="red">{state.error}</Alert> : null}
      <Field label="סיסמה חדשה" hint="לפחות 8 תווים">
        {(p) => <Input {...p} name="password" type="password" autoComplete="new-password" dir="ltr" minLength={8} required className="text-start" />}
      </Field>
      <Submit>עדכון סיסמה</Submit>
    </form>
  );
}
