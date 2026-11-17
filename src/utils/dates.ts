import { addDays, differenceInCalendarDays, format, parseISO, startOfWeek } from 'date-fns';

export const toISO = (d: Date) => format(d, 'yyyy-MM-dd');
export const todayISO = () => toISO(new Date());
export const addDaysISO = (iso: string, n: number) => toISO(addDays(parseISO(iso), n));
export const daysUntil = (iso: string) => differenceInCalendarDays(parseISO(iso), new Date());

export function weekStartISO(iso: string, weekStart: 0 | 1): string {
  return toISO(startOfWeek(parseISO(iso), { weekStartsOn: weekStart }));
}

/** "Mon, Nov 17" */
export const dayLabel = (iso: string) => format(parseISO(iso), 'EEE, MMM d');
/** "Mon" */
export const shortDay = (iso: string) => format(parseISO(iso), 'EEE');
/** "Nov 17" */
export const shortDate = (iso: string) => format(parseISO(iso), 'MMM d');

/** A short, relative description of a date: "Today", "Tomorrow", "Fri", "Dec 3". */
export function relativeDay(iso: string): string {
  const d = daysUntil(iso);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d === -1) return 'Yesterday';
  if (d > 1 && d < 7) return shortDay(iso);
  return shortDate(iso);
}

export type Freshness = 'urgent' | 'soon' | 'ok' | 'none';

/** Expired or 1 day left = red, up to 3 days = amber, otherwise green. */
export function freshness(useBy: string | null): Freshness {
  if (!useBy) return 'none';
  const d = daysUntil(useBy);
  if (d <= 1) return 'urgent';
  if (d <= 3) return 'soon';
  return 'ok';
}

export function useByLabel(useBy: string): string {
  const d = daysUntil(useBy);
  if (d < 0) return `Past use-by (${shortDate(useBy)})`;
  return `Use by ${relativeDay(useBy).replace(/^(Today|Tomorrow)$/, (m) => m.toLowerCase())}`;
}
