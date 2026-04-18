import type { OrderComponent } from '@/types';

export type SampleKind = 'fit_sample' | 'strike_off' | 'lab_dip';
export type SampleField = 'status' | 'received' | 'approved';

export function isSampleDone(status?: string | null, approvedDate?: string | null): boolean {
  const s = (status || '').trim().toUpperCase();
  if (s === 'APPROVED' || s === 'NOT REQUIRED') return true;
  if (approvedDate) return true;
  return false;
}

export function componentSampleSummary(components: OrderComponent[], kind: SampleKind) {
  const total = components.length;
  let done = 0;
  const items = components.map((c) => {
    const status = c[`${kind}_status` as keyof OrderComponent] as string | null | undefined;
    const approved = c[`${kind}_approved` as keyof OrderComponent] as string | null | undefined;
    const isDone = isSampleDone(status, approved);
    if (isDone) done += 1;
    return { name: c.name, status, approved, isDone };
  });
  return { done, total, items };
}
