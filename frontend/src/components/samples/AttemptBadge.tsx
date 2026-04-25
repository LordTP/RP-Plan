'use client';

import { RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Inline rework indicator. Renders nothing when attemptNo is 1 or undefined
 * (the implicit-v1 case), so it can be dropped next to any sample status
 * cell without cluttering the FTR happy path.
 *
 * Visuals:
 *   v2  ↻ amber pill
 *   v3+ ↻ red pill (stuck)
 *
 * The dot suffix shows prior rejection count when >0.
 */
export function AttemptBadge({
  attemptNo,
  rejectionCount,
  size = 'sm',
  className,
}: {
  attemptNo: number | null | undefined;
  rejectionCount?: number | null;
  size?: 'sm' | 'xs';
  className?: string;
}) {
  if (!attemptNo || attemptNo <= 1) return null;
  const stuck = attemptNo >= 3;
  const tone = stuck
    ? 'bg-red-50 text-red-700 border-red-300'
    : 'bg-amber-50 text-amber-800 border-amber-300';
  const dim = size === 'xs'
    ? 'text-[9px] px-1 py-0 gap-0.5 h-4'
    : 'text-[10px] px-1.5 py-0.5 gap-0.5';
  const iconSize = size === 'xs' ? 'w-2.5 h-2.5' : 'w-2.5 h-2.5';
  const showRejections = (rejectionCount ?? 0) > 0;

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border font-semibold leading-none whitespace-nowrap',
        tone,
        dim,
        className,
      )}
      title={`Attempt ${attemptNo} — ${rejectionCount ?? 0} prior rejection${rejectionCount === 1 ? '' : 's'}`}
    >
      <RotateCcw className={iconSize} />
      v{attemptNo}
      {showRejections && <span className="text-red-600">·{rejectionCount}</span>}
    </span>
  );
}
