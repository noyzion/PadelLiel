'use server';

import { redirect } from 'next/navigation';
import { getAppUrl } from '@/lib/env';
import { safeNext } from '@/lib/safe-redirect';
import { createClient } from '@/lib/supabase/server';
import {
  firstIssueMessage,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '@/lib/validation/schemas';

export interface AuthFormState {
  error?: string;
  success?: 'confirm_email' | 'reset_sent' | 'password_updated';
}

export async function loginAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({ email: formData.get('email'), password: formData.get('password') });
  if (!parsed.success) return { error: firstIssueMessage(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (/confirm/i.test(error.message)) return { error: 'יש לאשר את כתובת האימייל דרך הקישור שנשלח אלייך.' };
    return { error: 'אימייל או סיסמה שגויים.' };
  }
  redirect(safeNext(formData.get('next')));
}

export async function registerAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = registerSchema.safeParse({
    fullName: formData.get('fullName'),
    phone: formData.get('phone'),
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) return { error: firstIssueMessage(parsed.error) };

  const { fullName, phone, email, password } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, phone },
      emailRedirectTo: `${getAppUrl()}/auth/callback?next=/`,
    },
  });

  if (error) {
    if (/registered|already/i.test(error.message)) return { error: 'כתובת האימייל כבר רשומה. נסי להתחבר.' };
    if (/password/i.test(error.message)) return { error: 'הסיסמה חלשה מדי. בחרי סיסמה ארוכה וייחודית יותר.' };
    return { error: 'ההרשמה נכשלה. נסי שוב בעוד רגע.' };
  }

  // When e-mail confirmation is enabled in Supabase there is no session yet.
  if (!data.session) return { success: 'confirm_email' };
  redirect('/pending');
}

export async function forgotPasswordAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) return { error: firstIssueMessage(parsed.error) };

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${getAppUrl()}/auth/callback?next=/reset-password`,
  });
  // Always report success so the form can't be used to discover which e-mails are registered.
  return { success: 'reset_sent' };
}

export async function resetPasswordAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = resetPasswordSchema.safeParse({ password: formData.get('password') });
  if (!parsed.success) return { error: firstIssueMessage(parsed.error) };

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return { error: 'הקישור פג תוקף. בקשי קישור חדש.' };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: 'לא הצלחנו לעדכן את הסיסמה. נסי סיסמה אחרת.' };
  redirect('/');
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
