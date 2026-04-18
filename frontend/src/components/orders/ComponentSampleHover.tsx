'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { OrderComponent } from '@/types';
import { componentSampleSummary, isSampleDone, type SampleKind } from '@/lib/sampleStatus';

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

export function ComponentSampleHover({ components, kind, field }: Props) {
  const [open, setOpen] = useState(false);
  const { done, total } = componentSampleSummary(components, kind);
  const allDone = total > 0 && done === total;

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span
        className={cn(
          'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium cursor-default',
          allDone
            ? 'bg-green-50 text-green-700 ring-1 ring-green-200'
            : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
        )}
      >
        {done}/{total} done
      </span>
      {open && (
        <div className="absolute z-50 left-0 top-full mt-1 min-w-[220px] rounded-md border border-gray-200 bg-white shadow-lg p-2 text-[10px]">
          {components.map((comp) => {
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
        </div>
      )}
    </div>
  );
}
