'use client';

import { useState, useTransition } from 'react';
import { changePasswordAction } from '@/app/(member)/actions';
import { PasswordInput } from '@/components/auth/auth-forms';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';

/** For a signed-in trainee: choose her own password (needs the current one, which may be the coach's temporary one). */
export function ChangePasswordForm() {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = new FormData(form);
        setError(undefined);
        startTransition(async () => {
          const result = await changePasswordAction({
            currentPassword: String(data.get('currentPassword') ?? ''),
            newPassword: String(data.get('newPassword') ?? ''),
          });
          if (result.ok) {
            form.reset();
            toast.success('הסיסמה עודכנה');
          } else {
            setError(result.error);
          }
        });
      }}
    >
      <Field label="סיסמה נוכחית" hint="אם קיבלת סיסמה זמנית מהצוות, זו הסיסמה הנוכחית.">
        {(p) => <PasswordInput id={p.id} name="currentPassword" autoComplete="current-password" describedBy={p['aria-describedby']} />}
      </Field>
      <Field label="סיסמה חדשה" hint="לפחות 8 תווים" error={error}>
        {(p) => (
          <PasswordInput
            id={p.id}
            name="newPassword"
            autoComplete="new-password"
            invalid={Boolean(error)}
            describedBy={p['aria-describedby']}
          />
        )}
      </Field>
      <Button type="submit" loading={pending} className="self-start">
        שינוי סיסמה
      </Button>
    </form>
  );
}
