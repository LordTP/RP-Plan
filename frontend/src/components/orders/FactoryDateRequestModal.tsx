'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Calendar, Clock, Loader2, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { DatePickerInput } from '@/components/ui/DatePickerInput';
import { ordersApi } from '@/lib/api';
import type { Order } from '@/types';

/**
 * Request an ex-factory change on a selection of styles.
 *
 * The existing request modal is opened from one row and asks "just this, all on
 * the PO, or pick some?" -- a scope question, because it starts from a single
 * style and has to widen. This one starts from what the factory already ticked
 * on the list, so the scope is decided before it opens and the modal's job is
 * the new date, the reason, and showing exactly what it lands on.
 *
 * The selection can cross POs. /api/orders/bulk-update-date takes one PO per
 * call, so a cross-PO request is one call per PO and the results are summed
 * into a single message rather than a toast per PO.
 *
 * Suppliers can only move Revised Ex-Factory -- every other date is Source
 * Lab's -- so there is no field picker, and submitting creates
 * PendingDateChange rows for Source Lab to approve rather than writing the
 * date.
 */

const FIELD = 'revised_po_ex_factory';
const FIELD_LABEL = 'Revised ex-factory';

const fmt = (d: string | null | undefined) => {
  if (!d) return null;
  try { return format(parseISO(String(d).split('T')[0]), 'd MMM yyyy'); } catch { return null; }
};

