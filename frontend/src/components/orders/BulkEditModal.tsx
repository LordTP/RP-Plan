'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, X, Info, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { componentsApi, submissionsApi, type RejectReason } from '@/lib/api';
import { SAMPLE_STATUS_OPTIONS } from '@/types';

/** Minimal shape the bulk-edit modal needs. Any instance-like object from
 *  either the Library tab (CanonicalInstance) or the In Progress tab
 *  (OrderComponent + Order) can be shaped down to this before opening. */
export interface BulkEditInstance {
  instance_id: number;
  style_code?: string | null;
  po_number?: string | null;
  customer?: string | null;
  approved?: string | Date | null;
}

interface Props {
  instances: BulkEditInstance[];
  canonicalName: string;
  onClose: () => void;
  onDone: () => void;
}

export function BulkEditModal({ instances, canonicalName, onClose, onDone }: Props) {
  const [statusOn, setStatusOn] = useState(true);
  const [statusVal, setStatusVal] = useState<string>('APPROVED');
  const [approvedOn, setApprovedOn] = useState(false);
  const [approvedVal, setApprovedVal] = useState(toIsoDate(new Date()));
  const [receivedOn, setReceivedOn] = useState(false);
  const [receivedVal, setReceivedVal] = useState(toIsoDate(new Date()));
  const [saving, setSaving] = useState(false);

  const isRejecting = statusOn && statusVal === 'REJECTED';

  // Reason taxonomy — loaded lazily the first time REJECTED is picked.
  const [rejectReasons, setRejectReasons] = useState<RejectReason[]>([]);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectNotes, setRejectNotes] = useState('');

  useEffect(() => {
    if (!isRejecting || rejectReasons.length > 0) return;
    submissionsApi.getRejectReasons()
      .then((r) => setRejectReasons(r.reasons))
      .catch(() => { /* form validation will still block submit */ });
  }, [isRejecting, rejectReasons.length]);

  const overwriteWarning = useMemo(() => {
    if (!approvedOn || isRejecting) return null;
    const already = instances.filter((i) => i.approved).length;
    if (already > 0) {
      return `${already} of the ${instances.length} instance${instances.length === 1 ? '' : 's'} already have an Approved date. Confirming will overwrite.`;
    }
    return null;
  }, [approvedOn, instances, isRejecting]);

  // Summarize which POs the ticked instances cover
  const poSummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of instances) {
      const po = i.po_number || '—';
      counts.set(po, (counts.get(po) || 0) + 1);
    }
    return Array.from(counts.entries()).map(([po, n]) => `PO ${po}${n > 1 ? ` (${n})` : ''}`).join(' · ');
  }, [instances]);

  const canSubmit = (() => {
    if (saving) return false;
    if (isRejecting) return !!rejectReason;
    return statusOn || approvedOn || receivedOn;
  })();

  async function save() {
    setSaving(true);
    try {
      const payload: any = { instance_ids: instances.map((i) => i.instance_id) };
      if (isRejecting) {
        // REJECTED is a lifecycle event — backend closes the current attempt,
        // opens v+1, and clears received/approved. Sending those dates here
        // would be ignored anyway, so we deliberately skip them.
        payload.status = 'REJECTED';
        payload.reason = rejectReason;
        if (rejectNotes.trim()) payload.notes = rejectNotes.trim();
      } else {
        if (statusOn) payload.status = statusVal;
        if (approvedOn) payload.approved = approvedVal;
        if (receivedOn) payload.received = receivedVal;
      }
      const res = await componentsApi.bulkEditInstances(payload);
      if (isRejecting) {
        toast.success(`Rejected ${res.changed_count} instance${res.changed_count === 1 ? '' : 's'} — v+1 opened OUTSTANDING`);
      } else {
        toast.success(`Updated ${res.changed_count}${res.unchanged_count > 0 ? ` (${res.unchanged_count} unchanged)` : ''} instances`);
      }
      onDone();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Bulk edit failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    // Backdrop is click-inert on purpose — bulk edits + rejections shouldn't
    // vanish if the user accidentally clicks outside the card. Use the X or
    // Cancel to close.
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40">
      <div className="w-full max-w-lg bg-white rounded-lg shadow-xl">
        <div className="px-6 py-4 border-b border-gray-200 flex items-start justify-between">
          <div>
            <h3 className="text-base font-bold text-gray-900">
              Bulk edit — {instances.length} instance{instances.length === 1 ? '' : 's'}
            </h3>
            <p className="text-[11px] text-gray-500 mt-0.5">{canonicalName}</p>
            {poSummary && (
              <p className="text-[10px] text-gray-400 mt-0.5 truncate max-w-md">{poSummary}</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-3">
          <BulkField
            on={statusOn}
            onToggle={() => setStatusOn((v) => !v)}
            label="Status"
            hint={isRejecting
              ? 'Closes current attempt on every ticked instance, opens v+1 outstanding'
              : 'Set on every ticked instance'}
          >
            <select
              value={statusVal}
              onChange={(e) => setStatusVal(e.target.value)}
              disabled={!statusOn}
              className="text-sm border border-gray-300 rounded px-3 py-1.5 bg-white disabled:opacity-50"
            >
              {SAMPLE_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </BulkField>

          {isRejecting && (
            <div className="p-3 rounded border-2 border-red-300 bg-red-50 space-y-2">
              <div className="text-[11px] text-red-800 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>
                  Received / Approved date fields are ignored for rejections — the backend clears them per instance and opens v+1 at OUTSTANDING with a fresh clock.
                </span>
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-900 block mb-1">
                  Reason <span className="text-red-600 font-normal">(required)</span>
                </label>
                <select
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded px-3 py-1.5 bg-white"
                >
                  <option value="">— Pick a reason —</option>
                  {rejectReasons.map((r) => (
                    <option key={r.code} value={r.code}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-900 block mb-1">
                  Notes <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={rejectNotes}
                  onChange={(e) => setRejectNotes(e.target.value)}
                  rows={2}
                  placeholder="Anything the factory needs to know to fix this batch…"
                  className="w-full text-sm border border-gray-300 rounded px-3 py-1.5 bg-white"
                />
              </div>
            </div>
          )}

          {!isRejecting && (
            <>
              <BulkField
                on={approvedOn}
                onToggle={() => setApprovedOn((v) => !v)}
                label="Approved date"
                hint="Applies where blank; overrides where set"
              >
                <input
                  type="date"
                  value={approvedVal}
                  onChange={(e) => setApprovedVal(e.target.value)}
                  disabled={!approvedOn}
                  className="text-sm border border-gray-300 rounded px-3 py-1.5 bg-white disabled:opacity-50"
                />
              </BulkField>
              <BulkField
                on={receivedOn}
                onToggle={() => setReceivedOn((v) => !v)}
                label="Received date"
                hint="Applies where blank; overrides where set"
              >
                <input
                  type="date"
                  value={receivedVal}
                  onChange={(e) => setReceivedVal(e.target.value)}
                  disabled={!receivedOn}
                  className="text-sm border border-gray-300 rounded px-3 py-1.5 bg-white disabled:opacity-50"
                />
              </BulkField>
            </>
          )}

          {overwriteWarning && (
            <div className="rounded border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800 flex items-start gap-2">
              <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>{overwriteWarning}</span>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!canSubmit}
            className={cn(
              'px-4 py-2 text-sm font-semibold text-white rounded disabled:opacity-50 flex items-center gap-1.5',
              isRejecting ? 'bg-red-600 hover:bg-red-700' : 'bg-violet-600 hover:bg-violet-700',
            )}
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {isRejecting
              ? `Reject ${instances.length} instance${instances.length === 1 ? '' : 's'}`
              : `Update ${instances.length} instance${instances.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function BulkField({
  on,
  onToggle,
  label,
  hint,
  children,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        'flex items-center gap-3 p-3 rounded border cursor-pointer',
        on ? 'border-violet-500 bg-violet-50' : 'border-gray-200 bg-white',
      )}
    >
      <input type="checkbox" checked={on} onChange={onToggle} className="h-4 w-4 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className={cn('text-sm font-bold', on ? 'text-gray-900' : 'text-gray-500')}>{label}</div>
        <div className="text-[10px] text-gray-500">{hint}</div>
      </div>
      {children}
    </label>
  );
}

function toIsoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}
