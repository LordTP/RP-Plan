'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { ordersApi } from '@/lib/api';

type ApplyMode = 'single' | 'all' | 'selected';

interface StyleOnPO {
  id: number;
  style_code: string;
  description: string;
  colour: string;
}

interface TrackingRefModalProps {
  isOpen: boolean;
  poNumber: string;
  orderId: number;
  styleCode?: string;
  onConfirm: (trackingRef: string, applyMode: ApplyMode, selectedOrderIds: number[]) => void;
  onCancel: () => void;
}

export function TrackingRefModal({ isOpen, poNumber, orderId, styleCode, onConfirm, onCancel }: TrackingRefModalProps) {
  const [trackingRef, setTrackingRef] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [applyMode, setApplyMode] = useState<ApplyMode>('single');
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
  const [stylesOnPO, setStylesOnPO] = useState<StyleOnPO[]>([]);
  const [loadingStyles, setLoadingStyles] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTrackingRef('');
      setIsSaving(false);
      setApplyMode('single');
      setSelectedOrderIds([orderId]);
      setStylesOnPO([]);

      // Fetch styles on this PO
      if (poNumber) {
        setLoadingStyles(true);
        ordersApi.getStylesOnPO(poNumber)
          .then(result => {
            setStylesOnPO(result.orders);
            setSelectedOrderIds([orderId]);
          })
          .catch(console.error)
          .finally(() => setLoadingStyles(false));
      }
    }
  }, [isOpen, poNumber, orderId]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onCancel();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const handleStyleToggle = (id: number) => {
    setSelectedOrderIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = async () => {
    if (!trackingRef.trim()) return;
    if (applyMode === 'selected' && selectedOrderIds.length === 0) return;
    setIsSaving(true);
    try {
      await onConfirm(trackingRef.trim(), applyMode, selectedOrderIds);
    } finally {
      setIsSaving(false);
    }
  };

  const confirmLabel = () => {
    if (isSaving) return 'Saving...';
    if (applyMode === 'all') return `Confirm (${stylesOnPO.length} styles)`;
    if (applyMode === 'selected') return `Confirm (${selectedOrderIds.length} style${selectedOrderIds.length !== 1 ? 's' : ''})`;
    return 'Confirm';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Tracking Reference Required
          </h3>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          Enter a tracking reference for PO {poNumber}
        </p>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Tracking Reference
          </label>
          <input
            type="text"
            value={trackingRef}
            onChange={(e) => setTrackingRef(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && trackingRef.trim() && !(applyMode === 'selected' && selectedOrderIds.length === 0)) {
                handleSubmit();
              }
            }}
            placeholder="Enter tracking reference..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            autoFocus
            maxLength={100}
          />
        </div>

        {/* Style selection */}
        {stylesOnPO.length > 1 && (
          <div className="mb-4 border-t pt-4">
            <p className="text-sm font-medium text-gray-700 mb-3">Apply to:</p>
            <div className="space-y-2">
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
                  This style only{styleCode ? ` (${styleCode})` : ''}
                </span>
              </label>

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
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!trackingRef.trim() || isSaving || (applyMode === 'selected' && selectedOrderIds.length === 0)}
            className="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {confirmLabel()}
          </button>
        </div>
      </div>
    </div>
  );
}
