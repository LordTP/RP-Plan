'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, RotateCcw, Check, Circle } from 'lucide-react';
import type { SampleSubmission, SampleType } from '@/lib/api';
import { cn } from '@/lib/utils';

const REASON_LABEL: Record<string, string> = {
  COLOUR: 'Colour / shade off',
  PLACEMENT: 'Placement wrong',
  STITCH: 'Stitch / construction',
  MATERIAL: 'Material / hand feel',
  SPEC: 'Spec mismatch',
  PRINT: 'Print quality',
  OTHER: 'Other',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  } catch {
    return iso;
  }
}

/**
 * Per-sample-area attempt history. Renders a collapsed "View N attempts"
 * trigger; expands to a vertical timeline of v1, v2, v3… each showing the
 * requested → submitted → resolved flow, the outcome, and (for rejections)
 * the reason + notes. Rendered inside the V2 detail panel below the field
 * rows so designers and factories can audit a component's full lifecycle.
 *
 * Returns null when there are 0 or 1 closed attempts — there's nothing
 * worth seeing for the FTR happy path.
 */
export function AttemptHistory({
  submissions,
  componentId,
  sampleType,
  size = 'md',
}: {
  submissions: SampleSubmission[];
  componentId: number | null;
  sampleType: SampleType;
  size?: 'sm' | 'md';
}) {
  const [open, setOpen] = useState(false);

  const matching = useMemo(() => {
    return submissions
      .filter(s => s.component_id === componentId && s.sample_type === sampleType)
      .sort((a, b) => a.attempt_no - b.attempt_no);
  }, [submissions, componentId, sampleType]);

  // Don't render the accordion at all when nothing's been rejected — v1 alone
  // (or zero attempts) doesn't warrant the visual weight.
  const closedCount = matching.filter(s => s.outcome != null).length;
  if (closedCount === 0) return null;

  const total = matching.length;

  return (
    <div className={cn('mt-2', size === 'sm' ? 'text-[11px]' : 'text-xs')}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors text-gray-700"
      >
        <span className="flex items-center gap-1.5 font-medium">
          <RotateCcw className="w-3 h-3 text-gray-500" />
          Attempt history ({total} attempt{total !== 1 ? 's' : ''})
        </span>
        {open ? <ChevronUp className="w-3 h-3 text-gray-400" /> : <ChevronDown className="w-3 h-3 text-gray-400" />}
      </button>

      {open && (
        <ol className="mt-1.5 space-y-1.5">
          {matching.map((sub) => <AttemptRow key={sub.id} sub={sub} />)}
        </ol>
      )}
    </div>
  );
}

function AttemptRow({ sub }: { sub: SampleSubmission }) {
  const isOpen = sub.outcome == null;
  const isRejected = sub.outcome === 'REJECTED';
  const isApproved = sub.outcome === 'APPROVED';

  const containerClass =
    isRejected ? 'border-red-200 bg-red-50/50' :
    isApproved ? 'border-emerald-200 bg-emerald-50/50' :
                 'border-blue-200 bg-blue-50/40';

  const versionPillClass =
    isRejected ? 'bg-red-100 text-red-700 border-red-300' :
    isApproved ? 'bg-emerald-100 text-emerald-700 border-emerald-300' :
                 'bg-blue-100 text-blue-700 border-blue-300';

  const outcomeBadge =
    isRejected ? <span className="text-red-700 font-semibold">REJECTED</span> :
    isApproved ? <span className="text-emerald-700 font-semibold">APPROVED</span> :
                 <span className="text-blue-700 font-semibold flex items-center gap-1"><Circle className="w-2 h-2 animate-pulse fill-current" />OPEN</span>;

  const reasonLabel = sub.reason ? (REASON_LABEL[sub.reason] || sub.reason) : null;

  return (
    <li className={cn('rounded-md border px-2.5 py-1.5', containerClass)}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={cn('inline-flex items-center text-[10px] px-1.5 py-0.5 rounded font-bold border', versionPillClass)}>
          v{sub.attempt_no}
        </span>
        <span className="text-[11px] text-gray-700">
          {formatDate(sub.requested_at)} → {formatDate(sub.submitted_at)}{!isOpen && ` → ${formatDate(sub.resolved_at)}`}
        </span>
        <span className="ml-auto">{outcomeBadge}</span>
      </div>
      {isRejected && reasonLabel && (
        <div className="text-[11px] text-gray-700 mt-1">
          <span className="font-semibold">Reason:</span> {reasonLabel}
        </div>
      )}
      {isRejected && sub.notes && (
        <div className="text-[11px] text-gray-600 mt-0.5 italic">"{sub.notes}"</div>
      )}
    </li>
  );
}
