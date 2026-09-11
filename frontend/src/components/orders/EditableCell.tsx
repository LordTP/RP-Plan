'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Check, X, Loader2, Search } from 'lucide-react';
import { cn, formatDate, formatCurrency, formatNumber, formatDateForInput } from '@/lib/utils';
import { ordersApi } from '@/lib/api';
import { StatusDropdown } from '@/components/orders/StatusDropdown';
import { DatePickerInput } from '@/components/ui/DatePickerInput';
import { NOTE_ELIGIBLE_FIELDS } from '@/lib/dateNotes';
import { useStore } from '@/store/useStore';
import type { ColumnDef, Order } from '@/types';

type ApplyMode = 'single' | 'all' | 'selected';

interface StyleOnPO {
  id: number;
  style_code: string;
  description: string;
  colour: string;
}

interface PendingChangeInfo {
  current_value: string | null;
  proposed_value: string | null;
  reason: string;
  submitted_by: string;
  submitted_at: string | null;
}

interface EditableCellProps {
  value: any;
  column: ColumnDef;
  order: Order;
  isEditable: boolean;
  isSupplierEditable: boolean;
  userRole: 'admin' | 'internal' | 'supplier' | 'sourcelab_designer';
  onSave: (orderId: number, field: string, value: any, changeReason?: string) => Promise<void>;
  onBulkSave?: () => void;
  isChanged?: boolean;
  pendingChange?: PendingChangeInfo;
}

