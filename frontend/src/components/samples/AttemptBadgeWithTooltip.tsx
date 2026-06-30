'use client';

/**
 * AttemptBadge + on-hover floating panel showing the most recent rejection
 * for that order's sample area. Used in the orders table cells so users can
 * read WHY a sample is on v2 / v3 without opening the V2 detail panel.
 *
 * For Strike Off / Lab Dip columns, if the order has components of the
 * matching type we list each component's most recent rejection separately
 * — that's where the "why" actually lives once components are in play.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { format, parseISO } from 'date-fns';
import { AlertTriangle, User } from 'lucide-react';
import { AttemptBadge } from './AttemptBadge';
import { componentsForKind, type SampleKind } from '@/lib/sampleStatus';
import type { LastRejection, Order, OrderComponent } from '@/types';

interface RejectionEntry {
  componentName: string | null; // null = order-level
  attemptNo: number;
  rejection: LastRejection;
}

interface Props {
  order: Order;
  /** snake_case column key, e.g. "strike_off_status" / "fit_sample_status". */
  columnKey: string;
  className?: string;
}

const COL_TO_PREFIX: Record<string, 'fit_sample' | 'strike_off' | 'lab_dip' | 'pps'> = {
  fit_sample_status: 'fit_sample',
  strike_off_status: 'strike_off',
  lab_dip_status: 'lab_dip',
  pps_status: 'pps',
};

const PREFIX_TO_KIND: Record<string, SampleKind | null> = {
  fit_sample: null, // order-level — components don't carry fit data
  strike_off: 'strike_off',
  lab_dip: 'lab_dip',
  pps: null, // order-level — pps lives on the order
};

const PREFIX_LABEL: Record<string, string> = {
  fit_sample: 'Fit Sample',
  strike_off: 'Strike Off',
  lab_dip: 'Lab Dip',
  pps: 'PPS',
};

export function AttemptBadgeWithTooltip({ order, columnKey, className }: Props) {
  const prefix = COL_TO_PREFIX[columnKey];
  if (!prefix) return null;

  const orderAttemptNo = ((order as any)[`${prefix}_attempt_no`] as number | undefined) ?? 1;
  const orderRejCount = ((order as any)[`${prefix}_rejection_count`] as number | undefined) ?? 0;

  // Build the list of rejections to show — per-component for SO/LD when
  // components of the matching type exist, otherwise the order-level entry.
  const entries: RejectionEntry[] = [];
  const kind = PREFIX_TO_KIND[prefix];
  const compMatches: OrderComponent[] = kind && order.components
    ? componentsForKind(order.components, kind)
    : [];

  let topAttemptNo = orderAttemptNo;
  let topRejCount = orderRejCount;

  if (compMatches.length > 0) {
    // Per-component breakdown — list each component with a rejection.
    let maxAttempt = 1;
    let totalRej = 0;
    for (const c of compMatches) {
      const ca = ((c as any)[`${prefix}_attempt_no`] as number | undefined) ?? 1;
      const cr = ((c as any)[`${prefix}_rejection_count`] as number | undefined) ?? 0;
      const lr = (c as any)[`${prefix}_last_rejection`] as LastRejection | null | undefined;
      if (ca > maxAttempt) maxAttempt = ca;
      totalRej += cr;
      if (lr) {
        entries.push({ componentName: c.name, attemptNo: ca, rejection: lr });
      }
    }
    topAttemptNo = maxAttempt;
    topRejCount = totalRej;
  } else {
    const lr = (order as any)[`${prefix}_last_rejection`] as LastRejection | null | undefined;
    if (lr) entries.push({ componentName: null, attemptNo: orderAttemptNo, rejection: lr });
  }

  // If nothing's been rejected yet (still on v1), AttemptBadge renders null
  // and there's nothing to hover. Bail early to avoid the wrapper noise.
  if (topAttemptNo <= 1) return null;

  return <BadgeWithHover entries={entries} prefix={prefix} attemptNo={topAttemptNo} rejectionCount={topRejCount} className={className} />;
}

function BadgeWithHover({ entries, prefix, attemptNo, rejectionCount, className }: {
  entries: RejectionEntry[];
  prefix: string;
  attemptNo: number;
  rejectionCount: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const PANEL_W = 320;
    let left = rect.left;
    let top = rect.bottom + 6;
    if (left + PANEL_W > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - PANEL_W - 8);
    }
    // Flip above if there's no room below
    if (top + 200 > window.innerHeight - 8) {
      top = Math.max(8, rect.top - 200 - 6);
    }
    setPos({ top, left });
  }, [open]);

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="inline-flex"
      >
        <AttemptBadge attemptNo={attemptNo} rejectionCount={rejectionCount} size="xs" className={className} />
      </span>

      {open && pos && typeof window !== 'undefined' && createPortal(
        <div
          className="fixed z-[100] w-[320px] bg-white rounded-lg shadow-xl ring-1 ring-gray-200 overflow-hidden text-xs"
          style={{ top: pos.top, left: pos.left }}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          <div className="px-3 py-2 border-b border-gray-100 bg-amber-50/60 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
            <span className="font-semibold text-amber-900">{PREFIX_LABEL[prefix]} rework</span>
            <span className="ml-auto text-[10px] text-amber-700">{rejectionCount} prior rejection{rejectionCount === 1 ? '' : 's'}</span>
          </div>
          {entries.length === 0 ? (
            <div className="p-3 text-gray-500 italic">No rejection context recorded.</div>
          ) : (
            <div className="divide-y divide-gray-100 max-h-[300px] overflow-y-auto">
              {entries.map((e, i) => (
                <RejectionLine key={i} entry={e} />
              ))}
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}

function RejectionLine({ entry }: { entry: RejectionEntry }) {
  const { componentName, attemptNo, rejection } = entry;
  let when: string | null = null;
  if (rejection.rejected_at) {
    try {
      when = format(parseISO(rejection.rejected_at), 'd MMM yyyy');
    } catch {
      when = rejection.rejected_at;
    }
  }
  // The current attempt is N — the rejection that opened it is from N-1.
  // Surface that explicitly so the user reads "v1 rejected" not "v2 rejected".
  const rejectedAttempt = Math.max(1, attemptNo - 1);
  return (
    <div className="px-3 py-2">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="font-semibold text-gray-900 truncate">
          {componentName || 'Order-level'}
          <span className="ml-1.5 text-[10px] font-medium text-gray-500">v{rejectedAttempt} rejected</span>
        </span>
        {when && <span className="text-[10px] text-gray-500 flex-shrink-0">{when}</span>}
      </div>
      <div className="text-[11px] text-gray-700">
        <span className="font-medium text-gray-900">{rejection.reason || '(no reason)'}</span>
        {rejection.notes && <span className="text-gray-600"> — {rejection.notes}</span>}
      </div>
      {rejection.rejected_by && (
        <div className="text-[10px] text-gray-500 mt-0.5 flex items-center gap-1">
          <User className="w-2.5 h-2.5" />
          {rejection.rejected_by}
        </div>
      )}
    </div>
  );
}
