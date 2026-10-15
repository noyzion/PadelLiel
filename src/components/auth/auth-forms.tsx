'use client';

import { Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  loginAction,
  registerAction,
  type AuthFormState,
} from '@/app/(auth)/actions';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/form';

const initial: AuthFormState = {};

const linkClass = 'font-semibold text-pink-700 underline underline-offset-4';
const quietLinkClass = 'font-medium text-navy-900 underline underline-offset-4';

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" loading={pending} className="w-full">
      {children}
    </Button>
  );
}

/** A password box with a show/hide switch (typing a password on a phone without seeing it is the top cause of typos). */
export function PasswordInput({
  id,
  name = 'password',
  autoComplete,
  invalid,
  describedBy,
}: {
  id: string;
  name?: string;
  autoComplete: 'current-password' | 'new-password';
  invalid?: boolean;
  describedBy?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        name={name}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        dir="ltr"
        required
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className="pe-12 text-start"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'הסתרת הסיסמה' : 'הצגת הסיסמה'}
        aria-pressed={visible}
        className="absolute inset-y-0 end-0 grid w-12 place-items-center rounded-control text-muted transition-colors hover:text-navy-900"
      >
        {visible ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
      </button>
    </div>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(loginAction, initial);
  const fe = state.fieldErrors ?? {};

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="next" value={next ?? '/'} />

      <Field label="מספר טלפון" error={fe.phone}>
        {(p) => (
          <Input
            {...p}
            name="phone"
            type="tel"
            autoComplete="username"
            inputMode="tel"
            enterKeyHint="next"
            placeholder="050-123-4567"
            dir="ltr"
            required
            defaultValue={state.values?.phone}
            className="text-start"
          />
        )}
      </Field>

      <Field label="סיסמה" error={fe.password}>
        {(p) => <PasswordInput id={p.id} autoComplete="current-password" invalid={Boolean(fe.password)} describedBy={p['aria-describedby']} />}
      </Field>

      {state.error ? <Alert tone="red">{state.error}</Alert> : null}
      <Submit>התחברות</Submit>

      <div className="flex flex-col items-center gap-3 text-small text-muted">
        <Link href="/forgot-password" className={quietLinkClass}>
          שכחתי סיסמה
        </Link>
        <span>
          עדיין לא נרשמת?{' '}
          <Link href="/register" className={linkClass}>
            הצטרפות לקהילה
          </Link>
        </span>
      </div>
    </form>
  );
}

export function RegisterForm() {
  const [state, action] = useActionState(registerAction, initial);
  const fe = state.fieldErrors ?? {};

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <Field label="שם מלא" error={fe.fullName}>
        {(p) => (
          <Input
            {...p}
            name="fullName"
            autoComplete="name"
            enterKeyHint="next"
            required
            defaultValue={state.values?.fullName}
          />
        )}
      </Field>

      <Field label="מספר טלפון" hint="מספר נייד ישראלי. בעזרתו תתחברי בפעמים הבאות." error={fe.phone}>
        {(p) => (
          <Input
            {...p}
            name="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            enterKeyHint="next"
            placeholder="050-123-4567"
            dir="ltr"
            required
            defaultValue={state.values?.phone}
            className="text-start"
          />
        )}
      </Field>

      <Field label="סיסמה" hint="לפחות 8 תווים" error={fe.password}>
        {(p) => <PasswordInput id={p.id} autoComplete="new-password" invalid={Boolean(fe.password)} describedBy={p['aria-describedby']} />}
      </Field>

      {state.error ? <Alert tone="red">{state.error}</Alert> : null}
      <Submit>הצטרפות לקהילה</Submit>

      <p className="text-center text-small text-muted">
        כבר יש לך חשבון?{' '}
        <Link href="/login" className={linkClass}>
          התחברי
        </Link>
      </p>
    </form>
  );
}
