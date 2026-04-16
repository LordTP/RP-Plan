'use client';

import { useState, useRef, useEffect } from 'react';
import { Check, X, Loader2 } from 'lucide-react';
import { cn, formatDate, formatCurrency, formatNumber, formatDateForInput } from '@/lib/utils';
import { ordersApi } from '@/lib/api';
import { StatusDropdown } from '@/components/orders/StatusDropdown';
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
      initialValue = formatDateForInput(value);
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
  };

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

      {/* Edit Modal */}
      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={handleCancel}
          />

          {/* Modal */}
          <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Edit {column.label}
              </h3>
              <button
                onClick={handleCancel}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-2 text-sm text-gray-500">
              PO#: {order.customer_po_number || order.po_number}
            </div>

            <div className="mb-4">
              {column.options ? (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setEditValue('')}
                    className={cn(
                      'w-full text-left px-3 py-2 text-sm transition-colors border-b border-gray-100',
                      editValue === '' ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-400 hover:bg-gray-50'
                    )}
                  >
                    <span className="italic">None</span>
                  </button>
                  {column.options.map(opt => (
                    <button
                      key={opt}
                      onClick={() => setEditValue(opt)}
                      className={cn(
                        'w-full text-left px-3 py-2 text-sm flex items-center justify-between transition-colors border-b border-gray-50 last:border-0',
                        editValue === opt
                          ? 'bg-primary-100 text-primary-800 font-semibold'
                          : 'text-gray-700 hover:bg-gray-50'
                      )}
                    >
                      <span>{opt}</span>
                      {editValue === opt && <Check className="w-4 h-4 text-primary-600" />}
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-sm resize-none"
                  disabled={isSaving}
                  placeholder={`Enter ${column.label.toLowerCase()}`}
                />
              ) : (
                <input
                  ref={inputRef as React.RefObject<HTMLInputElement>}
                  type={column.type === 'date' ? 'date' : column.type === 'number' || column.type === 'currency' ? 'number' : 'text'}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-sm"
                  step={column.type === 'currency' ? '0.01' : undefined}
                  disabled={isSaving}
                  placeholder={`Enter ${column.label.toLowerCase()}`}
                />
              )}
            </div>

            {/* Reason input for supplier date changes */}
            {isSupplierDateEdit && (
              <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <label className="block text-sm font-medium text-orange-800 mb-2">
                  Reason for date change <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={changeReason}
                  onChange={(e) => setChangeReason(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-orange-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm resize-none"
                  disabled={isSaving}
                  placeholder="e.g., Factory delay due to material shortage"
                />
                <p className="text-xs text-orange-600 mt-1">
                  This change will require approval from Sourcelab
                </p>
              </div>
            )}

            {/* Bulk update options */}
            {isBulkable && stylesOnPO.length > 1 && (
              <div className="mb-4 border-t pt-4">
                <p className="text-sm font-medium text-gray-700 mb-3">Apply to:</p>

                <div className="space-y-2">
                  {/* Single style option */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="applyMode"
                      value="single"
                      checked={applyMode === 'single'}
                      onChange={() => setApplyMode('single')}
                      className="w-4 h-4 text-primary-600 focus:ring-primary-500"
                      disabled={isSaving}
                    />
                    <span className="text-sm text-gray-700">
                      This style only ({order.style_code})
                    </span>
                  </label>

                  {/* All styles option */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="applyMode"
                      value="all"
                      checked={applyMode === 'all'}
                      onChange={() => setApplyMode('all')}
                      className="w-4 h-4 text-primary-600 focus:ring-primary-500"
                      disabled={isSaving}
                    />
                    <span className="text-sm text-gray-700">
                      All styles on this PO ({stylesOnPO.length} styles)
                    </span>
                  </label>

                  {/* Selected styles option */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="applyMode"
                      value="selected"
                      checked={applyMode === 'selected'}
                      onChange={() => setApplyMode('selected')}
                      className="w-4 h-4 text-primary-600 focus:ring-primary-500"
                      disabled={isSaving}
                    />
                    <span className="text-sm text-gray-700">Selected styles:</span>
                  </label>

                  {/* Style checkboxes (shown when 'selected' mode is active) */}
                  {applyMode === 'selected' && (
                    <div className="ml-6 mt-2 max-h-40 overflow-y-auto border rounded-lg p-2 bg-gray-50">
                      {loadingStyles ? (
                        <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Loading styles...
                        </div>
                      ) : (
                        stylesOnPO.map((style) => (
                          <label
                            key={style.id}
                            className="flex items-center gap-2 py-1 cursor-pointer hover:bg-gray-100 rounded px-1"
                          >
                            <input
                              type="checkbox"
                              checked={selectedOrderIds.includes(style.id)}
                              onChange={() => handleStyleToggle(style.id)}
                              className="w-4 h-4 text-primary-600 focus:ring-primary-500 rounded"
                              disabled={isSaving}
                            />
                            <span className="text-sm text-gray-700 truncate">
                              {style.style_code}
                              {style.colour && ` - ${style.colour}`}
                              {style.description && (
                                <span className="text-gray-400 ml-1">
                                  ({style.description.slice(0, 30)}
                                  {style.description.length > 30 ? '...' : ''})
                                </span>
                              )}
                            </span>
                          </label>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={handleCancel}
                disabled={isSaving}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || (applyMode === 'selected' && selectedOrderIds.length === 0) || (isSupplierDateEdit && !changeReason.trim())}
                className="px-4 py-2 bg-primary-600 text-white hover:bg-primary-700 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    {isDateField && applyMode === 'all'
                      ? `Save (${stylesOnPO.length} styles)`
                      : isDateField && applyMode === 'selected'
                      ? `Save (${selectedOrderIds.length} styles)`
                      : 'Save'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
