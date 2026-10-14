/**
 * Offline dry run of the annual community-events import.
 *
 *   npm run events:import:dry-run
 *   npm run events:import:dry-run -- --existing existing-events.json
 *
 * Validates data/padelliel_annual_events_2026_2027.json and prints every record that WOULD be created (as a date-only
 * DRAFT: no time, no image). It makes NO database connection and needs no credentials, so it can never write anything.
 *
 * Matches against what is already stored in the database are computed live by the admin page /admin/events/import (read-only,
 * under the admin's own session). To simulate matches here, pass `--existing <file>`: a JSON array of
 * { id, import_key, title, status, starts_at, date_start } rows (e.g. exported from the events list).
 *
 * Actually writing is only possible from that admin page, behind an explicit confirmation and ALLOW_EVENT_IMPORT=1.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  IMPORT_ACTION_LABEL_HE,
  matchPlan,
  parseAnnualEvents,
  planAnnualEvents,
  summarizePlan,
  toInsertRow,
  type ExistingEventRef,
} from '../src/lib/domain/event-import';
import { formatEventDatesHe } from '../src/lib/time';

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'data', 'padelliel_annual_events_2026_2027.json');

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function main(): number {
  const args = process.argv.slice(2);
  const existingIdx = args.indexOf('--existing');
  const existing: ExistingEventRef[] = existingIdx >= 0 ? (readJson(path.resolve(args[existingIdx + 1] ?? '')) as ExistingEventRef[]) : [];

  const parsed = parseAnnualEvents(readJson(sourcePath));
  if (!parsed.ok) {
    console.error('The source file is not valid:');
    for (const e of parsed.errors) console.error(`  - ${e}`);
    return 1;
  }

  const rows = matchPlan(planAnnualEvents(parsed.events), existing);
  console.log('DRY RUN - nothing is written and no database connection is made.\n');
  rows.forEach(({ event, action, match }, i) => {
    const when = formatEventDatesHe(event.dateStart, event.dateEnd);
    console.log(`${String(i + 1).padStart(2)}. [${action}] ${IMPORT_ACTION_LABEL_HE[action]}`);
    console.log(`    ${event.importKey}  |  ${event.title}  |  ${event.span === 'MULTI_DAY' ? 'multi-day' : 'single day'}`);
    console.log(`    ${event.dateStart}${event.dateEnd ? ` -> ${event.dateEnd}` : ''}  (${when.date})  | no time | DRAFT | no image`);
    console.log(`    insert: ${JSON.stringify(toInsertRow(event))}`);
    if (match) console.log(`    match : ${match.id} "${match.title}" (key: ${match.import_key ?? 'none'}, ${match.status})`);
  });

  const s = summarizePlan(rows);
  console.log(
    `\n${s.total} events (${s.singleDay} single-day, ${s.multiDay} multi-day): ${s.create} would be created, ` +
      `${s.skipSameKey} skipped (same import key), ${s.skipSimilar} skipped (same title and date).`,
  );
  if (existingIdx < 0) {
    console.log('Matches with the live database were NOT checked (offline). Open /admin/events/import to see them.');
  }
  return 0;
}

process.exit(main());
