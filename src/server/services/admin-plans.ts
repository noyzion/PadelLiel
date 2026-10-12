import 'server-only';
import type { Db } from '@/lib/supabase/server';
import type { SubscriptionPlan } from '@/lib/domain/types';
import { unwrap } from '../rpc';

export async function listPlans(db: Db, opts: { onlyActive?: boolean } = {}): Promise<SubscriptionPlan[]> {
  let query = db.from('subscription_plans').select('*').order('weekly_session_limit').order('name');
  if (opts.onlyActive) query = query.eq('is_active', true);
  return unwrap(await query) as SubscriptionPlan[];
}

export async function savePlan(
  db: Db,
  p: { id?: string; name: string; weeklyLimit: number; description?: string; isActive: boolean },
) {
  const values = {
    name: p.name,
    weekly_session_limit: p.weeklyLimit,
    description: p.description ?? null,
    is_active: p.isActive,
  };
  if (p.id) {
    unwrap(await db.from('subscription_plans').update(values).eq('id', p.id).select('id').single());
  } else {
    unwrap(await db.from('subscription_plans').insert(values).select('id').single());
  }
}
