import type { OrderComponent } from '@/types';

export type SampleKind = 'fit_sample' | 'strike_off' | 'lab_dip';
export type SampleField = 'status' | 'received' | 'approved';

export function isSampleDone(status?: string | null, approvedDate?: string | null): boolean {
  const s = (status || '').trim().toUpperCase();
  if (s === 'APPROVED' || s === 'NOT REQUIRED') return true;
  if (approvedDate) return true;
  return false;
}

// Count business days (Mon-Fri) between two dates. Returns 0 if either is missing
// or end < start (matches backend `business_days_between`).
export function businessDaysBetween(start?: string | Date | null, end?: string | Date | null): number {
  if (!start || !end) return 0;
  const s = start instanceof Date ? start : new Date(start);
  const e = end instanceof Date ? end : new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return 0;
  let days = 0;
  const current = new Date(s.getFullYear(), s.getMonth(), s.getDate());
  const endDay = new Date(e.getFullYear(), e.getMonth(), e.getDate());
  while (current < endDay) {
    const dow = current.getDay();
    if (dow !== 0 && dow !== 6) days++;
    current.setDate(current.getDate() + 1);
  }
  return days;
}

// Signed variant: positive if target is in the future, negative if past.
export function businessDaysUntil(target?: string | Date | null): number | null {
  if (!target) return null;
  const t = target instanceof Date ? target : new Date(target);
  if (isNaN(t.getTime())) return null;
  const now = new Date();
  if (t < now) return -businessDaysBetween(t, now);
  return businessDaysBetween(now, t);
}

// Relative label for a timestamp: "Today", "Yesterday", "Xd ago", "Xmo ago".
export function relativeTimeShort(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return d.toLocaleDateString('en-GB');
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}mo ago`;
  return d.toLocaleDateString('en-GB');
}

/** Filter components down to those whose sample_type matches the given kind.
 *  fit lives at order-level so it's not a component kind — pass-through. */
export function componentsForKind(components: OrderComponent[], kind: SampleKind): OrderComponent[] {
  if (kind === 'strike_off') return components.filter(c => c.sample_type === 'strike_off');
  if (kind === 'lab_dip') return components.filter(c => c.sample_type === 'lab_dip');
  return components;
}

export function componentSampleSummary(components: OrderComponent[], kind: SampleKind) {
  // Only count components that actually track this sample type — strike-off
  // components contribute to the Strike Off count, lab-dip to Lab Dip.
  const filtered = componentsForKind(components, kind);
  const total = filtered.length;
  let done = 0;
  const items = filtered.map((c) => {
    const status = c[`${kind}_status` as keyof OrderComponent] as string | null | undefined;
    const approved = c[`${kind}_approved` as keyof OrderComponent] as string | null | undefined;
    const isDone = isSampleDone(status, approved);
    if (isDone) done += 1;
    return { name: c.name, status, approved, isDone };
  });
  return { done, total, items };
}
