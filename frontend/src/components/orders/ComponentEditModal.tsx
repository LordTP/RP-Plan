'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { componentsApi, submissionsApi, type SampleSubmission, type SampleType } from '@/lib/api';
import { SAMPLE_STATUS_OPTIONS } from '@/types';
import type { Order, OrderComponent } from '@/types';
import { useStore } from '@/store/useStore';
import { AttemptBadge } from '@/components/samples/AttemptBadge';
import { AttemptHistory } from '@/components/samples/AttemptHistory';
import { RejectionContextBanner } from '@/components/samples/RejectionContextBanner';
import { RejectSampleModal } from '@/components/samples/RejectSampleModal';
import { DatePickerInput } from '@/components/ui/DatePickerInput';

/**
 * Focused component-edit modal — opened from /design-components when the user
 * clicks a component row. Manages the only two things a component carries:
 * Strike Off + Lab Dip. Auto-saves each field on change. REJECTED status
 * routes through the existing RejectSampleModal so attempt history bumps.
 */

interface Props {
  open: boolean;
  order: Order;
  component: OrderComponent;
  onClose: () => void;
  /** Called after any successful edit so the parent can refresh its list. */
  onUpdated: () => void;
  /** Optional — for users who want full order context. */
  onOpenFullOrder?: (orderId: number) => void;
}

const SAMPLE_AREAS: { type: SampleType; prefix: string; label: string; }[] = [
  { type: 'strike', prefix: 'strike_off', label: 'Strike Off' },
  { type: 'lab',    prefix: 'lab_dip',    label: 'Lab Dip' },
  { type: 'label',  prefix: 'label',      label: 'Label' },
];

