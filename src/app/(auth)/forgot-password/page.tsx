import Link from 'next/link';
import type { Metadata } from 'next';
import { AuthHeading } from '@/components/auth/auth-heading';
import { ButtonLink } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { getCoachWhatsAppNumber } from '@/lib/env';
import { normalizeIsraeliMobile } from '@/lib/phone';

export const metadata: Metadata = { title: 'שכחתי סיסמה' };

/** wa.me link to the coach, with a short opening message. Null when no (valid) number is configured. */
function coachWhatsAppUrl(): string | null {
  const configured = getCoachWhatsAppNumber();
  const e164 = configured ? normalizeIsraeliMobile(configured) : null;
  if (!e164) return null;
  const text = 'היי, שכחתי את הסיסמה ואשמח לאיפוס.';
  return `https://wa.me/${e164.replace('+', '')}?text=${encodeURIComponent(text)}`;
}

export default function ForgotPasswordPage() {
  const whatsapp = coachWhatsAppUrl();

  return (
    <>
      <AuthHeading title="שכחת סיסמה?" />
      <div className="flex flex-col gap-5">
        <Alert tone="blue" title="הצוות יאפס לך את הסיסמה">
          פני אלינו, ואחרי שנוודא שזו את, נמסור לך סיסמה זמנית. היכנסי איתה ומיד בפרופיל בחרי סיסמה משלך.
        </Alert>
        {whatsapp ? (
          <ButtonLink href={whatsapp} target="_blank" rel="noopener noreferrer" size="lg" className="w-full">
            פנייה בוואטסאפ
          </ButtonLink>
        ) : null}
        <Link href="/login" className="text-center text-small font-medium text-navy-900 underline underline-offset-4">
          חזרה להתחברות
        </Link>
      </div>
    </>
  );
}
