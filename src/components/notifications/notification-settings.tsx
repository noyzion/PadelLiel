'use client';

import { BellOff, BellRing, Share, SquarePlus, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  deletePushSubscriptionAction,
  savePreferencesAction,
  savePushSubscriptionAction,
} from '@/app/(member)/notifications/actions';
import { Alert, Badge } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SwitchRow } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import type { NotificationPreferences } from '@/lib/domain/types';
import { usePushSupport } from '@/components/notifications/use-push-support';
import { urlBase64ToUint8Array, type PushSupportState } from '@/lib/push-support';

type PrefKey = keyof NotificationPreferences;
const PREF_TO_INPUT: Record<PrefKey, string> = {
  push_enabled: 'pushEnabled',
  training_reminders: 'trainingReminders',
  cancellation_deadline_reminders: 'cancellationDeadlineReminders',
  booking_updates: 'bookingUpdates',
  weekly_schedule: 'weeklySchedule',
};

const TYPE_SWITCHES: { key: PrefKey; label: string; description: string }[] = [
  { key: 'training_reminders', label: 'תזכורת לאימון', description: 'תזכורת 24 שעות לפני כל אימון שנרשמת אליו.' },
  { key: 'cancellation_deadline_reminders', label: 'תזכורת לפני סגירת הביטול', description: 'שעה לפני המועד האחרון לבטל בלי שהאימון ייחשב במכסה.' },
  { key: 'booking_updates', label: 'עדכוני הרשמה', description: 'אישור הרשמה, וביטול אימון על ידי הצוות.' },
  { key: 'weekly_schedule', label: 'פתיחת לוח אימונים', description: 'הודעה כשמערכת האימונים של השבוע הבא נפתחת להרשמה.' },
];

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration('/');
  return registration ? registration.pushManager.getSubscription() : null;
}

export function NotificationSettings({
  vapidPublicKey,
  preferences,
  deviceEndpoints,
}: {
  vapidPublicKey: string | null;
  preferences: NotificationPreferences;
  deviceEndpoints: string[];
}) {
  const toast = useToast();
  const [prefs, setPrefs] = useState(preferences);
  // Re-read on every render, so it follows the browser's permission (granted / denied) without extra state.
  const support = usePushSupport(Boolean(vapidPublicKey));
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  // Is THIS browser actually subscribed? Only asked once permission is already granted (never prompts).
  useEffect(() => {
    if (support !== 'granted') return;
    let cancelled = false;
    void (async () => {
      const sub = await currentSubscription();
      if (cancelled) return;
      setSubscribed(Boolean(sub));
      if (sub && !deviceEndpoints.includes(sub.endpoint)) {
        // The browser has a subscription the server lacks (e.g. cleared data): re-register it quietly.
        const json = sub.toJSON();
        if (json.endpoint && json.keys?.p256dh && json.keys.auth) {
          await savePushSubscriptionAction({ endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, userAgent: navigator.userAgent.slice(0, 300) });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [support, deviceEndpoints]);

  // Must be called from the click itself (Safari only allows the permission prompt inside a user gesture).
  const enable = async () => {
    if (!vapidPublicKey) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
      await navigator.serviceWorker.ready;
      const sub =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) }));
      const json = sub.toJSON();
      const result = await savePushSubscriptionAction({
        endpoint: json.endpoint,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
        userAgent: navigator.userAgent.slice(0, 300),
      });
      if (!result.ok) {
        await sub.unsubscribe();
        toast.error(result.error);
        return;
      }
      setSubscribed(true);
      setPrefs((p) => ({ ...p, push_enabled: true }));
      toast.success('ההתראות הופעלו במכשיר הזה');
    } catch {
      toast.error('לא הצלחנו להפעיל התראות במכשיר הזה. נסי שוב בעוד רגע.');
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const sub = await currentSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await deletePushSubscriptionAction({ endpoint });
      }
      setSubscribed(false);
      toast.success('ההתראות כובו במכשיר הזה');
    } catch {
      toast.error('לא הצלחנו לכבות את ההתראות. נסי שוב.');
    } finally {
      setBusy(false);
    }
  };

  const setPref = async (key: PrefKey, value: boolean) => {
    const previous = prefs[key];
    setPrefs((p) => ({ ...p, [key]: value }));
    const result = await savePreferencesAction({ [PREF_TO_INPUT[key]]: value });
    if (!result.ok) {
      setPrefs((p) => ({ ...p, [key]: previous }));
      toast.error(result.error);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <DeviceSection support={support} subscribed={subscribed} busy={busy} onEnable={enable} onDisable={disable} />

      <div className="border-t border-line pt-2">
        <SwitchRow
          label="התראות Push"
          description="שליחת התראות למכשירים שבהם הפעלת התראות. עדכונים חשובים נשמרים תמיד גם בפעמון."
          checked={prefs.push_enabled}
          onChange={(v) => void setPref('push_enabled', v)}
        />
      </div>
      <div className="flex flex-col divide-y divide-line border-t border-line">
        {TYPE_SWITCHES.map((s) => (
          <SwitchRow key={s.key} label={s.label} description={s.description} checked={prefs[s.key]} onChange={(v) => void setPref(s.key, v)} />
        ))}
      </div>
      <p className="text-caption text-muted">
        אישורי הרשמה וביטולי אימון נשמרים תמיד בפעמון. תזכורות ופתיחת לוח אימונים שכיבית לא יופיעו גם שם.
      </p>
    </div>
  );
}

