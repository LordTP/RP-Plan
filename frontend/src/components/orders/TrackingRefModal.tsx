'use client';

import { useState, useEffect } from 'react';

interface TrackingRefModalProps {
  isOpen: boolean;
  poNumber: string;
  isBulk: boolean;
  onConfirm: (trackingRef: string) => void;
  onCancel: () => void;
}

export function TrackingRefModal({ isOpen, poNumber, isBulk, onConfirm, onCancel }: TrackingRefModalProps) {
  const [trackingRef, setTrackingRef] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTrackingRef('');
      setIsSaving(false);
    }
  }, [isOpen]);

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

  const handleSubmit = async () => {
    if (!trackingRef.trim()) return;
    setIsSaving(true);
    try {
      await onConfirm(trackingRef.trim());
    } finally {
      setIsSaving(false);
    }
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
          {isBulk
            ? `Enter a tracking reference for all lines on PO ${poNumber}`
            : `Enter a tracking reference for PO ${poNumber}`}
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
              if (e.key === 'Enter' && trackingRef.trim()) {
                handleSubmit();
              }
            }}
            placeholder="Enter tracking reference..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            autoFocus
            maxLength={100}
          />
        </div>

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
            disabled={!trackingRef.trim() || isSaving}
            className="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Saving...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
