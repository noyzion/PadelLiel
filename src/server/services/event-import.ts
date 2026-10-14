import 'server-only';
import type { Db } from '@/lib/supabase/server';
import { AppError, toAppError } from '@/lib/domain/errors';
import {
  matchPlan,
  parseAnnualEvents,
  planAnnualEvents,
  summarizePlan,
  toInsertRow,
  type ExistingEventRef,
  type PlanRow,
  type PlanSummary,
} from '@/lib/domain/event-import';
import annualSource from '../../../data/padelliel_annual_events_2026_2027.json';

/**
 * Annual community-events import. Runs under the signed-in admin's own session (RLS applies; no privileged
 * key is involved). It only ever INSERTS draft rows: it never updates, upserts or deletes, so existing
 * events and staff edits are untouched, and re-running it cannot create duplicates (unique `import_key`, plus
 * a same-title-same-date check for events created by hand).
 */

export interface ImportPreview {
  /** False until the migration that adds `import_key` / `date_start` / `date_end` has been applied. */
  schemaReady: boolean;
  /** Problems with the source file itself (the plan is empty when there are any). */
  sourceErrors: string[];
  rows: PlanRow[];
  summary: PlanSummary;
}

const EXISTING_COLUMNS = 'id, import_key, title, status, starts_at, date_start';

function isMissingColumn(error: { code?: string; message?: string }): boolean {
  return error.code === '42703' || /import_key|date_start/.test(error.message ?? '');
}

/** Read-only: what an import would do right now. Writes nothing. */
export async function previewAnnualImport(db: Db): Promise<ImportPreview> {
  const parsed = parseAnnualEvents(annualSource);
  if (!parsed.ok) {
    return { schemaReady: true, sourceErrors: parsed.errors, rows: [], summary: summarizePlan([]) };
  }
  const planned = planAnnualEvents(parsed.events);

  const { data, error } = await db.from('community_events').select(EXISTING_COLUMNS).order('id');
  if (error) {
    if (isMissingColumn(error)) {
      // The migration has not been applied: show the plan, but nothing can be matched or written yet.
      const rows = matchPlan(planned, []);
      return { schemaReady: false, sourceErrors: [], rows, summary: summarizePlan(rows) };
    }
    throw toAppError(error);
  }

  const rows = matchPlan(planned, (data ?? []) as ExistingEventRef[]);
  return { schemaReady: true, sourceErrors: [], rows, summary: summarizePlan(rows) };
}

export interface ImportResult {
  created: number;
  skipped: number;
}

/**
 * Creates the missing drafts (and only those). The plan is recomputed here from the database, never taken from the
 * client. Safe to run again: matched events are skipped, and a concurrent duplicate is rejected by the unique key.
 */
export async function applyAnnualImport(db: Db): Promise<ImportResult> {
  const preview = await previewAnnualImport(db);
  if (preview.sourceErrors.length > 0) {
    throw new AppError('INVALID_INPUT', { userMessage: 'קובץ האירועים אינו תקין. ראי את תוצאות הבדיקה.' });
  }
  if (!preview.schemaReady) {
    throw new AppError('INVALID_INPUT', {
      userMessage: 'מסד הנתונים עדיין לא עודכן לתמיכה בטיוטות ללא שעה. יש להחיל את המיגרציה לפני הייבוא.',
    });
  }

  let created = 0;
  let skipped = preview.rows.length - preview.summary.create;
  for (const row of preview.rows) {
    if (row.action !== 'CREATE') continue;
    const { error } = await db.from('community_events').insert(toInsertRow(row.event));
    if (!error) {
      created += 1;
    } else if (error.code === '23505') {
      skipped += 1; // created in the meantime by someone else: the unique import key kept it single
    } else {
      throw new AppError('INTERNAL', {
        cause: error,
        userMessage: `הייבוא נעצר אחרי ${created} אירועים. אפשר להריץ שוב בבטחה, אירועים שכבר נוצרו לא יוכפלו.`,
      });
    }
  }
  return { created, skipped };
}
