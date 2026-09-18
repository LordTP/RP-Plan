'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { statusPillStyle } from '@/features/component-shared';
import { DEFAULT_SCOPE, type ApplyScope } from '@/components/samples/ScopePicker';
import { componentsApi, submissionsApi, type SampleSubmission, type SampleType, type CanonicalDetail } from '@/lib/api';
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
  // Colour, positions and the spec live on the CANONICAL, not the instance —
  // the instance only carries its own sample lifecycle. Fetched so the header
  // can show what the component actually is, not just where it sits.
  const [canonical, setCanonical] = useState<CanonicalDetail | null>(null);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<{ sampleType: SampleType; currentAttempt: number } | null>(null);
  // Sticky scope for the whole modal session: edit only this component, all
  // siblings on the PO with the same name, or a hand-picked subset.
  // Same vocabulary as the sample modals (see ScopePicker's ApplyScope) —
  // this used to call the middle option 'all' while they called the identical
  // concept 'all_on_po'. The UI stays a segmented bar rather than their radio
  // stack: it's a sticky header for a whole editing session, not a one-off
  // choice inside a dialog.
  const [scope, setScope] = useState<ApplyScope>(DEFAULT_SCOPE);
  const [siblings, setSiblings] = useState<{ id: number; po_number?: string; customer?: string; style_code: string; description: string; colour: string; component_id: number }[]>([]);
  const [selectedSiblingOrderIds, setSelectedSiblingOrderIds] = useState<Set<number>>(new Set());
  const siblingCount = siblings.length;

  // Which POs this component reaches beyond the one you opened it from.
  const siblingPoSummary = (() => {
    const pos = Array.from(new Set(siblings.map((x) => x.po_number).filter(Boolean) as string[]));
    const others = pos.filter((po) => po !== order.po_number);
    if (siblingCount === 0) return undefined;
    if (others.length === 0) return `same PO`;
    return `${others.length + 1} POs`;
  })();

  const exFacRaw = order.revised_po_ex_factory || order.original_po_ex_factory;
  const exFacLabel = exFacRaw
    ? format(parseISO(String(exFacRaw).split('T')[0]), 'd MMM yyyy')
    : (order.date_notes?.revised_po_ex_factory || order.date_notes?.original_po_ex_factory || '—');

  // Local mirror of the component, updated optimistically on save so the
  // user sees their edit reflect immediately without a parent re-render.
  const [comp, setComp] = useState<OrderComponent>(component);
  useEffect(() => { setComp(component); }, [component]);

  useEffect(() => {
    let cancel = false;
    const id = component.canonical_id;
    if (id == null) { setCanonical(null); return; }
    componentsApi.getLibraryEntry(id)
      .then((d) => { if (!cancel) setCanonical(d); })
      // Non-fatal: the header just shows less. Legacy instances predate
      // canonicals and legitimately have none.
      .catch(() => { if (!cancel) setCanonical(null); });
    return () => { cancel = true; };
  }, [component.canonical_id]);

  // Sibling lookup — prefer canonical (across POs, added-together batch)
  // when the instance has one; fall back to the legacy by-name / same-PO
  // lookup for pre-canonical rows.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const lookup = component.canonical_id != null
      ? componentsApi.getStylesWithCanonical(component.canonical_id).then((res) => res.styles)
      : componentsApi.getStylesWithComponent(order.po_number, component.name)
          .then((res) => res.styles.map((s) => ({
            ...s,
            po_number: order.po_number,
            customer: order.customer || '',
          })));
    lookup
      .then((styles) => {
        if (cancelled) return;
        const others = styles.filter((s) => s.component_id !== component.id);
        setSiblings(others);
        // Default the selected-subset to all siblings ticked, so the user
        // can quickly DESELECT the ones they don't want.
        setSelectedSiblingOrderIds(new Set(others.map((s) => s.id)));
      })
      .catch((err) => {
        console.error('Failed to fetch sibling components', err);
      });
    return () => { cancelled = true; };
  }, [open, component.id, component.name, component.canonical_id, order.po_number, order.customer]);

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

  /** Edits held back until Save.
   *
   *  Every field used to write the moment it changed, so tabbing out of a date
   *  committed it -- and on a bulk scope that is a write across every style on
   *  the PO from a keystroke the user had not finished making. Staging them
   *  also means one request for a status and two dates rather than three.
   */
  const [draft, setDraft] = useState<Record<string, string | null>>({});
  const dirty = Object.keys(draft).length > 0;
  const stage = (field: string, value: string | null) =>
    setDraft((d) => ({ ...d, [field]: value }));
  /** What a field shows: the pending edit if there is one, else the saved value. */
  const fieldValue = (field: string) =>
    (field in draft ? draft[field] : (comp as any)[field]) as string | null;

  const saveField = async (field: string, value: string | null) => {
    setSavingField(field);
    try {
      const useBulk = (scope === 'all_on_po' && siblingCount > 0) ||
                      (scope === 'selected' && selectedSiblingOrderIds.size > 0);
      if (useBulk) {
        // For 'all' scope with a canonical link, siblings can span POs so we
        // must send the full order_id list — the backend's fallback "all on
        // this PO" would miss cross-PO siblings otherwise. Legacy rows (no
        // canonical) still use "all on PO" via the undefined shortcut.
        const canonicalAware = component.canonical_id != null;
        const orderIds = scope === 'all_on_po'
          ? (canonicalAware ? [order.id, ...siblings.map((s) => s.id)] : undefined)
          : [order.id, ...Array.from(selectedSiblingOrderIds)];
        const res = await componentsApi.applyFieldToPO(component.id, {
          [field]: value,
          ...(orderIds ? { order_ids: orderIds } : {}),
        } as any);
        // applyFieldToPO doesn't return the current component back — optimistically
        // mirror the change locally so the user sees it.
        setComp((prev) => ({ ...prev, [field]: value } as OrderComponent));
        const n = res.components_updated;
        toast.success(`Updated "${comp.name}" on ${n} ${n === 1 ? 'style' : 'styles'}`);
      } else {
        const updated = await componentsApi.updateComponent(component.id, { [field]: value } as any);
        setComp(updated);
      }
      onUpdated();
      return true;
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to save');
      return false;
    } finally {
      setSavingField(null);
    }
  };

  /** Write every staged field in one go. Sequential rather than parallel: the
   *  bulk path fans each field out across the PO's styles, and three of those
   *  racing each other is how you get a half-applied edit. */
  const saveDraft = async () => {
    const entries = Object.entries(draft);
    if (!entries.length) return;
    for (const [field, value] of entries) {
      // Stop on the first failure -- saveField has already told the user why,
      // and pressing on would leave a partial edit with no way to tell which
      // half landed.
      const ok = await saveField(field, value);
      if (!ok) return;
    }
    setDraft({});
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
    stage(`${prefix}_status`, newValue);
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
        className="w-full max-w-4xl bg-white rounded-xl shadow-2xl ring-1 ring-gray-200 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header. Leads with the component, then the style it's on, then
            the fact that most people open this modal without knowing: it is
            on other styles too, and anything you change here can reach them. */}
        <div className="px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-widest text-primary-600 font-bold">
                {SAMPLE_AREAS.find((a) => a.prefix === comp.sample_type)?.label || 'Component'}
              </div>
              <div className="flex items-center gap-2 flex-wrap mt-0.5">
                <h3 className="text-[17px] font-bold text-gray-900 leading-tight truncate">{comp.name}</h3>
                {canonical?.colour && (
                  <span className="text-[10.5px] font-semibold text-gray-700 bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5">
                    {canonical.colour}
                  </span>
                )}
                {(canonical?.position || []).map((pos: string) => (
                  <span key={pos} className="text-[9.5px] font-bold uppercase tracking-wide text-amber-800 bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5">
                    {pos.replace('CHEST POSITION – ', 'CHEST ').replace(' AS WORN', '')}
                  </span>
                ))}
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

        </div>

        {/* Two columns, the same split the factory modal uses: what the thing
            IS on the left, what you are doing to it on the right. One column at
            max-w-2xl meant the four context facts sat above the fields and
            pushed the status pills below the fold on a laptop. */}
        <div className="flex-1 min-h-0 grid md:grid-cols-[minmax(0,300px)_minmax(0,1fr)] overflow-hidden">

        {/* Left — context, read-only */}
        <div className="md:border-r border-b md:border-b-0 border-gray-200 bg-gray-50/50
                        px-5 py-4 md:h-full min-h-0 overflow-y-auto">
          <SideLabel>This style</SideLabel>
          <dl>
            <SideFact label="Style" value={order.style_code || `#${order.id}`} mono />
            <SideFact label="Description" value={order.description} />
            <SideFact label="PO" value={order.po_number} mono />
            <SideFact label="Customer" value={order.customer} />
            <SideFact label="Ex-factory" value={exFacLabel} />
            <SideFact label="Season" value={order.season} />
          </dl>

          <SideLabel>The component</SideLabel>
          <dl>
            <SideFact label="Sample" value={SAMPLE_AREAS.find((a) => a.prefix === comp.sample_type)?.label} />
            <SideFact label="Spec" value={canonical?.spec_url} mono />
            <SideFact label="Colour" value={canonical?.colour} />
            <SideFact label="Placement" value={(canonical?.position || []).join(', ')} />
            <SideFact
              label="Also on"
              value={siblingCount === 0 ? 'This style only' : `${siblingCount} other ${siblingCount === 1 ? 'style' : 'styles'}`}
              sub={siblingCount > 0 ? siblingPoSummary : undefined}
            />
          </dl>

          {(canonical?.description || canonical?.supplier_notes) && (
            <>
              <SideLabel>Brief</SideLabel>
              {canonical?.description && (
                <p className="text-[12px] text-gray-700 leading-relaxed">{canonical.description}</p>
              )}
              {canonical?.supplier_notes && (
                <p className="text-[12px] text-gray-700 leading-relaxed mt-2 rounded-lg bg-amber-50
                              ring-1 ring-amber-200 px-2.5 py-2">{canonical.supplier_notes}</p>
              )}
            </>
          )}
        </div>

        {/* Right — the editing */}
        <div className="min-w-0 md:h-full min-h-0 overflow-y-auto flex flex-col">
        {/* Scope toggle — sticky for the whole edit session. */}
        <div className="border-b border-gray-100 bg-gray-50/60 flex-shrink-0">
          <div className="px-5 py-2.5 flex items-center gap-2 text-[11px] flex-wrap">
            <span className="text-gray-500 font-semibold uppercase tracking-wider mr-1">Apply edits to</span>
            <button
              onClick={() => setScope('single')}
              className={cn(
                'px-2.5 py-1 rounded-md font-medium transition-colors',
                scope === 'single'
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-white ring-1 ring-gray-200'
              )}
            >
              This style only
            </button>
            <button
              onClick={() => siblingCount > 0 && setScope('all_on_po')}
              disabled={siblingCount === 0}
              title={siblingCount === 0
                ? `No other styles share "${comp.name}" with this one.`
                : undefined}
              className={cn(
                'px-2.5 py-1 rounded-md font-medium transition-colors',
                scope === 'all_on_po'
                  ? 'bg-primary-600 text-white shadow-sm'
                  : siblingCount === 0
                    ? 'text-gray-400 ring-1 ring-gray-200 cursor-not-allowed'
                    : 'text-gray-600 hover:bg-white ring-1 ring-gray-200'
              )}
            >
              All {siblingCount + 1} styles with this component
            </button>
            <button
              onClick={() => siblingCount > 0 && setScope('selected')}
              disabled={siblingCount === 0}
              className={cn(
                'px-2.5 py-1 rounded-md font-medium transition-colors',
                scope === 'selected'
                  ? 'bg-primary-600 text-white shadow-sm'
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
            {scope === 'all_on_po' && siblingCount > 0 && (
              <span className="text-primary-700 italic ml-1">
                Pushes to every style linked to <strong>"{comp.name}"</strong>
                {component.canonical_id != null ? ' (across POs where applicable)' : ` on ${order.po_number}`}
              </span>
            )}
            {siblingCount === 0 && (
              <span className="text-gray-400 italic ml-1">
                No other styles share <strong>"{comp.name}"</strong> with this one.
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
                  className="ml-auto text-primary-700 hover:text-primary-800 font-semibold"
                >
                  {selectedSiblingOrderIds.size === siblings.length ? 'Deselect all' : 'Select all'}
                </button>
              </div>
              <div className="border border-gray-200 rounded-md bg-white max-h-48 overflow-y-auto divide-y divide-gray-100">
                {(() => {
                  // Group siblings by PO number so cross-PO cases read clearly.
                  const groups = new Map<string, typeof siblings>();
                  for (const s of siblings) {
                    const po = s.po_number || order.po_number || '—';
                    if (!groups.has(po)) groups.set(po, []);
                    groups.get(po)!.push(s);
                  }
                  const ordered = Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
                  return ordered.map(([po, group]) => {
                    const anyOn = group.some((s) => selectedSiblingOrderIds.has(s.id));
                    const allOn = group.every((s) => selectedSiblingOrderIds.has(s.id));
                    const customer = group[0]?.customer;
                    return (
                      <div key={po}>
                        <div className="flex items-center gap-2 px-2.5 py-1 bg-gray-50 text-[10px] uppercase tracking-widest font-bold text-gray-500 border-b border-gray-100">
                          <input
                            type="checkbox"
                            className="w-3 h-3 rounded border-gray-300"
                            checked={allOn}
                            ref={(el) => { if (el) el.indeterminate = !allOn && anyOn; }}
                            onChange={() => {
                              const next = new Set(selectedSiblingOrderIds);
                              if (allOn) group.forEach((s) => next.delete(s.id));
                              else group.forEach((s) => next.add(s.id));
                              setSelectedSiblingOrderIds(next);
                            }}
                          />
                          <span>PO {po}</span>
                          {customer && <span className="normal-case tracking-normal font-medium text-gray-600 truncate">· {customer}</span>}
                          <span className="ml-auto text-gray-400 tabular-nums normal-case tracking-normal">{group.length}</span>
                        </div>
                        {group.map((s) => (
                          <label key={s.id} className="flex items-center gap-2 px-2.5 py-1.5 pl-6 text-[11px] hover:bg-gray-50 cursor-pointer">
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
                    );
                  });
                })()}
              </div>
            </div>
          )}
        </div>


        {/* Body — only the section matching the component's sample_type is
            shown. Each component tracks one type; the other's fields are
            either empty (new shape) or legacy data we don't surface here. */}
        <div className="flex-1 px-5 py-4 space-y-6">
          {SAMPLE_AREAS.filter(({ prefix }) => prefix === comp.sample_type).map(({ type, prefix, label }) => {
            // Read through the draft so a staged edit shows immediately --
            // otherwise picking a date appears to do nothing until Save.
            const status = fieldValue(`${prefix}_status`);
            const received = fieldValue(`${prefix}_received`);
            const approved = fieldValue(`${prefix}_approved`);
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

                <div className="px-4 py-3 space-y-3">
                  <FieldBlock label="Status" saving={savingField === `${prefix}_status`}>
                    {isSupplierUser ? (
                      <div className="w-full text-xs px-2 py-1.5 rounded-md bg-gray-50 border border-gray-200 text-gray-700">
                        {status || <span className="text-gray-400 italic">— Not set —</span>}
                      </div>
                    ) : (
                      <StatusPicker
                        value={status}
                        disabled={savingField === `${prefix}_status`}
                        onChange={(v) => onStatusChange(type, prefix, v)}
                      />
                    )}
                  </FieldBlock>
                  <div className="grid grid-cols-2 gap-3">
                  <FieldBlock label="Received" saving={savingField === `${prefix}_received`}>
                    {isSupplierUser ? (
                      <div className="w-full text-xs px-2 py-1.5 rounded-md bg-gray-50 border border-gray-200 text-gray-700">
                        {received ? format(parseISO(received), 'd MMM yyyy') : <span className="text-gray-400 italic">—</span>}
                      </div>
                    ) : (
                      <DatePickerInput
                        value={received ? received.split('T')[0] : ''}
                        onChange={(v) => stage(`${prefix}_received`, v || null)}
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
                        onChange={(v) => stage(`${prefix}_approved`, v || null)}
                        variant="block"
                        size="sm"
                      />
                    )}
                  </FieldBlock>
                  </div>
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

        </div>{/* right column */}
        </div>{/* two columns */}

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-2 bg-white flex-shrink-0">
          <span className="text-[10px] text-gray-400">
            {dirty
              ? <span className="text-amber-700 font-semibold">Unsaved changes</span>
              : <>Last updated {comp.updated_at ? format(parseISO(comp.updated_at), 'd MMM HH:mm') : '—'}</>}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                // Discarding is the destructive half of this pair, so it asks.
                if (dirty && !window.confirm('Discard the changes you have not saved?')) return;
                onClose();
              }}
              disabled={!!savingField}
              className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              {dirty ? 'Discard' : 'Close'}
            </button>
            <button
              onClick={saveDraft}
              disabled={!dirty || !!savingField}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-primary-600 rounded-md
                         hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {savingField ? 'Saving…' : 'Save'}
            </button>
          </div>
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

function SideLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5 mt-4 first:mt-0">
      {children}
    </p>
  );
}

/** Renders nothing when there is nothing to say. A fixed grid of labels meant
 *  an unset spec and an unset placement each left a row reading "—", which is
 *  four lines telling you nothing on a component that has not been briefed. */
function SideFact({ label, value, sub, mono }: {
  label: string; value?: string | null; sub?: string | null; mono?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 border-b border-gray-200/70 last:border-0">
      <dt className="text-[11px] text-gray-500 flex-shrink-0">{label}</dt>
      <dd className="min-w-0 text-right">
        <span className={cn('block text-[12px] font-semibold text-gray-900 truncate', mono && 'font-mono')}>
          {value}
        </span>
        {sub && <span className="block text-[10.5px] text-gray-400 truncate">{sub}</span>}
      </dd>
    </div>
  );
}

function FieldBlock({ label, saving, children }: { label: string; saving: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className={cn(
        'text-[10px] font-semibold uppercase tracking-wider mb-1 flex items-center gap-1.5',
        saving ? 'text-primary-600' : 'text-gray-400',
      )}>
        {label}
        {saving && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
      </label>
      {children}
    </div>
  );
}

/** One fact in the header strip. Four of these beat a run-on line of
 *  dot-separated values, where everything is the same weight and you have to
 *  read all of it to find the one thing you wanted. */
function HeaderFact({
  label, value, sub, mono, tone,
}: {
  label: string;
  value: string;
  sub?: string;
  mono?: boolean;
  tone?: 'primary';
}) {
  return (
    <div className={cn(
      'rounded-lg border px-2.5 py-1.5 min-w-0',
      tone === 'primary' ? 'border-primary-200 bg-primary-50/60' : 'border-gray-200 bg-gray-50/60',
    )}>
      <div className="text-[9px] uppercase tracking-widest text-gray-400 font-bold leading-none">{label}</div>
      <div className={cn(
        'text-[12px] font-semibold truncate mt-1',
        mono && 'font-mono',
        tone === 'primary' ? 'text-primary-800' : 'text-gray-800',
      )}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-gray-400 truncate leading-tight">{sub}</div>}
    </div>
  );
}

/**
 * Status as pills rather than a native <select>.
 *
 * The select showed raw uppercase values in a system dropdown — it read as a
 * form someone hadn't finished. These carry the same colours the status shows
 * everywhere else in the app, so the control and the readout agree, and the
 * current value is visible without opening anything.
 */
function StatusPicker({
  value, disabled, onChange,
}: {
  value: string | null;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  const current = (value || '').trim().toUpperCase();
  return (
    <div className={cn('flex flex-wrap gap-1', disabled && 'opacity-50 pointer-events-none')}>
      {SAMPLE_STATUS_OPTIONS.map((opt) => {
        const on = current === opt;
        const pill = statusPillStyle(opt);
        // REJECTED is destructive and opens the reason modal, so it reads as
        // an action rather than just another value to sit on.
        const danger = opt === 'REJECTED';
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={cn(
              'px-2 py-1 rounded-md text-[10.5px] font-bold uppercase tracking-wide border transition-colors',
              on
                ? cn(pill.bg, pill.text, 'border-current/30 ring-2 ring-offset-1 ring-gray-300')
                : danger
                  ? 'bg-white border-red-200 text-red-600 hover:bg-red-50'
                  : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700',
            )}
          >
            {pill.label}
          </button>
        );
      })}
      {current && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="px-2 py-1 rounded-md text-[10.5px] font-medium text-gray-400 hover:text-gray-600 underline decoration-dotted"
        >
          Clear
        </button>
      )}
    </div>
  );
}
