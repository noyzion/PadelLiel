'use client';

import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface DayTab {
  date: string;
  /** "ראשון" */
  weekday: string;
  /** Day of the month, e.g. "18" */
  dayNumber: string;
  /** "18.10" */
  dayMonth: string;
  sessionCount: number;
  isToday: boolean;
  /** The server-rendered session cards for this day. */
  content: ReactNode;
}

/**
 * Remaining days of the viewed week as tabs (today onward on the current week).
 * Picking a day shows only that day's sessions. Selection is local state, so switching is instant.
 * Remount with `key={weekStart}` when the week changes so the default day is recomputed.
 */
export function DayTabs({ days, defaultDate }: { days: DayTab[]; defaultDate: string }) {
  const [selected, setSelected] = useState(defaultDate);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const select = (index: number) => {
    const day = days[index];
    if (!day) return;
    setSelected(day.date);
    tabRefs.current[index]?.focus();
  };

  // The app is RTL: the first tab sits on the right, so ArrowLeft goes to the next day.
  const onKeyDown = (event: KeyboardEvent, index: number) => {
    if (event.key === 'ArrowLeft') select(Math.min(index + 1, days.length - 1));
    else if (event.key === 'ArrowRight') select(Math.max(index - 1, 0));
    else if (event.key === 'Home') select(0);
    else if (event.key === 'End') select(days.length - 1);
    else return;
    event.preventDefault();
  };

  const active = days.find((d) => d.date === selected) ?? days[0];
  if (!active) return null;

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label="ימי השבוע"
        className="grid gap-1 rounded-card border border-line bg-surface p-1.5 shadow-soft"
        style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
      >
        {days.map((day, index) => {
          const isSelected = day.date === active.date;
          const empty = day.sessionCount === 0;
          return (
            <button
              key={day.date}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${day.date}`}
              aria-selected={isSelected}
              aria-controls={`panel-${day.date}`}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => setSelected(day.date)}
              onKeyDown={(e) => onKeyDown(e, index)}
              className={cn(
                'flex min-h-[4.5rem] min-w-0 flex-col items-center justify-center gap-0.5 rounded-control px-0.5 py-2 transition-colors duration-150 select-none focus-visible:outline-3',
                isSelected ? 'bg-navy-900 text-white' : 'text-navy-900 hover:bg-navy-50 active:bg-navy-100',
                !isSelected && empty && 'text-muted',
              )}
            >
              <span className={cn('text-caption font-semibold', isSelected ? 'text-white/85' : day.isToday ? 'text-pink-700' : 'text-muted')}>
                {day.weekday}
              </span>
              <span className="num text-card font-semibold leading-none">{day.dayNumber}</span>
              <span
                aria-hidden="true"
                className={cn(
                  'mt-1 size-1.5 rounded-full',
                  empty ? 'bg-transparent' : isSelected ? 'bg-pink-200' : 'bg-pink-500',
                )}
              />
              <span className="sr-only">
                {day.isToday ? 'היום, ' : ''}
                {empty ? 'אין אימונים' : `${day.sessionCount} אימונים`}
              </span>
            </button>
          );
        })}
      </div>

      {days.map((day) => (
        <section
          key={day.date}
          role="tabpanel"
          id={`panel-${day.date}`}
          aria-labelledby={`tab-${day.date}`}
          hidden={day.date !== active.date}
          className="flex flex-col gap-3"
        >
          <h2 className="flex items-baseline gap-2 text-card font-semibold">
            <span>יום {day.weekday}</span>
            <span className="text-small font-medium text-muted">{day.dayMonth}</span>
            {day.isToday ? <span className="text-small font-semibold text-pink-700">היום</span> : null}
          </h2>
          {day.sessionCount === 0 ? (
            <p className="rounded-card border border-dashed border-line-strong bg-surface px-4 py-8 text-center text-small text-muted">
              אין אימונים ביום הזה
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{day.content}</div>
          )}
        </section>
      ))}
    </div>
  );
}
