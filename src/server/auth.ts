import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient, type Db } from '@/lib/supabase/server';
import { AppError } from '@/lib/domain/errors';
import type { Profile } from '@/lib/domain/types';

const PROFILE_COLUMNS = 'id, role, full_name, phone, email, approval_status, skill_level_code, created_at';

export interface AuthContext {
  db: Db;
  userId: string;
  profile: Profile;
}

/** The current user + profile (null when signed out). Memoised per request. */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;

  // Explicit columns: `admin_notes` is private to staff and not readable by the signed-in trainee.
  const { data: profile, error } = await db.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle();
  // The user IS signed in, so returning null ("signed out") would send her to /login, and the proxy sends a signed-in
  // user straight back to "/": an endless redirect loop. Fail loudly instead; the error page offers a logout.
  if (error) throw new AppError('INTERNAL', { cause: error });
  if (!profile) throw new AppError('MEMBER_NOT_FOUND');
  return { db, userId, profile: profile as Profile };
});

export async function requireUser(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  return ctx;
}

/** Approved trainee. Admins are sent to /admin, pending/rejected trainees to /pending. */
export async function requireMember(): Promise<AuthContext> {
  const ctx = await requireUser();
  if (ctx.profile.role === 'admin') redirect('/admin');
  if (ctx.profile.approval_status !== 'approved') redirect('/pending');
  return ctx;
}

/** Admin only. Everyone else is sent home. */
export async function requireAdmin(): Promise<AuthContext> {
  const ctx = await requireUser();
  if (ctx.profile.role !== 'admin' || ctx.profile.approval_status !== 'approved') redirect('/');
  return ctx;
}

/** For server actions: returns the context or throws a NOT_AUTHENTICATED/NOT_AUTHORIZED AppError. */
export async function actionContext(role: 'member' | 'admin' | 'any' = 'any'): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) throw new AppError('NOT_AUTHENTICATED');
  if (role === 'admin' && (ctx.profile.role !== 'admin' || ctx.profile.approval_status !== 'approved')) {
    throw new AppError('NOT_AUTHORIZED');
  }
  if (role === 'member' && (ctx.profile.role !== 'trainee' || ctx.profile.approval_status !== 'approved')) {
    throw new AppError('NOT_AUTHORIZED');
  }
  return ctx;
}