export function FactoryDateRequestModal({
  open, orders, selectedIds, onClose, onDone,
}: {
  open: boolean;
  /** Every loaded order — the selection is resolved against these. */
  orders: Order[];
  selectedIds: Set<number>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  // Local copy so a style can be dropped from the request without also
  // unticking it on the list behind — the list selection is the starting
  // point, not the same thing as the request.
  const [dropped, setDropped] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!open) return;
    setValue(''); setReason(''); setDropped(new Set()); setSaving(false);
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const picked = useMemo(
    () => orders.filter((o) => selectedIds.has(o.id) && !dropped.has(o.id)),
    [orders, selectedIds, dropped],
  );

  /** Grouped by PO, because that is how it has to be submitted. */
  const byPO = useMemo(() => {
    const m = new Map<string, Order[]>();
    for (const o of picked) {
      const k = o.po_number || '—';
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(o);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [picked]);

  if (!open) return null;

  const canSubmit = !!value && !!reason.trim() && picked.length > 0 && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    let ok = 0;
    const failed: string[] = [];
    for (const [po, rows] of byPO) {
      try {
        await ordersApi.bulkUpdateDate(po, FIELD, value, rows.map((r) => r.id), reason.trim());
        ok += rows.length;
      } catch {
        failed.push(po);
      }
    }
    setSaving(false);
    if (ok) {
      toast.success(
        `Requested ${FIELD_LABEL.toLowerCase()} ${fmt(value)} on ${ok} style${ok === 1 ? '' : 's'}`
        + (byPO.length > 1 ? ` across ${byPO.length} POs` : '')
        + ' — waiting on Source Lab',
      );
    }
    if (failed.length) toast.error(`Failed on PO ${failed.join(', ')}`);
    if (ok) { onDone(); onClose(); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-gray-900/50
                    backdrop-blur-sm p-4 sm:p-6 overflow-y-auto"
         onClick={saving ? undefined : onClose} role="dialog" aria-modal="true">
      <div className="w-full max-w-3xl bg-white rounded-xl shadow-2xl ring-1 ring-gray-200 overflow-hidden my-auto"
           onClick={(e) => e.stopPropagation()}>

        <header className="px-5 py-4 border-b border-gray-200 flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
            <Calendar className="w-4.5 h-4.5 text-orange-600" strokeWidth={2.5} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-widest text-orange-600 font-bold">Request</div>
            <h2 className="text-[17px] font-extrabold text-gray-900 leading-tight mt-0.5">
              {FIELD_LABEL} change
            </h2>
            <p className="text-[12px] text-gray-500 mt-1">
              {picked.length} {picked.length === 1 ? 'style' : 'styles'}
              {byPO.length > 1 && <> across {byPO.length} POs</>}
              {byPO.length === 1 && <> on PO <span className="font-mono">{byPO[0][0]}</span></>}
            </p>
          </div>
          <button onClick={onClose} disabled={saving} aria-label="Close"
                  className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* What you are asking for */}
          <div className="px-5 py-4 sm:border-r border-b sm:border-b-0 border-gray-100 bg-gray-50/40">
            <StepHeading n={1} title="New date" />
            <div className="mt-2.5">
              <DatePickerInput value={value} onChange={setValue} variant="block" />
            </div>

            <StepHeading n={2} title="Why" className="mt-5" />
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder="e.g. fabric delay from the mill, revised sailing"
              className="mt-2.5 w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md resize-none
                         focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <p className="text-[11.5px] text-gray-500 mt-1.5">
              Source Lab see this with the request, so the more specific the quicker it clears.
            </p>

            <div className="mt-4 rounded-lg bg-orange-50 ring-1 ring-orange-200 px-3 py-2.5 flex items-start gap-2">
              <Clock className="w-3.5 h-3.5 text-orange-600 flex-shrink-0 mt-0.5" />
              <p className="text-[12px] text-orange-900">
                Nothing moves until Source Lab approve it. The dates on your list stay as they are
                and the request shows in your tracker.
              </p>
            </div>
          </div>

          {/* What it lands on */}
          <div className="px-5 py-4 min-w-0">
            <StepHeading n={3} title="Styles affected" />
            {picked.length === 0 ? (
              <p className="text-[12.5px] text-gray-400 mt-3">
                Nothing left selected. Put one back, or close and re-pick from the list.
              </p>
            ) : (
              <div className="mt-2.5 space-y-2.5 max-h-[300px] overflow-y-auto pr-0.5">
                {byPO.map(([po, rows]) => (
                  <div key={po} className="rounded-lg ring-1 ring-gray-200 overflow-hidden">
                    <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                      <span className="font-mono font-bold text-[12px] text-gray-800 tabular-nums">{po}</span>
                      {rows[0].customer && (
                        <span className="text-[11px] text-gray-500 truncate">{rows[0].customer}</span>
                      )}
                      <span className="ml-auto text-[11px] text-gray-400 tabular-nums whitespace-nowrap">
                        {rows.length} {rows.length === 1 ? 'style' : 'styles'}
                      </span>
                    </div>
                    <ul className="divide-y divide-gray-50">
                      {rows.map((o) => (
                        <li key={o.id} className="flex items-center gap-2 px-3 py-1.5 text-[11.5px] group">
                          <span className="font-mono text-gray-700 tabular-nums flex-shrink-0">
                            {o.style_code || `#${o.id}`}
                          </span>
                          <span className="text-gray-500 truncate">{o.description || '—'}</span>
                          <span className="ml-auto text-gray-400 tabular-nums whitespace-nowrap flex-shrink-0">
                            {fmt(o.revised_po_ex_factory || o.original_po_ex_factory) || 'no date'}
                          </span>
                          <button
                            onClick={() => setDropped((prev) => new Set(prev).add(o.id))}
                            title="Leave this style out of the request"
                            className="p-0.5 rounded text-gray-300 hover:text-red-600 hover:bg-red-50 flex-shrink-0"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            {dropped.size > 0 && (
              <button
                onClick={() => setDropped(new Set())}
                className="mt-2 text-[11.5px] font-semibold text-primary-600 hover:text-primary-700"
              >
                Put back {dropped.size} removed {dropped.size === 1 ? 'style' : 'styles'}
              </button>
            )}
          </div>
        </div>

        <footer className="px-5 py-3 border-t border-gray-200 bg-gray-50/70 flex items-center gap-3 flex-wrap">
          <p className="text-[12px] text-gray-600 min-w-0">
            {value
              ? <>Asks to move <b className="text-gray-800">{FIELD_LABEL.toLowerCase()}</b> to{' '}
                  <b className="text-gray-800">{fmt(value)}</b> on{' '}
                  <b className="text-gray-800">{picked.length} {picked.length === 1 ? 'style' : 'styles'}</b></>
              : <span className="text-gray-400">Pick a date to continue.</span>}
          </p>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-3 py-1.5 text-[12px] font-semibold text-gray-700 bg-white border border-gray-300
                         rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={!canSubmit}
              className={cn('px-4 py-1.5 text-[12px] font-bold text-white rounded-lg flex items-center gap-1.5',
                canSubmit ? 'bg-primary-600 hover:bg-primary-700' : 'bg-gray-300 cursor-not-allowed')}
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Send request
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function StepHeading({ n, title, className }: { n: number; title: string; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="w-[18px] h-[18px] rounded-full bg-gray-200 text-gray-700 text-[10px] font-bold
                       flex items-center justify-center flex-shrink-0">{n}</span>
      <span className="text-[11.5px] uppercase tracking-widest text-gray-500 font-bold">{title}</span>
    </div>
  );
}
