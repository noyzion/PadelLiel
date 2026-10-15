import type { Metadata } from 'next';
import Link from 'next/link';
import { ImportAnnualEventsButton } from '@/components/admin/event-import';
import { BackLink } from '@/components/admin/session-panels';
import { Alert, Badge, PageHeader } from '@/components/ui/card';
import { IMPORT_ACTION_LABEL_HE, type ImportAction } from '@/lib/domain/event-import';
import { EVENT_TIME_TBA_HE } from '@/lib/domain/events';
import { isEventImportEnabled } from '@/lib/env';
import type { Tone } from '@/lib/domain/labels';
import { formatEventDatesHe } from '@/lib/time';
import { requireAdmin } from '@/server/auth';
import { previewAnnualImport } from '@/server/services/event-import';

export const metadata: Metadata = { title: 'ייבוא אירועי שנה' };

const ACTION_TONE: Record<ImportAction, Tone> = { CREATE: 'green', SKIP_SAME_KEY: 'neutral', SKIP_SIMILAR: 'amber' };

/**
 * Dry run of the annual community-events import. Read-only: it lists the 12 planned drafts and any events that
 * already match; nothing is written until an admin confirms (and the server operator has enabled the import).
 */
export default async function ImportEventsPage() {
  const { db } = await requireAdmin();
  const { rows, summary, schemaReady, sourceErrors } = await previewAnnualImport(db);
  const enabled = isEventImportEnabled() && schemaReady && sourceErrors.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <BackLink href="/admin/events">חזרה לאירועים</BackLink>
        <PageHeader
          title="ייבוא אירועי השנה"
          description="בדיקה מקדימה (Dry run): כך ייווצרו האירועים מהפלייר השנתי. עדיין לא נשמר דבר."
        />
      </div>

      <Alert tone="blue" title="מה יקרה בייבוא">
        כל האירועים נוצרים כ<strong>טיוטות</strong> בלבד ואינם מוצגים למתאמנות עד שתפרסמי כל אחד בנפרד. התאריכים והתיאורים נלקחים
        כפי שהם בפלייר; הפלייר לא כולל שעות או תמונות, ולכן אין כאלה. אירוע שכבר קיים לא ישונה ולא יוכפל, והאירועים הם הודעות לקריאה
        בלבד, ללא הרשמה או תשלום.
      </Alert>

      {sourceErrors.length > 0 ? (
        <Alert tone="red" title="קובץ האירועים אינו תקין">
          <ul className="list-disc ps-5">
            {sourceErrors.map((e) => (
              <li key={e} dir="auto">
                {e}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {!schemaReady ? (
        <Alert tone="amber" title="מסד הנתונים עדיין לא מוכן">
          יש להחיל תחילה את המיגרציה <bdi className="num">20261014000012_community_events_date_only_drafts.sql</bdi>. עד אז אי אפשר להתאים אירועים קיימים
          או לייבא.
        </Alert>
      ) : null}

      {schemaReady && !isEventImportEnabled() ? (
        <Alert tone="amber" title="הכתיבה כבויה בסביבה זו">
          הבדיקה המקדימה זמינה, אך הייבוא עצמו חסום עד שמפעילת השרת מגדירה <bdi className="num">ALLOW_EVENT_IMPORT=1</bdi>, לאחר אישור מפורש.
        </Alert>
      ) : null}

      <p className="text-small text-muted">
        <span className="num">{summary.total}</span> אירועים בקובץ (<span className="num">{summary.singleDay}</span> ביום אחד,{' '}
        <span className="num">{summary.multiDay}</span> רב־יומי) · ייווצרו <span className="num">{summary.create}</span> · יידלגו{' '}
        <span className="num">{summary.skipSameKey + summary.skipSimilar}</span>
      </p>

      <ul className="flex flex-col gap-3">
        {rows.map(({ event, action, match }) => {
          const when = formatEventDatesHe(event.dateStart, event.dateEnd);
          return (
            <li key={event.importKey} className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-card font-semibold text-navy-900">{event.title}</h3>
                <Badge tone="amber">טיוטה</Badge>
                <Badge tone="blue">{event.span === 'MULTI_DAY' ? 'רב־יומי' : 'יום אחד'}</Badge>
                <Badge tone={ACTION_TONE[action]}>{IMPORT_ACTION_LABEL_HE[action]}</Badge>
              </div>
              <p className="text-small font-semibold text-pink-700">
                <bdi>{when.date}</bdi>
                <span className="font-normal text-muted"> · {EVENT_TIME_TBA_HE}</span>
              </p>
              <p className="whitespace-pre-line text-small text-ink">{event.description}</p>
              <p className="text-caption text-muted">
                {event.location} · <bdi className="num">{event.importKey}</bdi>
              </p>
              {match ? (
                <p className="text-caption text-muted">
                  קיים כבר:{' '}
                  <Link href={`/admin/events/${match.id}`} className="font-semibold text-navy-900 underline underline-offset-4">
                    {match.title}
                  </Link>
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <ImportAnnualEventsButton createCount={summary.create} enabled={enabled} />
        <p className="text-caption text-muted">הייבוא יוצר טיוטות בלבד. אפשר להריץ אותו שוב בבטחה.</p>
      </div>
    </div>
  );
}
