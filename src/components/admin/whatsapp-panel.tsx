'use client';

import { useState } from 'react';
import { Button, buttonClasses } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { whatsappShareUrl } from '@/lib/domain/whatsapp';

/** Lets the admin copy / share the weekly announcement. (No WhatsApp API: it is pasted into the group.) */
export function WhatsAppPanel({ message, link }: { message: string; link: string }) {
  const [text, setText] = useState(message);
  const toast = useToast();

  async function copy(value: string, okMessage: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(okMessage);
    } catch {
      toast.error('לא הצלחנו להעתיק. אפשר לסמן ולהעתיק ידנית.');
    }
  }

  return (
    <Card tone="blue" className="flex flex-col gap-3">
      <div>
        <h2 className="text-card font-bold">הודעת וואטסאפ לקבוצה</h2>
        <p className="text-small text-muted">אפשר לערוך את הנוסח, להעתיק ולהדביק בקבוצה.</p>
      </div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={7}
        aria-label="נוסח ההודעה"
        className="text-small leading-relaxed"
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => copy(text, 'ההודעה הועתקה')}>
          העתקת הודעה
        </Button>
        <Button size="sm" variant="secondary" onClick={() => copy(link, 'הקישור הועתק')}>
          העתקת קישור בלבד
        </Button>
        <a href={whatsappShareUrl(text)} target="_blank" rel="noopener noreferrer" className={buttonClasses('secondary', 'sm')}>
          פתיחה בוואטסאפ
        </a>
      </div>
    </Card>
  );
}
