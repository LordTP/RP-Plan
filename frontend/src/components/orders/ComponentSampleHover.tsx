'use client';

import { useState } from 'react';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OrderComponent } from '@/types';
import { componentSampleSummary, componentsForKind, isSampleDone, type SampleKind } from '@/lib/sampleStatus';

type Props = {
  components: OrderComponent[];
  kind: SampleKind;
  field: 'status' | 'received' | 'approved';
};

function formatDate(s?: string | null): string {
  if (!s) return '-';
  try {
    return new Date(s).toLocaleDateString('en-GB');
  } catch {
    return String(s);
  }
}

/** Colours matching the /orders status vocabulary, so a rolled-up cell reads
 *  the same as an order-level one two columns over. */
function statusTone(status: string): { bg: string; text: string; ring: string } {
  switch (status) {
    case 'APPROVED':
      return { bg: 'bg-green-50', text: 'text-green-700', ring: 'ring-green-200' };
    case 'NOT REQUIRED':
      return { bg: 'bg-gray-50', text: 'text-gray-500', ring: 'ring-gray-200' };
    case 'RECEIVED':
      return { bg: 'bg-blue-50', text: 'text-blue-700', ring: 'ring-blue-200' };
    case 'REJECTED':
    case 'LATE':
      return { bg: 'bg-red-50', text: 'text-red-700', ring: 'ring-red-200' };
    default:
      return { bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-200' };
  }
}

export function ComponentSampleHover({ components, kind, field }: Props) {
  const [open, setOpen] = useState(false);
  const { done, total } = componentSampleSummary(components, kind);
  // Only the components matching this column's kind are listed below — the
  // rest belong to the "other" sample type and would be misleading here.
  const relevant = componentsForKind(components, kind);
  const allDone = total > 0 && done === total;

  // When every component agrees, show the STATUS rather than "2/2 done".
  //
  // The filter matches on the status value, so a cell reading "2/2 done"
  // while you filtered for APPROVED left no visible connection between the
  // two. Falling back to the count only when components genuinely disagree
  // keeps that case honest — there's no single status to show then.
  const statuses = relevant.map(
    (c) => ((c[`${kind}_status` as keyof OrderComponent] as string | null) || '').trim().toUpperCase(),
  );
  const uniform = statuses.length > 0 && statuses.every((s) => s === statuses[0]) ? statuses[0] : null;

  let label: string;
  let tone: { bg: string; text: string; ring: string };
  if (field === 'status' && uniform) {
    label = uniform || '—';
    tone = statusTone(uniform);
  } else {
    label = `${done}/${total} done`;
    tone = allDone
      ? { bg: 'bg-green-50', text: 'text-green-700', ring: 'ring-green-200' }
      : { bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-200' };
  }

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium cursor-default whitespace-nowrap',
          tone.bg, tone.text, 'ring-1', tone.ring,
        )}
      >
        {label}
        {total > 1 && field === 'status' && uniform && (
          <span className="opacity-60 tabular-nums">×{total}</span>
        )}
      </span>
      {open && (
        <div className="absolute z-50 left-0 top-full mt-1 min-w-[240px] rounded-md border border-gray-200 bg-white shadow-lg p-2 text-[10px]">
          {relevant.map((comp) => {
            const statusVal = comp[`${kind}_status` as keyof OrderComponent] as string | null | undefined;
            const approvedVal = comp[`${kind}_approved` as keyof OrderComponent] as string | null | undefined;
            const receivedVal = comp[`${kind}_received` as keyof OrderComponent] as string | null | undefined;
            const itemDone = isSampleDone(statusVal, approvedVal);
            const display =
              field === 'status' ? (statusVal || '-') :
              field === 'received' ? formatDate(receivedVal) :
              formatDate(approvedVal);
            return (
              <div key={comp.id} className="flex justify-between gap-3 py-0.5">
                <span className={cn('font-medium', itemDone ? 'text-green-700' : 'text-gray-700')}>
                  {comp.name}
                </span>
                <span className="text-gray-600">{display}</span>
              </div>
            );
          })}
          {/* This cell is deliberately read-only — component samples are
              edited on the Components page, so the same sample can't be
              changed from two places. Say so, or a click that does nothing
              reads as a broken cell. */}
          <div className="mt-1.5 pt-1.5 border-t border-gray-100 flex items-center gap-1 text-gray-400">
            <Lock className="w-2.5 h-2.5 flex-shrink-0" />
            <span>Edit on the Components page</span>
          </div>
        </div>
      )}
    </div>
  );
}
