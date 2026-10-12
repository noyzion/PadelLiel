import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Brand } from '@/components/brand';
import { Alert, Card } from '@/components/ui/card';
import { isSupabaseConfigured } from '@/lib/env';

export const metadata: Metadata = { title: 'הגדרת המערכת' };

export default function SetupPage() {
  if (isSupabaseConfigured()) redirect('/');
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-5 px-5 py-10">
      <Brand />
      <Alert tone="amber" title="המערכת עדיין לא חוברה ל-Supabase">
        חסרים משתני סביבה. עד שיוגדרו, האפליקציה לא יכולה להתחבר למסד הנתונים.
      </Alert>
      <Card className="space-y-3 text-small">
        <p className="font-semibold">מה לעשות:</p>
        <ol className="list-decimal space-y-2 ps-5">
          <li>
            צרי פרויקט ב-Supabase והריצי את קבצי ה-SQL שבתיקייה <code dir="ltr">supabase/migrations</code> לפי הסדר.
          </li>
          <li>
            העתיקי את <code dir="ltr">.env.example</code> ל-<code dir="ltr">.env.local</code> ומלאי:
            <ul className="mt-1 space-y-1" dir="ltr">
              <li><code>NEXT_PUBLIC_SUPABASE_URL</code></li>
              <li><code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code></li>
              <li><code>NEXT_PUBLIC_APP_URL</code></li>
            </ul>
          </li>
          <li>הפעילי מחדש את שרת הפיתוח.</li>
        </ol>
        <p className="text-muted">הוראות מלאות נמצאות ב-README.md.</p>
      </Card>
    </main>
  );
}
