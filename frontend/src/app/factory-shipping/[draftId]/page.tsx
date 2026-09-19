'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Search, Loader2, Check, ChevronDown, ChevronRight,
  AlertTriangle, X, Save, CheckCheck, Edit2, Undo2, Circle,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';
import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider } from '@/components/layout/AuthProvider';
import { useStore } from '@/store/useStore';
import { DatePickerInput } from '@/components/ui/DatePickerInput';
import {
  shipmentDraftsApi,
  type ShipmentDraftDetail,
  type ShipmentDraftOrderRow,
  type PickerPO,
  type PickerStyle,
  type ShipmentDraftStatus,
} from '@/lib/api';
import { getShipmentChecklist, sailingDatesImpossible } from '@/lib/shipmentReadiness';
import { cn } from '@/lib/utils';

export default function DraftDetailPage() {
  return (
    <AuthProvider>
      <DraftDetail />
    </AuthProvider>
  );
}

function DraftDetail() {
  const params = useParams();
  const router = useRouter();
  const draftId = Number(params?.draftId);
  const { user } = useStore();

  const [draft, setDraft] = useState<ShipmentDraftDetail | null>(null);
  const [pos, setPos] = useState<PickerPO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  // Local edit state — synced with the saved draft on every reload.
  const [reference, setReference] = useState('');
  const [name, setName] = useState('');
  const [fclLcl, setFclLcl] = useState<string>('');
  const [vesselName, setVesselName] = useState('');
  const [vesselEtd, setVesselEtd] = useState('');
  const [vesselEtaToPort, setVesselEtaToPort] = useState('');
  const [trackingReference, setTrackingReference] = useState('');

  // Staged SKU selection — orderId -> quantity. Everything the user does on
  // the left column edits THIS, not the server. `savedSelection` is what the
  // server currently holds, so Save can diff the two and Discard can put it
  // back. Before this, ticking a style wrote immediately while the fields
  // beside it waited for Save, which made the one Save button a lie.
  const [selection, setSelection] = useState<Map<number, number>>(new Map());
  const [savedSelection, setSavedSelection] = useState<Map<number, number>>(new Map());

  // Picker UI state
  const [search, setSearch] = useState('');
  const [expandedPo, setExpandedPo] = useState<Set<string>>(new Set());
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  // "Edit shipping fields" mode for a CONFIRMED shipment. Unlocks the right
  // column only — SKUs/qtys stay frozen since they're already shipped.
  const [editingConfirmed, setEditingConfirmed] = useState(false);
  const [savingConfirmed, setSavingConfirmed] = useState(false);

  // The right column is read-only when the shipment is confirmed AND we're
  // not actively editing it. The left column (SKUs/qtys) stays locked
  // regardless once confirmed — that's intentional, you can't reshape what's
  // already shipped.
  const isConfirmed = draft?.status === 'confirmed';
  const isLocked = draft?.status !== 'draft' && !editingConfirmed;
  const skusLocked = draft?.status !== 'draft';
  const linkedOrderIds = useMemo(() => new Set(selection.keys()), [selection]);
  const linkedQuantityById = useMemo(() => {
    const map = new Map<number, number | null>();
    selection.forEach((qty, id) => map.set(id, qty));
    return map;
  }, [selection]);

  // Initial load — shows the page spinner. Run once on mount.
  const loadAll = useCallback(async () => {
    if (!draftId) return;
    setIsLoading(true);
    try {
      const d = await shipmentDraftsApi.get(draftId);
      setDraft(d);
      const p = await shipmentDraftsApi.pickerOrders(d.factory).catch((err) => {
        const msg = err?.response?.data?.detail;
        if (msg) toast.error(`Picker: ${msg}`);
        return { pos: [] };
      });
      setPos(p.pos);
      // Sync edit state with server values on initial load. Subsequent
      // refreshes don't touch these — the user's mid-edits would otherwise
      // get clobbered.
      setReference(d.reference);
      setName(d.name || '');
      setFclLcl(d.fcl_lcl || '');
      setVesselName(d.vessel_name || '');
      setVesselEtd(d.vessel_etd ? d.vessel_etd.slice(0, 10) : '');
      setVesselEtaToPort(d.vessel_eta_to_port ? d.vessel_eta_to_port.slice(0, 10) : '');
      setTrackingReference(d.tracking_reference || '');
      const sel = new Map<number, number>();
      for (const o of d.orders || []) sel.set(o.order_id, o.quantity ?? o.total_quantity ?? 0);
      setSelection(new Map(sel));
      setSavedSelection(new Map(sel));
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to load draft');
    } finally {
      setIsLoading(false);
    }
  }, [draftId]);

  // Silent refresh — used after toggle/qty/save actions. Only refetches the
  // draft (not the picker — picker data is effectively static during a
  // session) and never blanks the UI with the page-level spinner.
  const refreshDraft = useCallback(async () => {
    if (!draftId) return;
    try {
      const d = await shipmentDraftsApi.get(draftId);
      setDraft(d);
      // Only ever called straight after a successful save, so the server is
      // now the truth for both sides of the diff.
      const sel = new Map<number, number>();
      for (const o of d.orders || []) sel.set(o.order_id, o.quantity ?? o.total_quantity ?? 0);
      setSelection(new Map(sel));
      setSavedSelection(new Map(sel));
    } catch {
      // Silent — the action that triggered this refresh already toasts errors.
    }
  }, [draftId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Backwards-compat alias so existing call sites in the file (handleSave,
  // handleConfirm) keep working. handleSave needs server values written back
  // so we still want a draft refetch — but quietly.
  const refresh = refreshDraft;

  // Default ship quantity for a newly ticked style — the whole PO line,
  // which is what the backend used to pick on its own.
  const totalQtyByOrderId = useMemo(() => {
    const map = new Map<number, number>();
    for (const p of pos) for (const st of p.styles) map.set(st.order_id, st.total_quantity || 0);
    return map;
  }, [pos]);

  // ---- Staged edits. None of these touch the server. --------------------

  const handleToggleStyle = (orderId: number) => {
    if (isLocked) return;
    setSelection((prev) => {
      const next = new Map(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.set(orderId, totalQtyByOrderId.get(orderId) || 0);
      return next;
    });
  };

  const handleTogglePo = (po: PickerPO) => {
    if (isLocked) return;
    setSelection((prev) => {
      const next = new Map(prev);
      const allSelected = po.styles.every(st => next.has(st.order_id));
      for (const st of po.styles) {
        if (allSelected) next.delete(st.order_id);
        else if (!next.has(st.order_id)) next.set(st.order_id, totalQtyByOrderId.get(st.order_id) || 0);
      }
      return next;
    });
  };

  const handleQuantityChange = (orderId: number, qty: number) => {
    if (isLocked) return;
    setSelection((prev) => {
      if (!prev.has(orderId)) return prev;
      const next = new Map(prev);
      next.set(orderId, qty);
      return next;
    });
  };

  // ---- What is actually outstanding ------------------------------------

  const selectionDiff = useMemo(() => {
    const added: number[] = [];
    const removed: number[] = [];
    const requantified: Array<[number, number]> = [];
    selection.forEach((qty, id) => {
      if (!savedSelection.has(id)) added.push(id);
      else if (savedSelection.get(id) !== qty) requantified.push([id, qty]);
    });
    savedSelection.forEach((_qty, id) => { if (!selection.has(id)) removed.push(id); });
    return { added, removed, requantified };
  }, [selection, savedSelection]);

  const fieldsDirty = useMemo(() => {
    if (!draft) return false;
    return (
      reference !== draft.reference ||
      (name || '') !== (draft.name || '') ||
      (fclLcl || '') !== (draft.fcl_lcl || '') ||
      (vesselName || '') !== (draft.vessel_name || '') ||
      vesselEtd !== (draft.vessel_etd ? draft.vessel_etd.slice(0, 10) : '') ||
      vesselEtaToPort !== (draft.vessel_eta_to_port ? draft.vessel_eta_to_port.slice(0, 10) : '') ||
      (trackingReference || '') !== (draft.tracking_reference || '')
    );
  }, [draft, reference, name, fclLcl, vesselName, vesselEtd, vesselEtaToPort, trackingReference]);

  const selectionDirty =
    selectionDiff.added.length > 0 ||
    selectionDiff.removed.length > 0 ||
    selectionDiff.requantified.length > 0;

  const isDirty = !isLocked && (fieldsDirty || selectionDirty);

  // Plain-English list of what Save is about to do, shown in the footer.
  const pendingSummary = useMemo(() => {
    const parts: string[] = [];
    const { added, removed, requantified } = selectionDiff;
    if (added.length) parts.push(`${added.length} style${added.length === 1 ? '' : 's'} added`);
    if (removed.length) parts.push(`${removed.length} removed`);
    if (requantified.length) parts.push(`${requantified.length} quantity change${requantified.length === 1 ? '' : 's'}`);
    if (fieldsDirty) parts.push('shipment details edited');
    return parts.join(' · ');
  }, [selectionDiff, fieldsDirty]);

  const datesImpossible = sailingDatesImpossible(vesselEtd, vesselEtaToPort);

  const handleDiscard = () => {
    if (!draft) return;
    setReference(draft.reference);
    setName(draft.name || '');
    setFclLcl(draft.fcl_lcl || '');
    setVesselName(draft.vessel_name || '');
    setVesselEtd(draft.vessel_etd ? draft.vessel_etd.slice(0, 10) : '');
    setVesselEtaToPort(draft.vessel_eta_to_port ? draft.vessel_eta_to_port.slice(0, 10) : '');
    setTrackingReference(draft.tracking_reference || '');
    setSelection(new Map(savedSelection));
    toast.success('Changes discarded');
  };

  /** Writes everything staged. Returns false if anything failed, so callers
   *  (Confirm) know not to carry on. */
  const handleSave = async (): Promise<boolean> => {
    if (!draft) return false;
    if (datesImpossible) {
      toast.error('ETA to port is before the vessel ETD — check the dates');
      return false;
    }
    setIsSaving(true);
    try {
      // Removals first: if a style is being swapped the link table has a
      // uniqueness constraint per (draft, order), and removing before adding
      // keeps that clean.
      for (const orderId of selectionDiff.removed) {
        await shipmentDraftsApi.removeOrder(draft.id, orderId);
      }
      if (selectionDiff.added.length > 0) {
        await shipmentDraftsApi.addOrders(draft.id, selectionDiff.added);
      }
      // Added styles land on the full PO quantity, so only push a quantity
      // where the staged value differs from that default.
      const qtyWrites: Array<[number, number]> = [...selectionDiff.requantified];
      for (const orderId of selectionDiff.added) {
        const staged = selection.get(orderId);
        if (staged != null && staged !== (totalQtyByOrderId.get(orderId) || 0)) {
          qtyWrites.push([orderId, staged]);
        }
      }
      for (const [orderId, qty] of qtyWrites) {
        await shipmentDraftsApi.updateOrderQuantity(draft.id, orderId, qty);
      }
      await shipmentDraftsApi.update(draft.id, {
        reference,
        name: name || null,
        fcl_lcl: fclLcl || null,
        vessel_name: vesselName || null,
        vessel_etd: vesselEtd || null,
        vessel_eta_to_port: vesselEtaToPort || null,
        tracking_reference: trackingReference || null,
      });
      toast.success('Saved');
      await refresh();
      return true;
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to save');
      // Something may have gone through before the failure — pull the server
      // state back so the page isn't showing a diff that no longer exists.
      await refresh();
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const openConfirmModal = () => {
    if (!draft) return;
    if (blockingChecks.length > 0) {
      toast.error(`Still needed: ${blockingChecks.map(c => c.label).join(', ')}`);
      return;
    }
    setShowConfirmModal(true);
  };

  const handleConfirm = async () => {
    if (!draft) return;
    // Save first to capture pending edits, then push. If the save fails,
    // stop — confirming would otherwise push values the user never saved.
    if (isDirty) {
      const saved = await handleSave();
      if (!saved) { setShowConfirmModal(false); return; }
    }
    setIsConfirming(true);
    try {
      await shipmentDraftsApi.confirm(draft.id);
      toast.success('Shipment confirmed and pushed to every style');
      router.push('/factory-shipping');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to confirm');
      setIsConfirming(false);
      setShowConfirmModal(false);
    }
  };

  const filteredPos = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pos;
    return pos
      .map((p) => {
        const poMatches = (p.po_number || '').toLowerCase().includes(q) ||
                          (p.china_orderbook_ref || '').toLowerCase().includes(q) ||
                          (p.customer || '').toLowerCase().includes(q);
        const matchingStyles = p.styles.filter(s =>
          (s.style_code || '').toLowerCase().includes(q) ||
          (s.customer_style_code || '').toLowerCase().includes(q) ||
          (s.description || '').toLowerCase().includes(q) ||
          (s.colour || '').toLowerCase().includes(q),
        );
        if (poMatches) return p;
        if (matchingStyles.length > 0) return { ...p, styles: matchingStyles };
        return null;
      })
      .filter((p): p is PickerPO => p !== null);
  }, [pos, search]);

  const stats = useMemo(() => {
    let totalUnits = 0;
    selection.forEach((qty) => { totalUnits += qty || 0; });
    return { total: selection.size, totalUnits };
  }, [selection]);

  // The readiness checklist, computed from what is on screen rather than
  // what is saved — so it responds as you type.
  const checklist = useMemo(() => getShipmentChecklist({
    order_count: stats.total,
    unit_count: stats.totalUnits,
    fcl_lcl: fclLcl,
    vessel_name: vesselName,
    vessel_etd: vesselEtd,
    vessel_eta_to_port: vesselEtaToPort,
    tracking_reference: trackingReference,
  }), [stats, fclLcl, vesselName, vesselEtd, vesselEtaToPort, trackingReference]);
  const blockingChecks = useMemo(
    () => checklist.filter(c => !c.done && !c.optional),
    [checklist],
  );

  // Confirm saves first, so the modal has to preview the STAGED selection —
  // previewing draft.orders would miss anything ticked since the last save.
  const stagedOrders = useMemo<ShipmentDraftOrderRow[]>(() => {
    const savedByOrderId = new Map((draft?.orders || []).map(o => [o.order_id, o]));
    const rows: ShipmentDraftOrderRow[] = [];
    for (const p of pos) {
      for (const st of p.styles) {
        if (!selection.has(st.order_id)) continue;
        const saved = savedByOrderId.get(st.order_id);
        rows.push({
          link_id: saved?.link_id ?? -st.order_id,
          order_id: st.order_id,
          po_number: p.po_number,
          china_orderbook_ref: p.china_orderbook_ref,
          style_code: st.style_code,
          description: st.description,
          colour: st.colour,
          customer: p.customer,
          total_quantity: st.total_quantity,
          quantity: selection.get(st.order_id) ?? null,
        });
      }
    }
    return rows;
  }, [pos, selection, draft]);

  // Which rows differ from what the server holds — drawn on the picker so
  // you can see your own pending edits at a glance.
  const stagedOrderIds = useMemo(() => {
    const ids = new Set<number>();
    for (const id of selectionDiff.added) ids.add(id);
    for (const id of selectionDiff.removed) ids.add(id);
    for (const [id] of selectionDiff.requantified) ids.add(id);
    return ids;
  }, [selectionDiff]);

  // Open the POs that already have styles on the shipment, once, when the
  // picker first loads. Deliberately NOT keyed on the selection: it used to
  // recompute on every tick, which threw away whatever the user had opened
  // or collapsed by hand mid-edit.
  const [didSeedExpanded, setDidSeedExpanded] = useState(false);
  useEffect(() => {
    if (didSeedExpanded || pos.length === 0 || !draft) return;
    const seeded = new Set<string>();
    const savedIds = new Set(savedSelection.keys());
    for (const p of pos) {
      if (p.styles.some(st => savedIds.has(st.order_id))) seeded.add(p.po_number);
    }
    setExpandedPo(seeded);
    setDidSeedExpanded(true);
  }, [pos, draft, savedSelection, didSeedExpanded]);

  // Searching opens whatever matched, so results aren't hidden in a
  // collapsed PO.
  useEffect(() => {
    if (!search.trim()) return;
    setExpandedPo(new Set(filteredPos.map(p => p.po_number)));
  }, [search, filteredPos]);

  // Warn on a hard navigation away (refresh, close tab) with staged edits.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const leavePage = () => {
    if (isDirty && !confirm('You have unsaved changes. Leave without saving?')) return;
    router.push('/factory-shipping');
  };

  if (isLoading || !draft) {
    return (
      <AppShell title="Factory Shipping">
        <div className="p-6">
          <div className="bg-white rounded-xl ring-1 ring-gray-100 p-12 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Factory Shipping">
      <div className="p-6">
        <div
          className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] ring-1 ring-gray-100 overflow-hidden flex flex-col"
          style={{ height: 'calc(100vh - 100px)' }}
        >
          {/* Header */}
          <div className={cn(
            'px-6 py-3 border-b border-gray-200 flex items-center justify-between flex-shrink-0',
            editingConfirmed ? 'bg-red-50/40' : isConfirmed ? 'bg-emerald-50/40' : 'bg-white'
          )}>
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <button
                onClick={leavePage}
                className="text-gray-400 hover:text-gray-600 p-1 -ml-1"
                title="Back to shipments"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="h-5 w-px bg-gray-200" />
              <div className="min-w-0 flex-1">
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  disabled={skusLocked}
                  className="text-base font-bold text-gray-900 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 rounded px-1 -ml-1 w-full max-w-[280px] disabled:opacity-100 disabled:text-gray-900"
                />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={skusLocked}
                  placeholder="Add a friendly name…"
                  className="block text-xs text-gray-500 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 rounded px-1 -ml-1 w-full max-w-[280px] placeholder:text-gray-400 disabled:opacity-100"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {editingConfirmed ? (
                /* Confirmed shipment, currently being edited — Save / Cancel */
                <>
                  <span className="text-[11px] text-red-700 font-semibold uppercase tracking-wide">
                    Editing shipping
                  </span>
                  <button
                    onClick={() => {
                      // Revert form state to whatever's on the server
                      if (!draft) return;
                      setFclLcl(draft.fcl_lcl || '');
                      setVesselName(draft.vessel_name || '');
                      setVesselEtd(draft.vessel_etd ? draft.vessel_etd.slice(0, 10) : '');
                      setVesselEtaToPort(draft.vessel_eta_to_port ? draft.vessel_eta_to_port.slice(0, 10) : '');
                      setTrackingReference(draft.tracking_reference || '');
                      setEditingConfirmed(false);
                    }}
                    disabled={savingConfirmed}
                    className="px-3 py-1.5 text-xs font-semibold border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      if (!draft) return;
                      setSavingConfirmed(true);
                      try {
                        const updated = await shipmentDraftsApi.updateConfirmedShipping(draft.id, {
                          fcl_lcl: fclLcl || null,
                          vessel_name: vesselName || null,
                          vessel_etd: vesselEtd || null,
                          vessel_eta_to_port: vesselEtaToPort || null,
                          tracking_reference: trackingReference || null,
                        });
                        setDraft(updated);
                        setEditingConfirmed(false);
                        toast.success(`Shipping fields updated on ${updated.orders.length} SKU${updated.orders.length === 1 ? '' : 's'}`);
                      } catch (err: any) {
                        toast.error(err?.response?.data?.detail || 'Failed to save changes');
                      } finally {
                        setSavingConfirmed(false);
                      }
                    }}
                    disabled={savingConfirmed}
                    className="px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {savingConfirmed ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Save & re-push to {draft.orders.length} SKU{draft.orders.length === 1 ? '' : 's'}
                  </button>
                </>
              ) : isConfirmed ? (
                /* Confirmed shipment, locked. Show pill + a discreet edit button. */
                <>
                  <ConfirmedPill draft={draft} />
                  <button
                    onClick={() => setEditingConfirmed(true)}
                    className="px-3 py-1.5 text-xs font-semibold border border-red-300 text-red-700 rounded-md hover:bg-red-50 flex items-center gap-1.5"
                    title="Vessel changed? Update the shipping fields and re-push to every linked SKU."
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Edit shipping fields
                  </button>
                </>
              ) : (
                /* Draft mode — original Save / Confirm buttons */
                <>
                  {isDirty ? (
                    <span
                      className="text-[11px] font-semibold text-amber-700 inline-flex items-center gap-1.5"
                      title={pendingSummary}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      Unsaved changes
                    </span>
                  ) : (
                    <span className="text-[11px] text-gray-500">
                      {stats.total} style{stats.total === 1 ? '' : 's'} · {stats.totalUnits.toLocaleString()} units
                    </span>
                  )}
                  <button
                    onClick={handleDiscard}
                    disabled={isSaving || !isDirty}
                    className="px-3 py-1.5 text-xs font-semibold border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-40 flex items-center gap-1.5"
                    title="Put everything back to the last saved version"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    Discard
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isSaving || !isDirty}
                    className={cn(
                      'px-3 py-1.5 text-xs font-semibold rounded-md disabled:opacity-40 flex items-center gap-1.5',
                      isDirty
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'border border-gray-300 text-gray-700'
                    )}
                  >
                    {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    {isDirty ? 'Save' : 'Saved'}
                  </button>
                  <button
                    onClick={openConfirmModal}
                    disabled={isConfirming || blockingChecks.length > 0}
                    title={blockingChecks.length > 0
                      ? `Still needed: ${blockingChecks.map(c => c.label).join(', ')}`
                      : 'Push the shipping details onto every style'}
                    className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                  >
                    {isConfirming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />}
                    Confirm shipment
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Body — split layout */}
          <div className="flex-1 grid grid-cols-[1fr_360px] divide-x divide-gray-200 min-h-0">

            {/* LEFT: SKU picker (read-only when SKUs are locked — i.e. once
                the shipment is confirmed; "edit shipping fields" mode unlocks
                only the right column, never the SKU picker). */}
            <div className="bg-gray-50/40 flex flex-col min-h-0">
              {skusLocked ? (
                <LockedSkusList draft={draft} />
              ) : (
                <PickerColumn
                  pos={filteredPos}
                  expandedPo={expandedPo}
                  setExpandedPo={setExpandedPo}
                  linkedOrderIds={linkedOrderIds}
                  linkedQuantityById={linkedQuantityById}
                  stagedOrderIds={stagedOrderIds}
                  search={search}
                  setSearch={setSearch}
                  draftId={draft.id}
                  onToggleStyle={handleToggleStyle}
                  onTogglePo={handleTogglePo}
                  onQuantityChange={handleQuantityChange}
                  selectedCount={stats.total}
                  selectedUnits={stats.totalUnits}
                />
              )}
            </div>

            {/* RIGHT: shared-fields form */}
            <div className="bg-white flex flex-col min-h-0">
              <div className="px-5 py-4 flex-1 overflow-y-auto">
                <div className="text-xs font-semibold text-gray-700 mb-1">
                  {editingConfirmed ? 'Edit shipping fields' : 'Shipment details'}
                </div>
                <p className="text-[11px] text-gray-500 mb-4">
                  {editingConfirmed
                    ? `Update any of the fields below — saving will re-push the new values to all ${stats.total} SKU${stats.total === 1 ? '' : 's'} in this shipment. SKUs and quantities can't be changed.`
                    : isLocked
                    ? 'These fields are locked. They were applied to every SKU on confirmation.'
                    : `These fields will apply to all ${stats.total} selected SKU${stats.total === 1 ? '' : 's'} when you confirm.`}
                </p>

                <div className="space-y-4">
                  <FieldLabel>FCL / LCL</FieldLabel>
                  <div className="inline-flex rounded-md border border-gray-300 p-0.5 bg-gray-50 w-full">
                    {(['FCL', 'LCL', 'AIR'] as const).map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => !isLocked && setFclLcl(opt)}
                        disabled={isLocked}
                        className={cn(
                          'flex-1 px-3 py-1.5 text-xs font-semibold rounded transition-colors',
                          fclLcl === opt ? 'bg-blue-600 text-white' : 'text-gray-600 hover:text-gray-900',
                          isLocked && 'cursor-default'
                        )}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>

                  <div>
                    <FieldLabel>Vessel name</FieldLabel>
                    <input
                      type="text"
                      value={vesselName}
                      onChange={(e) => setVesselName(e.target.value)}
                      disabled={isLocked}
                      className="w-full px-3 py-2 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-700"
                      placeholder="e.g. EVER GIVEN"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <FieldLabel>Vessel ETD</FieldLabel>
                      <DatePickerInput
                        value={vesselEtd}
                        onChange={setVesselEtd}
                        disabled={isLocked}
                        variant="block"
                      />
                    </div>
                    <div>
                      <FieldLabel>ETA to port</FieldLabel>
                      <DatePickerInput
                        value={vesselEtaToPort}
                        onChange={setVesselEtaToPort}
                        disabled={isLocked}
                        variant="block"
                      />
                    </div>
                  </div>

                  {datesImpossible && (
                    <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-[11px] text-red-900 flex items-start gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 mt-px flex-shrink-0" />
                      <span>The ETA is before the ETD — the ship would arrive before it leaves. Fix one of the dates before saving.</span>
                    </div>
                  )}

                  <div>
                    <FieldLabel>Tracking number (P-number)</FieldLabel>
                    <input
                      type="text"
                      value={trackingReference}
                      onChange={(e) => setTrackingReference(e.target.value)}
                      disabled={isLocked}
                      className="w-full px-3 py-2 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 font-mono disabled:bg-gray-50 disabled:text-gray-700"
                      placeholder="P-2026-001"
                    />
                  </div>

                  {!isLocked && !editingConfirmed && (
                    <ReadinessChecklist checks={checklist} blocking={blockingChecks.length} />
                  )}
                  {editingConfirmed && (
                    <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-[11px] text-red-900 leading-relaxed">
                      <strong>Saving will overwrite the current values on every SKU in this shipment.</strong> Use this when something genuinely changed (e.g. vessel switched, ETA delayed). The change is logged in each order's history.
                    </div>
                  )}

                  <div className="text-[11px] text-gray-500 leading-relaxed border-t border-gray-100 pt-3 mt-3">
                    Estimated delivery to customer auto-calculates per-row from ETA + FCL/LCL (FCL +5d / LCL +7d / AIR +2d).
                  </div>
                </div>
              </div>

              {/* Sticky save strip — the left column is long, and Save should
                  never be somewhere you have to go looking for. */}
              {!isLocked && !editingConfirmed && (
                <div className={cn(
                  'px-4 py-2.5 border-t flex items-center gap-2 flex-shrink-0',
                  isDirty ? 'bg-amber-50/70 border-amber-200' : 'bg-gray-50/60 border-gray-200'
                )}>
                  <div className="min-w-0 flex-1">
                    {isDirty ? (
                      <>
                        <div className="text-[11px] font-semibold text-amber-800">Not saved yet</div>
                        <div className="text-[10px] text-amber-700 truncate">{pendingSummary}</div>
                      </>
                    ) : (
                      <div className="text-[11px] text-gray-500">
                        Everything on this page is saved.
                      </div>
                    )}
                  </div>
                  <button
                    onClick={handleDiscard}
                    disabled={isSaving || !isDirty}
                    className="px-2.5 py-1 text-[11px] font-semibold border border-gray-300 bg-white text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-40"
                  >
                    Discard
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isSaving || !isDirty}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-40 flex items-center gap-1.5"
                  >
                    {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                    Save
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showConfirmModal && draft && (
        <ConfirmShipmentModal
          draft={draft}
          orders={stagedOrders}
          pos={pos}
          editedFields={{
            reference,
            name: name || null,
            fcl_lcl: fclLcl || null,
            vessel_name: vesselName || null,
            vessel_etd: vesselEtd || null,
            vessel_eta_to_port: vesselEtaToPort || null,
            tracking_reference: trackingReference || null,
          }}
          isConfirming={isConfirming}
          onCancel={() => setShowConfirmModal(false)}
          onConfirm={handleConfirm}
        />
      )}
    </AppShell>
  );
}

function ReadinessChecklist({
  checks, blocking,
}: {
  checks: ReturnType<typeof getShipmentChecklist>;
  blocking: number;
}) {
  return (
    <div className="border border-gray-200 rounded-md overflow-hidden">
      <div className={cn(
        'px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide border-b',
        blocking === 0
          ? 'bg-emerald-50 text-emerald-800 border-emerald-100'
          : 'bg-gray-50 text-gray-600 border-gray-100'
      )}>
        {blocking === 0
          ? 'Ready to confirm'
          : `${blocking} thing${blocking === 1 ? '' : 's'} still needed`}
      </div>
      <div className="divide-y divide-gray-100">
        {checks.map((c) => (
          <div key={c.key} className="px-3 py-1.5 flex items-start gap-2 text-[11px]">
            {c.done ? (
              <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-px" />
            ) : c.optional ? (
              <Circle className="w-3 h-3 text-gray-300 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-px" />
            )}
            <span className={cn(
              'flex-1 min-w-0',
              c.done ? 'text-gray-600' : c.optional ? 'text-gray-400' : 'text-amber-900 font-semibold'
            )}>
              {c.label}
              {c.detail && (
                <span className="text-gray-400 font-normal"> — {c.detail}</span>
              )}
            </span>
          </div>
        ))}
      </div>
      <div className="px-3 py-2 bg-gray-50/60 border-t border-gray-100 text-[10.5px] text-gray-500 leading-relaxed">
        Confirming writes the shipping details onto every style above and locks
        this shipment. Vessel details can still be corrected afterwards.
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide mb-1.5 block">{children}</label>;
}

function ConfirmedPill({ draft }: { draft: ShipmentDraftDetail }) {
  let when = '';
  try { if (draft.confirmed_at) when = format(parseISO(draft.confirmed_at), 'd MMM'); } catch {}
  const who = draft.confirmed_by?.full_name || draft.confirmed_by?.username || '—';
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
      <Check className="w-3 h-3" />
      Confirmed{when && ` · ${when}`} by {who}
    </span>
  );
}

function PickerColumn({
  pos, expandedPo, setExpandedPo,
  linkedOrderIds, linkedQuantityById, stagedOrderIds,
  search, setSearch,
  draftId,
  onToggleStyle, onTogglePo, onQuantityChange,
  selectedCount, selectedUnits,
}: {
  pos: PickerPO[];
  expandedPo: Set<string>;
  setExpandedPo: (s: Set<string>) => void;
  linkedOrderIds: Set<number>;
  linkedQuantityById: Map<number, number | null>;
  stagedOrderIds: Set<number>;
  search: string;
  setSearch: (s: string) => void;
  draftId: number;
  onToggleStyle: (orderId: number) => void;
  onTogglePo: (po: PickerPO) => void;
  onQuantityChange: (orderId: number, qty: number) => void;
  selectedCount: number;
  selectedUnits: number;
}) {
  return (
    <>
      <div className="px-4 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold text-gray-700">Select SKUs to include</div>
          <div className="text-[10px] text-gray-500">
            {selectedCount} selected · {selectedUnits.toLocaleString()} units
          </div>
        </div>
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by PO# or style code…"
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {pos.length === 0 ? (
          <div className="text-center py-12 text-xs text-gray-500">
            {search ? 'No POs match your filter' : 'No orders for this factory'}
          </div>
        ) : (
          pos.map((po) => (
            <PoCard
              key={po.po_number}
              po={po}
              expanded={expandedPo.has(po.po_number)}
              onToggleExpand={() => {
                const next = new Set(expandedPo);
                if (next.has(po.po_number)) next.delete(po.po_number); else next.add(po.po_number);
                setExpandedPo(next);
              }}
              linkedOrderIds={linkedOrderIds}
              linkedQuantityById={linkedQuantityById}
              stagedOrderIds={stagedOrderIds}
              currentDraftId={draftId}
              onToggleStyle={onToggleStyle}
              onTogglePo={onTogglePo}
              onQuantityChange={onQuantityChange}
            />
          ))
        )}
      </div>
    </>
  );
}

function PoCard({
  po, expanded, onToggleExpand,
  linkedOrderIds, linkedQuantityById, stagedOrderIds,
  currentDraftId,
  onToggleStyle, onTogglePo, onQuantityChange,
}: {
  po: PickerPO;
  expanded: boolean;
  onToggleExpand: () => void;
  linkedOrderIds: Set<number>;
  linkedQuantityById: Map<number, number | null>;
  stagedOrderIds: Set<number>;
  currentDraftId: number;
  onToggleStyle: (orderId: number) => void;
  onTogglePo: (po: PickerPO) => void;
  onQuantityChange: (orderId: number, qty: number) => void;
}) {
  const selectedCount = po.styles.filter(s => linkedOrderIds.has(s.order_id)).length;
  const total = po.styles.length;
  const allSelected = selectedCount === total && total > 0;
  const someSelected = selectedCount > 0 && !allSelected;

  const cardClass = allSelected
    ? 'bg-white rounded-md border border-blue-300 ring-1 ring-blue-100'
    : someSelected
    ? 'bg-white rounded-md border border-blue-200'
    : 'bg-white rounded-md border border-gray-200';

  const totalUnitsAcrossPo = po.styles.reduce((s, st) => s + (st.total_quantity || 0), 0);

  return (
    <div className={cardClass}>
      <div className={cn(
        'px-3 py-2 flex items-center gap-2 cursor-pointer',
        allSelected || someSelected ? 'bg-blue-50/40 border-b border-blue-100' : 'hover:bg-gray-50',
        expanded && 'border-b border-gray-100'
      )} onClick={onToggleExpand}>
        <input
          type="checkbox"
          checked={allSelected}
          ref={(el) => { if (el) el.indeterminate = someSelected; }}
          onChange={(e) => { e.stopPropagation(); onTogglePo(po); }}
          onClick={(e) => e.stopPropagation()}
          className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-xs text-gray-900">
            {po.po_number}
            {po.china_orderbook_ref && <span className="text-gray-500 font-normal"> — {po.china_orderbook_ref}</span>}
          </div>
          <div className="text-[10px] text-gray-500">
            {po.customer || '—'} · {total} style{total === 1 ? '' : 's'} · {totalUnitsAcrossPo.toLocaleString()} units
            {selectedCount > 0 && <span className="text-blue-700 font-semibold"> · {selectedCount} of {total} selected</span>}
          </div>
        </div>
        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
      </div>
      {expanded && (
        <div className="divide-y divide-gray-100">
          {po.styles.map((s) => (
            <StyleRow
              key={s.order_id}
              style={s}
              isSelected={linkedOrderIds.has(s.order_id)}
              isStaged={stagedOrderIds.has(s.order_id)}
              currentDraftId={currentDraftId}
              quantityInDraft={linkedQuantityById.get(s.order_id) ?? null}
              onToggle={() => onToggleStyle(s.order_id)}
              onQuantityChange={(qty) => onQuantityChange(s.order_id, qty)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StyleRow({
  style, isSelected, isStaged, currentDraftId, quantityInDraft,
  onToggle, onQuantityChange,
}: {
  style: PickerStyle;
  isSelected: boolean;
  /** Ticked or re-quantified since the last save — drawn so the user can see
   *  exactly which rows Save is going to write. */
  isStaged: boolean;
  currentDraftId: number;
  quantityInDraft: number | null;
  onToggle: () => void;
  onQuantityChange: (qty: number) => void;
}) {
  const otherDrafts = (style.in_drafts || []).filter(d => d.draft_id !== currentDraftId);
  const inOtherDraft = otherDrafts.find(d => d.status === 'draft');
  const inConfirmed = otherDrafts.find(d => d.status === 'confirmed');

  // Local text state so a half-typed number isn't parsed; commits into the
  // staged selection on blur. Nothing here reaches the server until Save.
  const [localQty, setLocalQty] = useState<string>(quantityInDraft != null ? String(quantityInDraft) : '');
  useEffect(() => { setLocalQty(quantityInDraft != null ? String(quantityInDraft) : ''); }, [quantityInDraft]);

  const total = style.total_quantity || 0;

  return (
    <div className={cn(
      'px-3 pl-9 py-1.5 text-xs relative',
      isStaged && 'border-l-2 border-amber-400 pl-[34px]',
      isSelected ? 'bg-blue-50/30' : 'hover:bg-gray-50/60'
    )}>
      {/* Whole row toggles selection — checkbox is tiny and was annoying to
          aim at. The qty input below stops propagation so editing the
          number doesn't accidentally untick the row. */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onToggle(); } }}
        className="flex items-center gap-2 cursor-pointer select-none"
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggle}
          onClick={(e) => e.stopPropagation()}
          className="w-3 h-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="font-mono text-[11px] text-gray-700 flex-shrink-0">{style.style_code || `#${style.order_id}`}</span>
          <span className="text-gray-500 truncate flex-1">{style.description || '—'}</span>
          {style.colour && (
            <span className="text-gray-500 flex-shrink-0 px-1.5 py-0.5 rounded bg-gray-100 text-[10px] font-medium uppercase tracking-wide">
              {style.colour}
            </span>
          )}
        </div>
        {isSelected ? (
          <div
            className="flex items-center gap-1 flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <input
              type="number"
              min={1}
              value={localQty}
              onChange={(e) => setLocalQty(e.target.value)}
              onBlur={() => {
                // No upper cap — factories sometimes ship over the PO line
                // (overage runs, replacements). Backend allows any qty > 0.
                const num = parseInt(localQty, 10);
                if (!isNaN(num) && num !== quantityInDraft && num > 0) {
                  onQuantityChange(num);
                } else if (isNaN(num) || num <= 0) {
                  setLocalQty(quantityInDraft != null ? String(quantityInDraft) : '');
                }
              }}
              className="w-16 px-1.5 py-0.5 text-[11px] text-right border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
            />
            <span className="text-[10px] text-gray-400 whitespace-nowrap">of {total.toLocaleString()}</span>
            {isStaged && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" title="Not saved yet" />
            )}
          </div>
        ) : (
          <span className="text-[10px] text-gray-400 flex-shrink-0">{total.toLocaleString()}</span>
        )}
      </div>
      {/* Conflict sub-line — sits indented below the row when applicable. */}
      {(inConfirmed || inOtherDraft) && (
        <div className="pl-[22px] mt-0.5">
          {inConfirmed ? (
            <span
              title={`Confirmed in ${inConfirmed.reference}. Confirming this draft will overwrite those values.`}
              className="text-[10px] font-medium text-red-600 inline-flex items-center gap-1"
            >
              <AlertTriangle className="w-2.5 h-2.5" />
              Will overwrite {inConfirmed.reference}
            </span>
          ) : inOtherDraft ? (
            <span
              title={`Also in draft ${inOtherDraft.reference}`}
              className="text-[10px] font-medium text-amber-600 inline-flex items-center gap-1"
            >
              <span className="w-1 h-1 rounded-full bg-amber-500" />
              Already in {inOtherDraft.reference}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ConfirmShipmentModal({
  draft,
  orders,
  pos,
  editedFields,
  isConfirming,
  onCancel,
  onConfirm,
}: {
  draft: ShipmentDraftDetail;
  /** The staged selection — what Confirm is about to write, which may differ
   *  from draft.orders if the user has ticked styles since the last save. */
  orders: ShipmentDraftOrderRow[];
  pos: PickerPO[];
  editedFields: {
    reference: string;
    name: string | null;
    fcl_lcl: string | null;
    vessel_name: string | null;
    vessel_etd: string | null;
    vessel_eta_to_port: string | null;
    tracking_reference: string | null;
  };
  isConfirming: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  // Group orders by PO for the summary list.
  const groups = useMemo(() => {
    const map = new Map<string, ShipmentDraftDetail['orders']>();
    for (const o of orders) {
      const key = o.po_number || '—';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    }
    return Array.from(map.entries()).map(([po_number, orders]) => ({
      po_number,
      orders,
      units: orders.reduce((s, o) => s + (o.quantity || 0), 0),
    }));
  }, [orders]);

  const totalSkus = orders.length;
  const totalUnits = orders.reduce((s, o) => s + (o.quantity || 0), 0);

  const partials = orders.filter(o => o.quantity != null && o.total_quantity != null && o.quantity < o.total_quantity);
  // Over-line SKUs — ship qty exceeds the PO line total. Factories do this
  // legitimately (overage / replacements) but flagging it gives the user a
  // sanity-check before they confirm.
  const overs = orders.filter(o => o.quantity != null && o.total_quantity != null && o.quantity > o.total_quantity);

  // Cross-reference picker data to find SKUs in this draft that are ALSO already
  // confirmed in another shipment — confirming this draft will overwrite the
  // shipping fields previously applied. This is the safety check.
  const overwriteByOrderId = useMemo(() => {
    const map = new Map<number, { reference: string; name: string | null }>();
    for (const p of pos) {
      for (const s of p.styles) {
        const confirmedConflict = (s.in_drafts || []).find(
          d => d.draft_id !== draft.id && d.status === 'confirmed'
        );
        if (confirmedConflict) {
          map.set(s.order_id, { reference: confirmedConflict.reference, name: confirmedConflict.name });
        }
      }
    }
    return map;
  }, [pos, draft.id]);
  const overwriteCount = orders.filter(o => overwriteByOrderId.has(o.order_id)).length;

  let etd = '—', eta = '—';
  try { if (editedFields.vessel_etd) etd = format(parseISO(editedFields.vessel_etd), 'd MMM yyyy'); } catch {}
  try { if (editedFields.vessel_eta_to_port) eta = format(parseISO(editedFields.vessel_eta_to_port), 'd MMM yyyy'); } catch {}

  // Lock the body scroll while open + Escape to dismiss.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !isConfirming) onCancel(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel, isConfirming]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm"
      onClick={isConfirming ? undefined : onCancel}
    >
      <div
        className="w-full max-w-2xl bg-white rounded-xl shadow-xl ring-1 ring-gray-100 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <CheckCheck className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 mb-0.5">
                Confirm shipment
              </div>
              <h3 className="text-base font-bold text-gray-900 truncate">{editedFields.reference}</h3>
              {editedFields.name && <p className="text-xs text-gray-500 truncate">{editedFields.name}</p>}
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={isConfirming}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Shipment details summary */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Shipment details</div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              <div className="flex justify-between"><dt className="text-gray-500">FCL/LCL</dt><dd className="font-medium text-gray-800">{editedFields.fcl_lcl || <span className="text-gray-400 italic">—</span>}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Tracking</dt><dd className="font-mono text-gray-800">{editedFields.tracking_reference || <span className="text-gray-400 italic">—</span>}</dd></div>
              <div className="flex justify-between col-span-2"><dt className="text-gray-500">Vessel</dt><dd className="font-medium text-gray-800">{editedFields.vessel_name || <span className="text-gray-400 italic">—</span>}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">ETD</dt><dd className="font-medium text-gray-800">{etd}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">ETA</dt><dd className="font-medium text-gray-800">{eta}</dd></div>
            </dl>
          </div>

          {/* Headline counts */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-blue-700">{groups.length}</div>
              <div className="text-[10px] text-blue-700 uppercase tracking-wide font-semibold">PO{groups.length === 1 ? '' : 's'}</div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-blue-700">{totalSkus}</div>
              <div className="text-[10px] text-blue-700 uppercase tracking-wide font-semibold">SKU{totalSkus === 1 ? '' : 's'}</div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-blue-700">{totalUnits.toLocaleString()}</div>
              <div className="text-[10px] text-blue-700 uppercase tracking-wide font-semibold">Units</div>
            </div>
          </div>

          {/* Overwrite warning — SKUs already confirmed in another shipment */}
          {overwriteCount > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
              <div className="text-[11px] text-red-900 leading-relaxed">
                <strong>{overwriteCount} SKU{overwriteCount === 1 ? '' : 's'} already confirmed in {overwriteCount === 1 ? 'another shipment' : 'other shipments'}.</strong> Confirming will <strong>overwrite</strong> the previously-applied vessel / ETD / ETA / tracking values for those rows. Specific shipments are flagged in the SKU list below.
              </div>
            </div>
          )}

          {/* Partial shipment warning */}
          {partials.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-[11px] text-amber-900 leading-relaxed">
                <strong>{partials.length} SKU{partials.length === 1 ? '' : 's'}</strong> ship{partials.length === 1 ? 's' : ''} less than the full PO line quantity. Make sure that's intentional — the remainder isn't tracked anywhere yet.
              </div>
            </div>
          )}

          {/* Over-line shipment warning */}
          {overs.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-[11px] text-amber-900 leading-relaxed">
                <strong>{overs.length} SKU{overs.length === 1 ? '' : 's'}</strong> ship{overs.length === 1 ? 's' : ''} MORE than the original PO line quantity (overage or replacements). Make sure that's intentional.
              </div>
            </div>
          )}

          {/* PO-grouped SKU list */}
          <div>
            <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">SKUs being confirmed</div>
            <div className="space-y-2">
              {groups.map((g) => (
                <div key={g.po_number} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                    <div className="text-xs font-semibold text-gray-800">{g.po_number}</div>
                    <div className="text-[10px] text-gray-500">
                      {g.orders.length} SKU{g.orders.length === 1 ? '' : 's'} · {g.units.toLocaleString()} units
                    </div>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {g.orders.map((o) => {
                      const isPartial = o.quantity != null && o.total_quantity != null && o.quantity < o.total_quantity;
                      const isOver = o.quantity != null && o.total_quantity != null && o.quantity > o.total_quantity;
                      const overwrite = overwriteByOrderId.get(o.order_id);
                      return (
                        <div key={o.link_id} className={cn('px-3 py-1.5 flex items-center gap-2 text-[11px]', overwrite && 'bg-red-50/40')}>
                          <span className="font-mono text-gray-700 flex-shrink-0">{o.style_code || `#${o.order_id}`}</span>
                          <span className="text-gray-500 truncate flex-1">{o.description || '—'}</span>
                          {o.colour && <span className="text-gray-400 truncate max-w-[80px]">{o.colour}</span>}
                          {overwrite && (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-red-100 text-red-700 border border-red-200 flex-shrink-0"
                              title={`Currently confirmed in ${overwrite.reference}${overwrite.name ? ` (${overwrite.name})` : ''} — confirming overwrites those values.`}
                            >
                              <AlertTriangle className="w-2.5 h-2.5" />
                              overwrites {overwrite.reference}
                            </span>
                          )}
                          <span className={cn('flex items-center gap-1 flex-shrink-0', isPartial || isOver ? 'text-amber-700' : 'text-gray-700')}>
                            {(o.quantity || 0).toLocaleString()}
                            <span className="text-gray-400">/{(o.total_quantity || 0).toLocaleString()}</span>
                            {isPartial && <span className="text-[9px] uppercase tracking-wide font-semibold ml-1">partial</span>}
                            {isOver && <span className="text-[9px] uppercase tracking-wide font-semibold ml-1">over</span>}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-[11px] text-emerald-900 leading-relaxed">
            <strong>Confirming will write the 5 shipping fields onto every SKU above</strong> and lock this draft. To make further changes, create a new draft.
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-end gap-2 bg-gray-50/40 flex-shrink-0">
          <button
            onClick={onCancel}
            disabled={isConfirming}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            Back
          </button>
          <button
            onClick={onConfirm}
            disabled={isConfirming}
            className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            {isConfirming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />}
            Confirm and push to {totalSkus} SKU{totalSkus === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  );
}

function LockedSkusList({ draft }: { draft: ShipmentDraftDetail }) {
  return (
    <>
      <div className="px-4 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-gray-700">SKUs in this shipment</div>
          <div className="text-[10px] text-gray-500">
            {draft.orders.length} SKU{draft.orders.length === 1 ? '' : 's'} ·{' '}
            {draft.orders.reduce((s, o) => s + (o.quantity || 0), 0).toLocaleString()} units
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {draft.orders.map((o) => (
          <div key={o.link_id} className="bg-white rounded-md border border-gray-200 px-3 py-2 flex items-center gap-2 text-xs">
            <span className="font-mono text-[11px] text-gray-700">{o.po_number || `#${o.order_id}`}</span>
            {o.style_code && <span className="font-mono text-[11px] text-gray-700">· {o.style_code}</span>}
            <span className="text-gray-500 truncate flex-1">{o.description || '—'}</span>
            {o.colour && <span className="text-gray-400 truncate max-w-[80px]">{o.colour}</span>}
            <span className="text-emerald-600 text-[11px] flex items-center gap-1 flex-shrink-0">
              <Check className="w-3 h-3" />
              {(o.quantity || 0).toLocaleString()}
              <span className="text-gray-400">/{(o.total_quantity || 0).toLocaleString()}</span>
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
