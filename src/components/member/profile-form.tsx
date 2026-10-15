'use client';

import { useState, useTransition } from 'react';
import { updateProfileAction } from '@/app/(member)/actions';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';

/**
 * `email` is empty for an account that signs in with its phone number. That number is the login, so it is shown but
 * cannot be edited here; accounts with an e-mail address keep an editable contact phone.
 */
export function ProfileForm({ fullName, phone, email }: { fullName: string; phone: string; email: string }) {
  const phoneIsLogin = !email;
  const [name, setName] = useState(fullName);
  const [tel, setTel] = useState(phone);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(undefined);
        startTransition(async () => {
          const result = await updateProfileAction(phoneIsLogin ? { fullName: name } : { fullName: name, phone: tel });
          if (result.ok) toast.success('הפרופיל עודכן');
          else setError(result.error);
        });
      }}
    >
      <Field label="שם מלא" error={error}>
        {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />}
      </Field>
      {phoneIsLogin ? (
        <Field label="מספר טלפון" hint="זה המספר שבו את מתחברת. לשינוי המספר פני אלינו">
          {(p) => <Input {...p} value={tel} dir="ltr" className="text-start" readOnly disabled />}
        </Field>
      ) : (
        <>
          <Field label="טלפון">
            {(p) => <Input {...p} value={tel} onChange={(e) => setTel(e.target.value)} type="tel" dir="ltr" className="text-start" autoComplete="tel" required />}
          </Field>
          <Field label="אימייל" hint="לשינוי כתובת האימייל פני לצוות שלנו">
            {(p) => <Input {...p} value={email} dir="ltr" className="text-start" readOnly disabled />}
          </Field>
        </>
      )}
      <Button type="submit" loading={pending} className="self-start">
        שמירה
      </Button>
    </form>
  );
}
