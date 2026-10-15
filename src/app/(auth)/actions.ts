'use server';

import type { AuthError } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import type { ZodError } from 'zod';
import { safeNext } from '@/lib/safe-redirect';
import { createClient } from '@/lib/supabase/server';
import { loginSchema, registerSchema } from '@/lib/validation/schemas';

export type AuthField = 'fullName' | 'phone' | 'password';

export interface AuthFormState {
  /** A message about the form as a whole (wrong password, service unavailable...). */
  error?: string;
  /** Messages that belong under one specific input. */
  fieldErrors?: Partial<Record<AuthField, string>>;
  /**
   * What was typed (never a password), so the form can show it again: React clears an uncontrolled form after
   * every action, which would otherwise wipe the name and phone whenever an error is shown.
   */
  values?: { fullName?: string; phone?: string };
}

function field(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

/** The first message for each input, keyed by the input's name. */
function fieldErrorsOf(error: ZodError): Partial<Record<AuthField, string>> {
  const result: Partial<Record<AuthField, string>> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && !(key in result)) result[key as AuthField] = issue.message;
  }
  return result;
}

const RATE_LIMITED = 'בוצעו יותר מדי ניסיונות. נסי שוב בעוד כמה דקות.';
const TRY_LATER = 'ההרשמה אינה זמינה כרגע. נסי שוב בעוד רגע.';
// Deliberately says the same thing whether or not the number is already registered, and never confirms which.
const COULD_NOT_REGISTER = 'לא הצלחנו להשלים את ההרשמה. אם כבר נרשמת בעבר, נסי להתחבר עם אותו מספר.';

function isRateLimited(error: AuthError): boolean {
  return error.status === 429 || error.code === 'over_request_rate_limit' || error.code === 'over_sms_send_rate_limit';
}

export async function loginAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const values = { phone: field(formData, 'phone') };
  const parsed = loginSchema.safeParse({ phone: formData.get('phone'), password: formData.get('password') });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error), values };

  const { phone, password } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ phone, password });
  if (error) {
    if (isRateLimited(error)) return { error: RATE_LIMITED, values };
    // The same answer for "no such account" and "wrong password".
    return { error: 'מספר הטלפון או הסיסמה שגויים.', values };
  }
  redirect(safeNext(formData.get('next')));
}

/**
 * Trainee registration: full name, Israeli mobile number and password. Uses Supabase Auth's native phone + password
 * sign-up. This only works when the project has the Phone provider enabled with "Enable phone confirmations" OFF
 * (no SMS is sent); see README. The profile row (a pending trainee) is created by a database trigger.
 */
export async function registerAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const values = { fullName: field(formData, 'fullName'), phone: field(formData, 'phone') };
  const parsed = registerSchema.safeParse({
    fullName: formData.get('fullName'),
    phone: formData.get('phone'),
    password: formData.get('password'),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error), values };

  const { fullName, phone, password } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    phone,
    password,
    // Only the name travels as metadata. Role and approval can never come from here (the trigger ignores them).
    options: { data: { full_name: fullName } },
  });

  if (error) {
    if (error.code === 'weak_password') {
      const leaked = 'reasons' in error && Array.isArray(error.reasons) && error.reasons.includes('pwned');
      const message = leaked
        ? 'הסיסמה הזו מופיעה ברשימות סיסמאות שדלפו. בחרי סיסמה אחרת.'
        : 'הסיסמה חלשה מדי. בחרי סיסמה ארוכה וייחודית יותר.';
      return { fieldErrors: { password: message }, values };
    }
    if (isRateLimited(error)) return { error: RATE_LIMITED, values };
    if (error.code === 'user_already_exists' || error.code === 'phone_exists' || /already registered/i.test(error.message)) {
      return { error: COULD_NOT_REGISTER, values };
    }
    // Most likely a Supabase setting (Phone provider off, or SMS sending failing): tell the operator, not the user.
    console.error('[register] sign-up failed', { code: error.code, status: error.status });
    return { error: TRY_LATER, values };
  }

  // No session means the project still asks for a phone confirmation (an SMS code), which this flow does not use.
  if (!data.session) {
    console.error('[register] sign-up returned no session: turn OFF "Enable phone confirmations" in Supabase (Auth > Providers > Phone)');
    return { error: TRY_LATER, values };
  }
  redirect('/pending');
}

/** Used by the waiting screen to notice approval without the trainee having to refresh. */
export async function getApprovalStatusAction(): Promise<'approved' | 'pending' | 'rejected' | 'inactive' | 'signed_out'> {
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return 'signed_out';
  const { data: profile } = await db.from('profiles').select('approval_status').eq('id', userId).maybeSingle();
  const status = (profile as { approval_status?: string } | null)?.approval_status;
  if (status === 'approved' || status === 'rejected' || status === 'inactive' || status === 'pending') return status;
  return 'signed_out';
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
