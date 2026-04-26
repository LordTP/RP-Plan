'use client';

import { useEffect, useState } from 'react';
import { Clock, ArrowRight, Loader2 } from 'lucide-react';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import { ordersApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { DateHistory } from '@/types';

interface Props {
  orderId: number;
  /** When true, renders inside a self-bounding card with its own header. */
  framed?: boolean;
}

const REASON_LABEL: Record<string, string> = {
  COLOUR: 'Colour / shade off',
  PLACEMENT: 'Placement wrong',
  STITCH: 'Stitch / construction',
  MATERIAL: 'Material / hand feel',
  SPEC: 'Spec mismatch',
  PRINT: 'Print quality',
  OTHER: 'Other',
};

/**
 * Polished change-history card. Each entry is its own bordered row with a
 * coloured source pill, the field name, the value diff, and a by-line.
 * Rejection events that came through the structured submission flow show a
 * dedicated rich card with the reason label and note quoted inline.
 */
export function HistoryPanel({ orderId, framed = true }: Props) {
  const [history, setHistory] = useState<DateHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    ordersApi.getOrderHistory(orderId)
      .then((data) => { if (!cancelled) setHistory(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [orderId]);

  const inner = (
    <>
      {framed && (
        <div className="px-4 py-3 border-b border-gray-200 bg-white flex items-center gap-2.5 flex-shrink-0">
          <div className="w-7 h-7 bg-gray-100 rounded-md flex items-center justify-center">
            <Clock className="w-4 h-4 text-gray-600" />
          </div>
          <div>
            <div className="text-sm font-bold text-gray-900">History</div>
            <div className="text-[10px] text-gray-500">
              {isLoading ? 'Loading…' : `${history.length} change${history.length === 1 ? '' : 's'}`}
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5 min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-10 h-10 mx-auto bg-gray-100 rounded-full flex items-center justify-center mb-2">
              <Clock className="w-5 h-5 text-gray-300" />
            </div>
            <p className="text-xs font-medium text-gray-500">No history</p>
          </div>
        ) : (
          history.map((item) => <HistoryRow key={item.id} item={item} />)
        )}
      </div>
    </>
  );

  if (!framed) {
    return <div className="flex flex-col h-full min-h-0">{inner}</div>;
  }

  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden flex flex-col h-full min-h-0">
      {inner}
    </div>
  );
}

function HistoryRow({ item }: { item: DateHistory }) {
  const isImport = item.source === 'Excel Import';
  const isSupplier = item.source === 'Supplier';
  const isApproved = item.source === 'Supplier (Approved)';
  const isRejected = item.source === 'Supplier (Rejected)';

  // Detect a rejection event coming from our structured submission flow. The
  // backend writes new_value strings starting with "v{N} REJECTED (".
  const rejectionMatch = item.new_value && /^v\d+ REJECTED \(/i.test(item.new_value);
  // Approval-from-submission marker: "v{N} APPROVED"
  const approvalMatch = item.new_value && /^v\d+ APPROVED$/i.test(item.new_value);

  let timeAgo = '';
  try { timeAgo = formatDistanceToNow(parseISO(item.created_at), { addSuffix: true }); } catch {}

  if (rejectionMatch) {
    // Pull the inline reason + note out of the new_value text we control.
    // Format: "v{N} REJECTED (Colour / shade off) — "note" — opened v{M} OUTSTANDING"
    const m = /^v(\d+) REJECTED \(([^)]+)\)(?: — "([^"]*)")? — opened v(\d+) OUTSTANDING$/.exec(item.new_value || '');
    const fromV = m?.[1];
    const reason = m?.[2];
    const note = m?.[3];
    const toV = m?.[4];
    return (
      <div className="border border-red-200 bg-red-50/40 rounded-md px-3 py-2">
        <div className="flex items-center justify-between mb-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-red-100 text-red-700 border border-red-200">REJECTED</span>
            <span className="text-[11px] font-semibold text-gray-900">
              {fieldLabelFromKey(item.field_name)}
              {fromV && <span className="text-gray-500"> · v{fromV}</span>}
            </span>
          </div>
          <span className="text-[10px] text-gray-400">{timeAgo}</span>
        </div>
        {reason && <div className="text-[11px] text-gray-700 mt-1">{reason}</div>}
        {note && <div className="text-[10px] text-gray-500 italic mt-0.5">"{note}"</div>}
        <div className="text-[10px] text-gray-400 mt-1">
          by {item.username}
          {item.component_name && <> · component: {item.component_name}</>}
          {toV && <> · opened v{toV} OUTSTANDING</>}
        </div>
      </div>
    );
  }

  if (approvalMatch) {
    return (
      <div className="border border-emerald-200 bg-emerald-50/40 rounded-md px-3 py-2">
        <div className="flex items-center justify-between mb-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">APPROVED</span>
            <span className="text-[11px] font-semibold text-gray-900">{fieldLabelFromKey(item.field_name)} · {item.new_value}</span>
          </div>
          <span className="text-[10px] text-gray-400">{timeAgo}</span>
        </div>
        <div className="text-[10px] text-gray-400 mt-1">
          by {item.username}
          {item.component_name && <> · component: {item.component_name}</>}
        </div>
      </div>
    );
  }

  const tint =
    isImport ? 'border-violet-100 bg-violet-50/40' :
    isRejected ? 'border-red-100 bg-red-50/40' :
    (isSupplier || isApproved) ? 'border-orange-100 bg-orange-50/40' :
    'border-gray-100 bg-white';

  const sourcePill =
    isImport ? 'bg-violet-100 text-violet-700 border-violet-200' :
    isApproved ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
    isRejected ? 'bg-red-100 text-red-700 border-red-200' :
    isSupplier ? 'bg-orange-100 text-orange-700 border-orange-200' :
    'bg-blue-50 text-blue-700 border-blue-100';

  return (
    <div className={cn('rounded-md px-3 py-2 border', tint)}>
      <div className="flex items-center justify-between mb-0.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium border whitespace-nowrap', sourcePill)}>
            {item.source || 'Sourcelab'}
          </span>
          <span className="text-[11px] font-semibold text-gray-900 truncate">
            {fieldLabelFromKey(item.field_name)}
          </span>
        </div>
        <span className="text-[10px] text-gray-400 whitespace-nowrap">{timeAgo}</span>
      </div>
      <div className="flex items-center gap-1.5 text-[11px] mt-1 flex-wrap">
        <span className="text-gray-400 line-through bg-gray-50 px-1.5 py-0.5 rounded">{item.old_value || 'Empty'}</span>
        <ArrowRight className="w-3 h-3 text-gray-300 flex-shrink-0" />
        <span className={cn(
          'font-semibold px-1.5 py-0.5 rounded',
          isRejected ? 'bg-red-100 text-red-700 line-through' :
          isApproved ? 'bg-emerald-100/70 text-emerald-800' :
          'bg-blue-50 text-blue-800'
        )}>
          {item.new_value || 'Empty'}
        </span>
      </div>
      <div className="text-[10px] text-gray-400 mt-1">
        by {item.username}
        {item.component_name && <> · component: {item.component_name}</>}
        {item.approved_by && !isRejected && <> · approved by {item.approved_by}</>}
        {item.approved_by && isRejected && <> · rejected by {item.approved_by}</>}
      </div>
      {item.rejection_reason && (
        <div className="mt-1.5 px-2 py-1.5 bg-red-100/60 border border-red-200 rounded text-[10px] text-red-800">
          <strong className="font-semibold">Reason:</strong> {item.rejection_reason}
        </div>
      )}
    </div>
  );
}

function fieldLabelFromKey(field: string): string {
  return field.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}