export function EditableCell({
  value,
  column,
  order,
  isEditable,
  isSupplierEditable,
  userRole,
  onSave,
  onBulkSave,
  isChanged = false,
  pendingChange,
}: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [changeReason, setChangeReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  const isSupplierDateEdit = userRole === 'supplier' && column.type === 'date' && isSupplierEditable;

  // Bulk update state for date fields
  const [applyMode, setApplyMode] = useState<ApplyMode>('single');
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
  const [stylesOnPO, setStylesOnPO] = useState<StyleOnPO[]>([]);
  const [loadingStyles, setLoadingStyles] = useState(false);
  // Search inside the 'select specific styles' picker. Only surfaces when
  // the PO has enough styles to justify it — hides on short lists.
  const [styleSearch, setStyleSearch] = useState('');

  // Store subscription used for optimistic bulk-patching so the visible
  // rows reflect the change the instant the API responds, before the
  // parent's silent refresh confirms with server truth.
  const updateOrderInList = useStore((s) => s.updateOrderInList);

  const isDateField = column.type === 'date';
  const isBulkable = isDateField || !!column.options;

  const canEdit =
    ((userRole === 'internal' || userRole === 'admin') && isEditable) ||
    (userRole === 'supplier' && isSupplierEditable);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      if ('select' in inputRef.current) {
        inputRef.current.select();
      }
    }
  }, [isEditing]);

  // Close modal on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isEditing) {
        handleCancel();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isEditing]);

  const handleDoubleClick = async () => {
    if (!canEdit) return;

    let initialValue = value;
    if (column.type === 'date') {
      // Note-eligible fields: prefer the free-text note over the (null)
      // date so the editor opens with e.g. "ASAP" ready to keep or replace.
      const note = NOTE_ELIGIBLE_FIELDS.has(column.key as string)
        ? order.date_notes?.[column.key as string]
        : undefined;
      initialValue = note || formatDateForInput(value);
    } else if (column.type === 'currency') {
      initialValue = value?.toString() || '';
    } else {
      initialValue = value?.toString() || '';
    }

    setEditValue(column.options ? (initialValue?.toUpperCase() || '') : initialValue);
    setApplyMode('single');
    setSelectedOrderIds([order.id]);
    setIsEditing(true);

    // For date/dropdown fields, fetch all styles on this PO
    if (isBulkable && order.po_number) {
      setLoadingStyles(true);
      try {
        const result = await ordersApi.getStylesOnPO(order.po_number);
        setStylesOnPO(result.orders);
        // Pre-select current order
        setSelectedOrderIds([order.id]);
      } catch (error) {
        console.error('Failed to fetch styles on PO:', error);
        setStylesOnPO([]);
      } finally {
        setLoadingStyles(false);
      }
    }
  };

  const handleSave = async () => {
    if (isSaving) return;

    setIsSaving(true);
    try {
      let saveValue: any = editValue;

      if (column.type === 'number' || column.type === 'currency') {
        saveValue = editValue === '' ? null : parseFloat(editValue);
      } else if (column.type === 'date') {
        saveValue = editValue === '' ? null : editValue;
      }

      // For bulkable fields with bulk apply mode, use the bulk API
      if (isBulkable && applyMode !== 'single' && order.po_number) {
        const orderIdsToUpdate = applyMode === 'all'
          ? [] // Empty array means all orders on PO
          : selectedOrderIds;

        const result = await ordersApi.bulkUpdateDate(
          order.po_number,
          column.key,
          saveValue,
          orderIdsToUpdate,
          isSupplierDateEdit ? changeReason : undefined
        );

        // Check if this was a pending approval response
        if (result.pending_approval) {
          // Show pending message and refresh
          if (onBulkSave) {
            onBulkSave();
          }
          setIsEditing(false);
          setChangeReason('');
          return;
        }

        // Optimistic patch — merge the new value into every affected row
        // that's currently in the store so the visible list updates the
        // instant the modal closes. The parent's silent refresh
        // (onBulkSave) then re-fetches page 1 and confirms with server
        // truth, but the user doesn't stare at the pre-save value in the
        // meantime. 'all' mode patches every style on the PO (from the
        // list we fetched for the picker); 'selected' patches just the
        // ticked ones. Rows outside the current page aren't in the
        // store — they'll be correct when the viewer scrolls to them.
        const optimisticIds = applyMode === 'all'
          ? stylesOnPO.map((s) => s.id)
          : selectedOrderIds;
        const storeOrders = useStore.getState().orders;
        for (const id of optimisticIds) {
          const existing = storeOrders.find((o) => o.id === id);
          if (existing) {
            updateOrderInList({ ...existing, [column.key]: saveValue });
          }
        }

        // Notify parent to refresh data
        if (onBulkSave) {
          onBulkSave();
        }
      } else {
        // Single order update (existing behavior)
        // Pass change reason for supplier date edits
        await onSave(order.id, column.key, saveValue, isSupplierDateEdit ? changeReason : undefined);
      }

      setIsEditing(false);
    } catch (error) {
      console.error('Failed to save:', error);
      // Keep modal open on error so user can see error message
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditValue('');
    setChangeReason('');
    setApplyMode('single');
    setSelectedOrderIds([]);
    setStylesOnPO([]);
    setStyleSearch('');
  };

  // Derived state so the modal knows when to guard the backdrop click —
  // supplier's typed a reason, or user has taken any action beyond 'single'.
  // Prevents accidental dismissal of half-typed bulk saves. Escape still
  // works because that's a deliberate user action.
  const hasProtectedContent =
    (isSupplierDateEdit && !!changeReason.trim()) ||
    (applyMode !== 'single');

  // Filter the style picker by the search box. Cheap enough per keystroke
  // for the O(≤50 styles/PO) case; useMemo keeps it stable across
  // re-renders where the input isn't the thing that changed.
  const filteredStyles = useMemo(() => {
    const q = styleSearch.trim().toLowerCase();
    if (!q) return stylesOnPO;
    return stylesOnPO.filter((s) =>
      s.style_code.toLowerCase().includes(q) ||
      (s.description || '').toLowerCase().includes(q) ||
      (s.colour || '').toLowerCase().includes(q),
    );
  }, [stylesOnPO, styleSearch]);

  const handleStyleToggle = (styleId: number) => {
    setSelectedOrderIds((prev) =>
      prev.includes(styleId)
        ? prev.filter((id) => id !== styleId)
        : [...prev, styleId]
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
  };

  const formatDisplayValue = () => {
    // Note-eligible date fields fall back to the free-text note (e.g.
    // "ASAP") when the date column itself is null. Checked before the
    // null bail-out so a cell with only a note still renders text.
    if (column.type === 'date' && NOTE_ELIGIBLE_FIELDS.has(column.key as string)) {
      const note = order.date_notes?.[column.key as string];
      if (note) return note;
    }

    if (value === null || value === undefined) return '-';

    switch (column.type) {
      case 'date':
        return formatDate(value);
      case 'currency':
        return formatCurrency(value);
      case 'number':
        return formatNumber(value);
      default:
        return value.toString();
    }
  };

  // Build tooltip for pending changes
  const getPendingTooltip = () => {
    if (!pendingChange) return undefined;
    const fromDate = pendingChange.current_value ? formatDate(pendingChange.current_value) : 'Not set';
    const toDate = pendingChange.proposed_value ? formatDate(pendingChange.proposed_value) : 'Not set';
    return `Pending Approval\n${fromDate} → ${toDate}\nReason: ${pendingChange.reason}\nBy: ${pendingChange.submitted_by}`;
  };

  return (
    <>
      <div
        onDoubleClick={handleDoubleClick}
        className={cn(
          'px-3 py-2 data-cell truncate',
          canEdit && 'editable-cell cursor-pointer',
          userRole === 'supplier' && isSupplierEditable && 'supplier-editable-cell',
          isChanged && 'bg-emerald-300 font-semibold text-emerald-900',
          pendingChange && '!bg-orange-200 !text-orange-900 font-medium'
        )}
        title={pendingChange ? getPendingTooltip() : (isChanged ? 'Changed since last login - Double-click to edit' : (canEdit ? 'Double-click to edit' : undefined))}
      >
        {formatDisplayValue()}
        {pendingChange && <span className="ml-1 text-orange-600">*</span>}
      </div>

      {/* Edit Modal — portalled to document.body so it escapes the sticky
          column's stacking context (which was leaving the PO# + Style Code
          cells rendered ON TOP of the backdrop). Refreshed Sep 2026: tighter
          card, softer backdrop with blur, segmented scope control, two-line
          style rows with search, backdrop click-inert when unsaved bulk work
          exists, optimistic patching on bulk save. */}
      {isEditing && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop — softer than the pre-Sep-2026 pure-black overlay,
              matches the polish of BulkEditModal / LibraryFirstAddModal.
              Click-inert when there's unsaved bulk work so a stray click
              doesn't drop a half-composed batch. */}
          <div
            className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
            onClick={hasProtectedContent ? undefined : handleCancel}
          />

          {/* Card */}
          <div className="relative bg-white rounded-xl shadow-xl ring-1 ring-gray-200 w-full max-w-md overflow-hidden">
            {/* Header — eyebrow flips to BULK EDIT when scope is beyond
                the current row, so the user can see at a glance that
                they're about to change more than one thing. */}
            <div className="px-5 py-3 border-b border-gray-100 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">
                  {applyMode === 'single' ? 'EDIT' : 'BULK EDIT'}
                </div>
                <h3 className="text-base font-bold text-gray-900 mt-0.5 truncate">
                  {column.label}
                </h3>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <span className="text-[10px] font-mono font-semibold text-gray-700 bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 tabular-nums">
                    PO {order.po_number}
                  </span>
                  {order.style_code && (
                    <span className="text-[10px] font-mono text-gray-500 tabular-nums truncate">
                      · {order.style_code}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={handleCancel}
                className="text-gray-400 hover:text-gray-700 p-1 flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4 space-y-4">
              {/* Value input */}
              <div>
                {column.options ? (
                  <div className="border border-gray-200 rounded-md overflow-hidden divide-y divide-gray-50">
                    <button
                      onClick={() => setEditValue('')}
                      className={cn(
                        'w-full text-left px-3 py-1.5 text-sm transition-colors',
                        editValue === ''
                          ? 'bg-violet-50 text-violet-700 font-medium'
                          : 'text-gray-400 hover:bg-gray-50',
                      )}
                    >
                      <span className="italic">None</span>
                    </button>
                    {column.options.map((opt) => (
                      <button
                        key={opt}
                        onClick={() => setEditValue(opt)}
                        className={cn(
                          'w-full text-left px-3 py-1.5 text-sm flex items-center justify-between transition-colors',
                          editValue === opt
                            ? 'bg-violet-100 text-violet-800 font-semibold'
                            : 'text-gray-700 hover:bg-gray-50',
                        )}
                      >
                        <span>{opt}</span>
                        {editValue === opt && <Check className="w-4 h-4 text-violet-600" />}
                      </button>
                    ))}
                  </div>
                ) : column.type === 'text' && column.key === 'description' ? (
                  <textarea
                    ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent font-mono text-sm resize-none"
                    disabled={isSaving}
                    placeholder={`Enter ${column.label.toLowerCase()}`}
                  />
                ) : column.type === 'date' ? (
                  <DatePickerInput
                    value={editValue}
                    onChange={setEditValue}
                    variant="block"
                    size="md"
                    disabled={isSaving}
                  />
                ) : (
                  <input
                    ref={inputRef as React.RefObject<HTMLInputElement>}
                    type={column.type === 'number' || column.type === 'currency' ? 'number' : 'text'}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent font-mono text-sm"
                    step={column.type === 'currency' ? '0.01' : undefined}
                    disabled={isSaving}
                    placeholder={`Enter ${column.label.toLowerCase()}`}
                  />
                )}
              </div>

              {/* Supplier-only reason panel — kept tight; still clearly
                  amber so the user knows this leaves the direct-save path
                  and goes through the pending-approval queue. */}
              {isSupplierDateEdit && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-1.5">
                  <label className="block text-[11px] font-bold text-amber-900">
                    Reason for date change <span className="text-red-600 font-normal">(required)</span>
                  </label>
                  <textarea
                    value={changeReason}
                    onChange={(e) => setChangeReason(e.target.value)}
                    rows={2}
                    className="w-full px-2.5 py-1.5 text-sm border border-amber-300 rounded focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none bg-white"
                    disabled={isSaving}
                    placeholder="e.g., Factory delay due to material shortage"
                  />
                  <p className="text-[10px] text-amber-800">
                    This change will require approval from Sourcelab.
                  </p>
                </div>
              )}

              {/* Bulk scope — segmented control replaces the previous
                  radio-group stack. Same three modes, half the vertical
                  space, and the active state signals which is picked
                  without needing to hunt for a filled dot. */}
              {isBulkable && stylesOnPO.length > 1 && (
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1.5 block">
                    Apply to
                  </label>
                  <div className="inline-flex w-full p-0.5 bg-gray-100 rounded-lg text-[11px] font-semibold">
                    <button
                      onClick={() => setApplyMode('single')}
                      disabled={isSaving}
                      className={cn(
                        'flex-1 px-2 py-1 rounded-md transition-colors',
                        applyMode === 'single'
                          ? 'bg-white shadow-sm text-violet-700'
                          : 'text-gray-500 hover:text-gray-700',
                      )}
                    >
                      This style
                    </button>
                    <button
                      onClick={() => setApplyMode('all')}
                      disabled={isSaving}
                      className={cn(
                        'flex-1 px-2 py-1 rounded-md transition-colors',
                        applyMode === 'all'
                          ? 'bg-white shadow-sm text-violet-700'
                          : 'text-gray-500 hover:text-gray-700',
                      )}
                    >
                      All on PO ({stylesOnPO.length})
                    </button>
                    <button
                      onClick={() => setApplyMode('selected')}
                      disabled={isSaving}
                      className={cn(
                        'flex-1 px-2 py-1 rounded-md transition-colors',
                        applyMode === 'selected'
                          ? 'bg-white shadow-sm text-violet-700'
                          : 'text-gray-500 hover:text-gray-700',
                      )}
                    >
                      Select…
                    </button>
                  </div>

                  {applyMode === 'selected' && (
                    <div className="mt-2 rounded-md border border-gray-200 overflow-hidden">
                      {stylesOnPO.length > 6 && (
                        <div className="px-2 py-1.5 border-b border-gray-100 bg-gray-50/60 relative">
                          <Search className="w-3 h-3 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type="text"
                            value={styleSearch}
                            onChange={(e) => setStyleSearch(e.target.value)}
                            placeholder="Search code / description / colour"
                            className="w-full pl-6 pr-2 py-1 text-[11px] bg-white border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-violet-500"
                          />
                        </div>
                      )}
                      <div className="max-h-48 overflow-y-auto divide-y divide-gray-100">
                        {loadingStyles ? (
                          <div className="flex items-center gap-2 text-[11px] text-gray-500 px-3 py-3">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Loading styles…
                          </div>
                        ) : filteredStyles.length === 0 ? (
                          <div className="text-center text-[11px] text-gray-400 py-3">
                            No styles match.
                          </div>
                        ) : (
                          filteredStyles.map((style) => {
                            const checked = selectedOrderIds.includes(style.id);
                            return (
                              <label
                                key={style.id}
                                className={cn(
                                  'flex items-start gap-2 px-2 py-1.5 cursor-pointer text-[11px]',
                                  checked
                                    ? 'bg-violet-50 border-l-2 border-l-violet-500 pl-1.5'
                                    : 'hover:bg-gray-50 border-l-2 border-l-transparent pl-1.5',
                                )}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => handleStyleToggle(style.id)}
                                  className="w-3.5 h-3.5 mt-0.5 flex-shrink-0"
                                  disabled={isSaving}
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-semibold text-gray-900 tabular-nums truncate">
                                      {style.style_code}
                                    </span>
                                    {style.colour && (
                                      <span className="text-[10px] text-gray-500 flex-shrink-0">
                                        · {style.colour}
                                      </span>
                                    )}
                                  </div>
                                  {style.description && (
                                    <div className="text-[10px] text-gray-500 truncate">
                                      {style.description}
                                    </div>
                                  )}
                                </div>
                              </label>
                            );
                          })
                        )}
                      </div>
                      <div className="px-2 py-1 border-t border-gray-100 bg-gray-50/60 text-[10px] text-gray-500 tabular-nums flex items-center justify-between">
                        <span>{selectedOrderIds.length} of {stylesOnPO.length} selected</span>
                        {selectedOrderIds.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setSelectedOrderIds([])}
                            className="text-gray-400 hover:text-gray-700"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center justify-end gap-2">
              <button
                onClick={handleCancel}
                disabled={isSaving}
                className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-white disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || (applyMode === 'selected' && selectedOrderIds.length === 0) || (isSupplierDateEdit && !changeReason.trim())}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-md flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isSaving
                  ? 'Saving…'
                  : applyMode === 'all'
                    ? `Save · ${stylesOnPO.length} style${stylesOnPO.length === 1 ? '' : 's'}`
                    : applyMode === 'selected'
                      ? `Save · ${selectedOrderIds.length} style${selectedOrderIds.length === 1 ? '' : 's'}`
                      : 'Save'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
