'use client';

import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LastRejection } from '@/types';

const REASON_LABEL: Record<string, string> = {
  COLOUR: 'Colour / shade off',
  PLACEMENT: 'Placement wrong',
  STITCH: 'Stitch / construction',
  MATERIAL: 'Material / hand feel',
  SPEC: 'Spec mismatch',
  PRINT: 'Print quality',
  OTHER: 'Other',
};

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return null;
  }
}

/**
 * Surfaces the most recent rejection context for a sample area that's currently
 * in rework. This is the only place factories see WHY their previous attempt
 * was rejected and what they need to fix.
 *
 * Renders nothing when no rejection exists (current attempt is v1).
 */
export function RejectionContextBanner({
  rejection,
  attemptNo,
  sampleAreaLabel,
  size = 'md',
}: {
  rejection: LastRejection | null | undefined;
  attemptNo: number | null | undefined;
  sampleAreaLabel: string;
  size?: 'sm' | 'md';
}) {
  if (!rejection || !attemptNo || attemptNo <= 1) return null;
  const reasonLabel = rejection.reason ? (REASON_LABEL[rejection.reason] || rejection.reason) : null;
  const stuck = attemptNo >= 3;
  const tone = stuck ? 'bg-red-50 border-red-200 text-red-900' : 'bg-amber-50 border-amber-200 text-amber-900';
  const iconTone = stuck ? 'text-red-600' : 'text-amber-600';
  const dateStr = formatDate(rejection.rejected_at);

  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2 flex items-start gap-2.5',
        tone,
        size === 'sm' ? 'text-[11px]' : 'text-xs'
      )}
    >
      <AlertCircle className={cn(size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4', iconTone, 'mt-0.5 flex-shrink-0')} />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">
          {sampleAreaLabel} v{rejection.attempt_no} rejected{dateStr ? ` on ${dateStr}` : ''}
          {' '}— now on v{attemptNo} (OUTSTANDING)
        </div>
        {reasonLabel && (
          <div className="mt-0.5">
            <span className="font-semibold">Reason:</span> {reasonLabel}
          </div>
        )}
        {rejection.notes && (
          <div className="mt-1 text-[11px] leading-relaxed bg-white/60 rounded px-2 py-1 border border-current/10">
            {rejection.notes}
          </div>
        )}
      </div>
    </div>
  );
}