function DeviceSection({
  support,
  subscribed,
  busy,
  onEnable,
  onDisable,
}: {
  support: PushSupportState | 'checking';
  subscribed: boolean;
  busy: boolean;
  onEnable: () => void;
  onDisable: () => void;
}) {
  if (support === 'checking') {
    return <div className="h-24 animate-pulse rounded-control bg-navy-50" aria-hidden="true" />;
  }

  if (support === 'ios-needs-install') {
    return (
      <Alert tone="blue" title="כדי לקבל התראות באייפון, הוסיפי את האפליקציה למסך הבית ואפשרי התראות.">
        <ol className="mt-2 flex flex-col gap-2 text-small">
          <li className="flex items-start gap-2">
            <Smartphone className="mt-0.5 size-4 shrink-0 text-ocean-700" aria-hidden="true" />
            <span>פתחי את האתר ב-Safari.</span>
          </li>
          <li className="flex items-start gap-2">
            <Share className="mt-0.5 size-4 shrink-0 text-ocean-700" aria-hidden="true" />
            <span>לחצי על כפתור השיתוף (הריבוע עם החץ כלפי מעלה).</span>
          </li>
          <li className="flex items-start gap-2">
            <SquarePlus className="mt-0.5 size-4 shrink-0 text-ocean-700" aria-hidden="true" />
            <span>בחרי ״הוספה למסך הבית״ ואשרי.</span>
          </li>
          <li className="flex items-start gap-2">
            <BellRing className="mt-0.5 size-4 shrink-0 text-ocean-700" aria-hidden="true" />
            <span>פתחי את האפליקציה מהאייקון במסך הבית, היכנסי לפרופיל ולחצי על ״הפעלת התראות״.</span>
          </li>
        </ol>
        <p className="mt-2 text-caption text-muted">נדרשת גרסת iOS 16.4 ומעלה.</p>
      </Alert>
    );
  }

  if (support === 'unconfigured') {
    return <Alert tone="neutral">התראות למכשיר עדיין לא הופעלו במערכת. את העדכונים אפשר לראות בפעמון.</Alert>;
  }

  if (support === 'unsupported') {
    return (
      <Alert tone="neutral" title="הדפדפן הזה לא תומך בהתראות Push">
        את העדכונים אפשר לראות בכל מקרה בפעמון שבראש הדף.
      </Alert>
    );
  }

  if (support === 'denied') {
    return (
      <Alert tone="amber" title="ההתראות חסומות בדפדפן">
        כדי לקבל התראות, אפשרי התראות לאתר בהגדרות הדפדפן או המכשיר, ורענני את הדף. בינתיים העדכונים מופיעים בפעמון.
      </Alert>
    );
  }

  if (support === 'granted' && subscribed) {
    // (`subscribed` can only be true while permission is granted.)
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-pink-100 text-pink-700" aria-hidden="true">
            <BellRing className="size-5" strokeWidth={1.6} />
          </span>
          <div>
            <p className="text-body font-semibold text-navy-900">התראות פעילות</p>
            <Badge tone="green">במכשיר הזה</Badge>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={onDisable} loading={busy}>
          <BellOff className="size-4" aria-hidden="true" />
          כיבוי במכשיר זה
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-pink-100 text-pink-700" aria-hidden="true">
          <BellRing className="size-5" strokeWidth={1.6} />
        </span>
        <div>
          <p className="text-body font-semibold text-navy-900">קבלי תזכורות ועדכונים לטלפון</p>
          <p className="text-small text-muted">תזכורת לפני האימון, עדכון על ביטול אימון ופתיחת לוח האימונים, גם כשהאפליקציה סגורה.</p>
        </div>
      </div>
      <Button onClick={onEnable} loading={busy} className="self-start">
        הפעלת התראות
      </Button>
    </div>
  );
}
