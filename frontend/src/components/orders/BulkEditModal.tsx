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
  /** Current state, so the modal can say where these instances are before
   *  you change them and how many the edit will actually move. Optional so a
   *  caller without it still works — the summary simply hides. */
  status?: string | null;
  received?: string | Date | null;
}

interface Props {
  instances: BulkEditInstance[];
  canonicalName: string;
  onClose: () => void;
  onDone: () => void;
}

/** Chip colour per sample status — same semantics as everywhere else:
 *  approved is settled, received is with us, outstanding is with them. */
function statusPill(status: string): string {
  switch (status.toUpperCase()) {
    case 'APPROVED': return 'bg-emerald-100 text-emerald-700';
    case 'RECEIVED': return 'bg-blue-100 text-blue-700';
    case 'REJECTED': return 'bg-red-100 text-red-700';
    case 'LATE':
    case 'P23 ADVISE UPDATE': return 'bg-orange-100 text-orange-700';
    case 'NOT REQUIRED': return 'bg-gray-100 text-gray-500';
    default: return 'bg-amber-100 text-amber-700';
  }
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

  /** Where the ticked instances are right now, and how many this edit
   *  actually moves.
   *
   *  The modal used to say "Update 34 instances" with no indication of what
   *  those 34 currently were — setting APPROVED on a batch that was already
   *  approved looked identical to signing off 34 outstanding samples. */
  const state = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const i of instances) {
      const st = (i.status || '').trim().toUpperCase() || 'OUTSTANDING';
      counts[st] = (counts[st] || 0) + 1;
    }
    const known = instances.some((i) => i.status);
    const alreadyAtTarget = statusOn
      ? instances.filter((i) => (i.status || '').trim().toUpperCase() === statusVal).length
      : 0;
    return { counts, known, alreadyAtTarget, total: instances.length };
  }, [instances, statusOn, statusVal]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-6">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl ring-1 ring-black/5 overflow-hidden">
        <div className="px-5 pt-4 pb-3 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-bold text-gray-900 leading-tight">
              {isRejecting ? 'Reject' : 'Bulk edit'}{' '}
              <span className="text-gray-400 font-semibold">
                · {instances.length} {instances.length === 1 ? 'style' : 'styles'}
              </span>
            </h3>
            <p className="text-[12px] text-gray-600 mt-0.5 font-semibold truncate">{canonicalName}</p>
            {poSummary && (
              <p className="text-[11px] text-gray-400 mt-0.5 truncate">{poSummary}</p>
            )}
          </div>
          <button onClick={onClose}
                  className="p-1.5 -mr-1 -mt-0.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100
                             rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Where these styles are before anything changes. Without it, setting
            APPROVED across a batch that is already approved looked exactly
            like signing off a batch that was not. */}
        {state.known && (
          <div className="px-5 pb-3">
            <div className="rounded-lg bg-gray-50 ring-1 ring-gray-200 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                Where they are now
              </p>
              <div className="flex items-center gap-1.5 flex-wrap">
                {Object.entries(state.counts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([st, n]) => {
                    const p = statusPill(st);
                    return (
                      <span key={st}
                            className={cn('inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full', p)}>
                        {n} {st.toLowerCase()}
                      </span>
                    );
                  })}
              </div>
            </div>
          </div>
        )}

        <div className="px-5 pb-4 space-y-2.5 border-t border-gray-100 pt-4">
          <BulkField
            on={statusOn}
            onToggle={() => setStatusOn((v) => !v)}
            label="Status"
            hint={isRejecting
              ? 'Closes the current attempt and opens the next one, outstanding'
              : 'Set on every style you ticked'}
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
                hint="Replaces any date already set"
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
                hint="Replaces any date already set"
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
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/60 flex items-center gap-3">
          {/* What this actually does, before you do it. */}
          <p className="text-[11.5px] text-gray-500 min-w-0 flex-1">
            {isRejecting ? (
              <>Opens a new attempt on all <b className="text-gray-700">{instances.length}</b></>
            ) : statusOn && state.known && state.alreadyAtTarget > 0 ? (
              <>
                <b className="text-gray-700">{instances.length - state.alreadyAtTarget}</b> will change
                {' · '}
                <span className="text-gray-400">{state.alreadyAtTarget} already {statusVal.toLowerCase()}</span>
              </>
            ) : (
              <>Applies to all <b className="text-gray-700">{instances.length}</b></>
            )}
          </p>
          <button
            onClick={onClose}
            className="px-3.5 py-2 text-[13px] font-medium text-gray-600 hover:text-gray-900 flex-shrink-0"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!canSubmit}
            className={cn(
              'px-4 py-2 text-[13px] font-semibold text-white rounded-lg disabled:opacity-40 flex items-center gap-1.5 flex-shrink-0',
              isRejecting ? 'bg-red-600 hover:bg-red-700' : 'bg-primary-600 hover:bg-primary-700',
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
