'use client';

import { useEffect, useState } from 'react';
import { X, AlertTriangle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { submissionsApi, type SampleType, type RejectReason } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Props {
  orderId: number;
  componentId: number | null;
  componentName: string | null;
  sampleType: SampleType;
  currentAttemptNo: number; // what v we're rejecting (1 if first rejection)
  onClose: () => void;
  onRejected: () => void;
}

const SAMPLE_TYPE_LABEL: Record<SampleType, string> = {
  fit: 'Fit Sample',
  strike: 'Strike Off',
  lab: 'Lab Dip',
  pps: 'PPS',
};

export function RejectSampleModal({
  orderId,
  componentId,
  componentName,
  sampleType,
  currentAttemptNo,
  onClose,
  onRejected,
}: Props) {
  const [reasons, setReasons] = useState<RejectReason[]>([]);
  const [reason, setReason] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [loadingReasons, setLoadingReasons] = useState(true);

  useEffect(() => {
    let cancelled = false;
    submissionsApi
      .getRejectReasons()
      .then((res) => {
        if (cancelled) return;
        setReasons(res.reasons);
      })
      .catch(() => {
        if (!cancelled) toast.error('Failed to load rejection reasons');
      })
      .finally(() => {
        if (!cancelled) setLoadingReasons(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSubmit = async () => {
    if (!reason) {
      toast.error('Pick a reason before rejecting');
      return;
    }
    setSubmitting(true);
    try {
      await submissionsApi.reject({
        order_id: orderId,
        component_id: componentId,
        sample_type: sampleType,
        reason,
        notes: notes.trim() || undefined,
      });
      toast.success(`${SAMPLE_TYPE_LABEL[sampleType]} rejected — v${currentAttemptNo + 1} opened`);
      onRejected();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to reject');
      setSubmitting(false);
    }
  };

  const sampleLabel = SAMPLE_TYPE_LABEL[sampleType];
  const contextLine = componentName ? `${componentName}` : 'Order-level sample';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-xl shadow-xl ring-1 ring-gray-100 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-red-600 mb-0.5">
                Reject {sampleLabel} · v{currentAttemptNo}
              </div>
              <h3 className="text-base font-bold text-gray-900 truncate">{contextLine}</h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4 flex-1">
          <div>
            <label className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide mb-1.5 block">
              Reason
            </label>
            {loadingReasons ? (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Loading reasons…
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {reasons.map((r) => (
                  <button
                    key={r.code}
                    type="button"
                    onClick={() => setReason(r.code)}
                    className={cn(
                      'px-2.5 py-1.5 text-xs rounded-lg border text-left transition-colors',
                      reason === r.code
                        ? 'bg-red-50 border-red-300 text-red-800 font-semibold'
                        : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide mb-1.5 block">
              Note to factory <span className="text-gray-400 font-normal normal-case">(optional but helpful)</span>
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What exactly is wrong and what do you want them to change?"
              className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-lg placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white focus:border-transparent transition-all resize-none"
            />
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-[11px] text-amber-800 leading-relaxed">
            <strong className="text-amber-900">This closes v{currentAttemptNo} and opens v{currentAttemptNo + 1}.</strong>{' '}
            The sample status resets to OUTSTANDING. v{currentAttemptNo}&apos;s history is preserved.
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-end gap-2 bg-gray-50/40 flex-shrink-0">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !reason || loadingReasons}
            className={cn(
              'px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5',
              submitting || !reason || loadingReasons
                ? 'bg-red-300 text-white cursor-not-allowed'
                : 'bg-red-600 text-white hover:bg-red-700'
            )}
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Reject &amp; open v{currentAttemptNo + 1}
          </button>
        </div>
      </div>
    </div>
  );
}