export function ComponentEditModal({ open, order, component, onClose, onUpdated, onOpenFullOrder }: Props) {
  // Suppliers see the modal in read-only mode for sample fields. They get
  // the full context (status, dates, attempt history, rejection reason)
  // but can't change the lifecycle — Source Lab owns sign-off.
  const { user: currentUser } = useStore();
  const isSupplierUser = currentUser?.role === 'supplier';
  const [submissions, setSubmissions] = useState<SampleSubmission[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<{ sampleType: SampleType; currentAttempt: number } | null>(null);
  // Sticky scope for the whole modal session: edit only this component, all
  // siblings on the PO with the same name, or a hand-picked subset.
  const [scope, setScope] = useState<'single' | 'all' | 'selected'>('single');
  const [siblings, setSiblings] = useState<{ id: number; style_code: string; description: string; colour: string; component_id: number }[]>([]);
  const [selectedSiblingOrderIds, setSelectedSiblingOrderIds] = useState<Set<number>>(new Set());
  const siblingCount = siblings.length;

  // Local mirror of the component, updated optimistically on save so the
  // user sees their edit reflect immediately without a parent re-render.
  const [comp, setComp] = useState<OrderComponent>(component);
  useEffect(() => { setComp(component); }, [component]);

  // How many other styles on this PO have a component with the same name?
  // Used to label the "All on PO" scope option.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    componentsApi.getStylesWithComponent(order.po_number, component.name)
      .then((res) => {
        if (cancelled) return;
        const others = res.styles.filter((s) => s.component_id !== component.id);
        setSiblings(others);
        // Default the selected-subset to all siblings ticked, so the user
        // can quickly DESELECT the ones they don't want.
        setSelectedSiblingOrderIds(new Set(others.map((s) => s.id)));
      })
      .catch((err) => {
        // Don't fail silently — let us see if the lookup is broken.
        console.error('Failed to fetch sibling components', err);
      });
    return () => { cancelled = true; };
  }, [open, component.id, component.name, order.po_number]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !savingField) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, savingField, onClose]);

  // Pull this component's submission rows so AttemptHistory + Banner have data.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingSubs(true);
    submissionsApi.getForOrder(order.id)
      .then((res) => {
        if (cancelled) return;
        setSubmissions(res.submissions.filter(s => s.component_id === component.id));
      })
      .catch(() => { /* silent — banner just won't show v1 context */ })
      .finally(() => { if (!cancelled) setLoadingSubs(false); });
    return () => { cancelled = true; };
  }, [open, order.id, component.id]);

  const saveField = async (field: string, value: string | null) => {
    setSavingField(field);
    try {
      const useBulk = (scope === 'all' && siblingCount > 0) ||
                      (scope === 'selected' && selectedSiblingOrderIds.size > 0);
      if (useBulk) {
        // Always include the current order so the edit applies to it.
        const orderIds = scope === 'all'
          ? undefined  // omit → backend treats as "all on PO"
          : [order.id, ...Array.from(selectedSiblingOrderIds)];
        const res = await componentsApi.applyFieldToPO(component.id, {
          [field]: value,
          ...(orderIds ? { order_ids: orderIds } : {}),
        } as any);
        // applyFieldToPO doesn't return the current component back — optimistically
        // mirror the change locally so the user sees it.
        setComp((prev) => ({ ...prev, [field]: value } as OrderComponent));
        const n = res.components_updated;
        toast.success(`Updated ${n} ${n === 1 ? 'style' : 'styles'}`);
      } else {
        const updated = await componentsApi.updateComponent(component.id, { [field]: value } as any);
        setComp(updated);
      }
      onUpdated();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to save');
    } finally {
      setSavingField(null);
    }
  };

  const toggleSelectedSibling = (id: number) => {
    setSelectedSiblingOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const onStatusChange = (sampleType: SampleType, prefix: string, newValue: string) => {
    if (newValue === 'REJECTED') {
      // Route through the reject modal so we capture a reason + bump attempt.
      const currentAttempt = (comp as any)[`${prefix}_attempt_no`] || 1;
      setRejectFor({ sampleType, currentAttempt });
      return;
    }
    saveField(`${prefix}_status`, newValue);
  };

  if (!open) return null;

  const currentAttemptNo = (sampleType: SampleType, prefix: string): number =>
    (comp as any)[`${prefix}_attempt_no`] || 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm"
      onClick={savingField ? undefined : onClose}
    >
      <div
        className="w-full max-w-2xl bg-white rounded-xl shadow-xl ring-1 ring-gray-100 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3 flex-shrink-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-violet-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-gray-900 truncate">{comp.name}</h3>
            </div>
            <div className="text-[11px] text-gray-500 ml-10">
              <span className="font-mono font-semibold text-gray-700">{order.po_number}</span>
              {' · '}
              <span className="font-mono">{order.style_code}</span>
              {order.description && <> · <span>{order.description}</span></>}
              {order.colour && <> · <span>{order.colour}</span></>}
            </div>
            <div className="text-[11px] text-gray-400 ml-10 mt-0.5">
              {order.customer && <span>{order.customer}</span>}
              {order.factory && <> · <span>{order.factory}</span></>}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {onOpenFullOrder && (
              <button
                onClick={() => onOpenFullOrder(order.id)}
                className="px-2 py-1 text-[11px] font-medium text-gray-600 ring-1 ring-gray-200 rounded-md hover:bg-gray-50 flex items-center gap-1"
                title="Open full order detail"
              >
                Open order <ExternalLink className="w-3 h-3" />
              </button>
            )}
            <button
              onClick={onClose}
              disabled={!!savingField}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scope toggle — sticky for the whole edit session. */}
        <div className="border-b border-gray-100 bg-gray-50/60 flex-shrink-0">
          <div className="px-5 py-2.5 flex items-center gap-2 text-[11px] flex-wrap">
            <span className="text-gray-500 font-semibold uppercase tracking-wider mr-1">Apply edits to</span>
            <button
              onClick={() => setScope('single')}
              className={cn(
                'px-2.5 py-1 rounded-md font-medium transition-colors',
                scope === 'single'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-white ring-1 ring-gray-200'
              )}
            >
              This style only
            </button>
            <button
              onClick={() => siblingCount > 0 && setScope('all')}
              disabled={siblingCount === 0}
              title={siblingCount === 0
                ? `No other styles on ${order.po_number} have a component called "${comp.name}".`
                : undefined}
              className={cn(
                'px-2.5 py-1 rounded-md font-medium transition-colors',
                scope === 'all'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : siblingCount === 0
                    ? 'text-gray-400 ring-1 ring-gray-200 cursor-not-allowed'
                    : 'text-gray-600 hover:bg-white ring-1 ring-gray-200'
              )}
            >
              All {siblingCount + 1} styles on PO
            </button>
            <button
              onClick={() => siblingCount > 0 && setScope('selected')}
              disabled={siblingCount === 0}
              className={cn(
                'px-2.5 py-1 rounded-md font-medium transition-colors',
                scope === 'selected'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : siblingCount === 0
                    ? 'text-gray-400 ring-1 ring-gray-200 cursor-not-allowed'
                    : 'text-gray-600 hover:bg-white ring-1 ring-gray-200'
              )}
            >
              Select specific
              {scope === 'selected' && (
                <span className="ml-1.5 px-1 py-0.5 rounded bg-white/25 text-[9px] font-bold">
                  {selectedSiblingOrderIds.size + 1}
                </span>
              )}
            </button>
            {scope === 'all' && siblingCount > 0 && (
              <span className="text-violet-700 italic ml-1">
                Pushes to every <strong>"{comp.name}"</strong> on {order.po_number}
              </span>
            )}
            {siblingCount === 0 && (
              <span className="text-gray-400 italic ml-1">
                Only one style on {order.po_number} has <strong>"{comp.name}"</strong>.
              </span>
            )}
          </div>

          {/* Sibling picker — shown when scope is "selected" */}
          {scope === 'selected' && siblings.length > 0 && (
            <div className="px-5 pb-3">
              <div className="flex items-center gap-2 text-[10px] text-gray-500 mb-1.5">
                <span>This style ({order.style_code}) is always included</span>
                <button
                  onClick={() => {
                    const allSelected = selectedSiblingOrderIds.size === siblings.length;
                    setSelectedSiblingOrderIds(allSelected ? new Set() : new Set(siblings.map(s => s.id)));
                  }}
                  className="ml-auto text-violet-700 hover:text-violet-800 font-semibold"
                >
                  {selectedSiblingOrderIds.size === siblings.length ? 'Deselect all' : 'Select all'}
                </button>
              </div>
              <div className="border border-gray-200 rounded-md bg-white max-h-40 overflow-y-auto divide-y divide-gray-100">
                {siblings.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-3 h-3 rounded border-gray-300"
                      checked={selectedSiblingOrderIds.has(s.id)}
                      onChange={() => toggleSelectedSibling(s.id)}
                    />
                    <span className="font-mono text-gray-700">{s.style_code}</span>
                    <span className="text-gray-500 truncate flex-1">{s.description}</span>
                    {s.colour && <span className="text-gray-400">{s.colour}</span>}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>


        {/* Body — only the section matching the component's sample_type is
            shown. Each component tracks one type; the other's fields are
            either empty (new shape) or legacy data we don't surface here. */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6 bg-gray-50/40">
          {SAMPLE_AREAS.filter(({ prefix }) => prefix === comp.sample_type).map(({ type, prefix, label }) => {
            const status = (comp as any)[`${prefix}_status`] as string | null;
            const received = (comp as any)[`${prefix}_received`] as string | null;
            const approved = (comp as any)[`${prefix}_approved`] as string | null;
            const attemptNo = (comp as any)[`${prefix}_attempt_no`] as number | undefined;
            const rejectionCount = (comp as any)[`${prefix}_rejection_count`] as number | undefined;
            const lastRejection = (comp as any)[`${prefix}_last_rejection`];
            return (
              <section key={prefix} className="bg-white rounded-lg ring-1 ring-gray-200">
                <header className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/60 flex items-center gap-2">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-700">{label}</h4>
                  <AttemptBadge attemptNo={attemptNo} rejectionCount={rejectionCount} size="xs" />
                </header>

                {lastRejection && (
                  <div className="px-4 pt-3">
                    <RejectionContextBanner
                      rejection={lastRejection}
                      attemptNo={attemptNo}
                      sampleAreaLabel={label}
                      size="sm"
                    />
                  </div>
                )}

                <div className="px-4 py-3 grid grid-cols-3 gap-3">
                  <FieldBlock label="Status" saving={savingField === `${prefix}_status`}>
                    {isSupplierUser ? (
                      <div className="w-full text-xs px-2 py-1.5 rounded-md bg-gray-50 border border-gray-200 text-gray-700">
                        {status || <span className="text-gray-400 italic">— Not set —</span>}
                      </div>
                    ) : (
                      <select
                        value={status || ''}
                        onChange={(e) => onStatusChange(type, prefix, e.target.value)}
                        disabled={savingField === `${prefix}_status`}
                        className="w-full text-xs border border-gray-300 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-violet-500 focus:border-violet-500 disabled:opacity-50"
                      >
                        <option value="">— Not set —</option>
                        {SAMPLE_STATUS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    )}
                  </FieldBlock>
                  <FieldBlock label="Received" saving={savingField === `${prefix}_received`}>
                    {isSupplierUser ? (
                      <div className="w-full text-xs px-2 py-1.5 rounded-md bg-gray-50 border border-gray-200 text-gray-700">
                        {received ? format(parseISO(received), 'd MMM yyyy') : <span className="text-gray-400 italic">—</span>}
                      </div>
                    ) : (
                      <DatePickerInput
                        value={received ? received.split('T')[0] : ''}
                        onChange={(v) => saveField(`${prefix}_received`, v || null)}
                        variant="block"
                        size="sm"
                      />
                    )}
                  </FieldBlock>
                  <FieldBlock label="Approved" saving={savingField === `${prefix}_approved`}>
                    {isSupplierUser ? (
                      <div className="w-full text-xs px-2 py-1.5 rounded-md bg-gray-50 border border-gray-200 text-gray-700">
                        {approved ? format(parseISO(approved), 'd MMM yyyy') : <span className="text-gray-400 italic">—</span>}
                      </div>
                    ) : (
                      <DatePickerInput
                        value={approved ? approved.split('T')[0] : ''}
                        onChange={(v) => saveField(`${prefix}_approved`, v || null)}
                        variant="block"
                        size="sm"
                      />
                    )}
                  </FieldBlock>
                </div>

                {/* Attempt history */}
                <div className="px-4 pb-3">
                  <AttemptHistory
                    submissions={submissions}
                    componentId={component.id}
                    sampleType={type}
                    size="sm"
                  />
                </div>
              </section>
            );
          })}

          {loadingSubs && (
            <div className="text-center text-[11px] text-gray-400 italic">
              <Loader2 className="w-3 h-3 animate-spin inline mr-1" />
              Loading attempt history…
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-2 bg-white flex-shrink-0">
          <span className="text-[10px] text-gray-400">
            Last updated {comp.updated_at ? format(parseISO(comp.updated_at), 'd MMM HH:mm') : '—'}
          </span>
          <button
            onClick={onClose}
            disabled={!!savingField}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>

      {/* Reject sample modal — opens when user picks REJECTED on a status dropdown. */}
      {rejectFor && (
        <RejectSampleModal
          orderId={order.id}
          componentId={component.id}
          componentName={component.name}
          sampleType={rejectFor.sampleType}
          currentAttemptNo={rejectFor.currentAttempt}
          onClose={() => setRejectFor(null)}
          onRejected={() => {
            setRejectFor(null);
            // Refetch submissions + parent data so banner + history catch up.
            submissionsApi.getForOrder(order.id)
              .then((res) => setSubmissions(res.submissions.filter(s => s.component_id === component.id)))
              .catch(() => {});
            onUpdated();
          }}
        />
      )}
    </div>
  );
}

function FieldBlock({ label, saving, children }: { label: string; saving: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className={cn(
        'text-[10px] font-semibold uppercase tracking-wider mb-1 flex items-center gap-1.5',
        saving ? 'text-violet-600' : 'text-gray-400',
      )}>
        {label}
        {saving && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
      </label>
      {children}
    </div>
  );
}
