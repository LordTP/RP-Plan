'use client';

import { useState, useRef, useEffect } from 'react';
import { Check, X, Loader2 } from 'lucide-react';
import { cn, formatDate, formatCurrency, formatNumber, formatDateForInput } from '@/lib/utils';
import { ordersApi } from '@/lib/api';
import type { ColumnDef, Order } from '@/types';

type ApplyMode = 'single' | 'all' | 'selected';

interface StyleOnPO {
  id: number;
  style_code: string;
  description: string;
  colour: string;
}

interface EditableCellProps {
  value: any;
  column: ColumnDef;
  order: Order;
  isEditable: boolean;
  isSupplierEditable: boolean;
  userRole: 'admin' | 'internal' | 'supplier';
  onSave: (orderId: number, field: string, value: any) => Promise<void>;
  onBulkSave?: () => void;
  isChanged?: boolean;
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
}: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  // Bulk update state for date fields
  const [applyMode, setApplyMode] = useState<ApplyMode>('single');
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
  const [stylesOnPO, setStylesOnPO] = useState<StyleOnPO[]>([]);
  const [loadingStyles, setLoadingStyles] = useState(false);

  const isDateField = column.type === 'date';

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

    setEditValue(initialValue);
    setApplyMode('single');
    setSelectedOrderIds([order.id]);
    setIsEditing(true);

    // For date fields, fetch all styles on this PO
    if (isDateField && order.po_number) {
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

      // For date fields with bulk apply mode, use the bulk API
      if (isDateField && applyMode !== 'single' && order.po_number) {
        const orderIdsToUpdate = applyMode === 'all'
          ? [] // Empty array means all orders on PO
          : selectedOrderIds;

        await ordersApi.bulkUpdateDate(
          order.po_number,
          column.key,
          saveValue,
          orderIdsToUpdate
        );

        // Notify parent to refresh data
        if (onBulkSave) {
          onBulkSave();
        }
      } else {
        // Single order update (existing behavior)
        await onSave(order.id, column.key, saveValue);
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

  return (
    <>
      <div
        onDoubleClick={handleDoubleClick}
        className={cn(
          'px-3 py-2 data-cell truncate',
          canEdit && 'editable-cell cursor-pointer',
          userRole === 'supplier' && isSupplierEditable && 'supplier-editable-cell',
          isChanged && 'bg-emerald-300 font-semibold text-emerald-900'
        )}
        title={isChanged ? 'Changed since last login - Double-click to edit' : (canEdit ? 'Double-click to edit' : undefined)}
      >
        {formatDisplayValue()}
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
              {column.type === 'text' && column.key === 'description' ? (
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

            {/* Bulk update options for date fields */}
            {isDateField && stylesOnPO.length > 1 && (
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
                disabled={isSaving || (applyMode === 'selected' && selectedOrderIds.length === 0)}
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
