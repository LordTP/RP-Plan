'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, AlertTriangle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { submissionsApi, type SampleType, type RejectReason } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Props {
  orderId: number;
  componentId: number | null;
  componentName: string | null;
  sampleType: SampleType;
  currentAttemptNo: number;
  onClose: () => void;
  onRejected: () => void;
}

type ApplyScope = 'single' | 'all_on_po' | 'selected';

interface Sibling {
  order_id: number;
  component_id: number | null;
  style_code: string | null;
  description: string | null;
  colour: string | null;
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

  // Multi-style apply scope — default to all_on_po per user preference.
  const [applyScope, setApplyScope] = useState<ApplyScope>('all_on_po');
  const [siblings, setSiblings] = useState<Sibling[]>([]);
  const [loadingSiblings, setLoadingSiblings] = useState(true);
  const [selectedSiblingOrderIds, setSelectedSiblingOrderIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    submissionsApi
      .getRejectReasons()
      .then((res) => { if (!cancelled) setReasons(res.reasons); })
      .catch(() => { if (!cancelled) toast.error('Failed to load rejection reasons'); })
      .finally(() => { if (!cancelled) setLoadingReasons(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    submissionsApi
      .getSiblings({ order_id: orderId, component_id: componentId, sample_type: sampleType })
      .then((res) => {
        if (cancelled) return;
        setSiblings(res.siblings);
        // Pre-select all siblings for the "selected" mode ticklist so the user can
        // just uncheck the ones they don't want.
        setSelectedSiblingOrderIds(new Set(res.siblings.map((s) => s.order_id)));
        // If no siblings exist, fall back to 'single' — no point offering multi-apply.
        if (res.siblings.length === 0) setApplyScope('single');
      })
      .catch(() => {
        if (!cancelled) setApplyScope('single');
      })
      .finally(() => { if (!cancelled) setLoadingSiblings(false); });
    return () => { cancelled = true; };
  }, [orderId, componentId, sampleType]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
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
      const payload: Parameters<typeof submissionsApi.reject>[0] = {
        order_id: orderId,
        component_id: componentId,
        sample_type: sampleType,
        reason,
        notes: notes.trim() || undefined,
        apply_scope: applyScope,
      };
      if (applyScope === 'selected') {
        payload.apply_to_order_ids = Array.from(selectedSiblingOrderIds);
      }
      const result = await submissionsApi.reject(payload);
      const n = result.applied_to_count;
      toast.success(
        n > 1
          ? `${SAMPLE_TYPE_LABEL[sampleType]} rejected on ${n} styles — v${currentAttemptNo + 1} opened`
          : `${SAMPLE_TYPE_LABEL[sampleType]} rejected — v${currentAttemptNo + 1} opened`
      );
      onRejected();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to reject');
      setSubmitting(false);
    }
  };

  const toggleSelected = (orderIdToToggle: number) => {
    setSelectedSiblingOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderIdToToggle)) next.delete(orderIdToToggle); else next.add(orderIdToToggle);
      return next;
    });
  };

  const effectiveCount = useMemo(() => {
    if (applyScope === 'single') return 1;
    if (applyScope === 'all_on_po') return 1 + siblings.length;
    return 1 + selectedSiblingOrderIds.size; // 'selected' — always includes the primary
  }, [applyScope, siblings.length, selectedSiblingOrderIds.size]);

  const sampleLabel = SAMPLE_TYPE_LABEL[sampleType];
  const contextLine = componentName ? `${componentName}` : 'Order-level sample';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-xl shadow-xl ring-1 ring-gray-100 overflow-hidden flex flex-col max-h-[90vh]"
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
        <div className="px-5 py-4 space-y-4 overflow-y-auto">
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

          {/* Multi-style apply scope */}
          <div>
            <label className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide mb-1.5 block">
              Apply to
            </label>
            {loadingSiblings ? (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Checking sibling styles…
              </div>
            ) : siblings.length === 0 ? (
              <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                No other styles on this PO {componentName ? `have "${componentName}"` : 'share this sample type'} — rejection applies to this style only.
              </div>
            ) : (
              <div className="space-y-1.5">
                <ScopeRadio
                  checked={applyScope === 'all_on_po'}
                  onChange={() => setApplyScope('all_on_po')}
                  title="All styles on this PO"
                  subtitle={`${1 + siblings.length} styles ${componentName ? `with "${componentName}"` : ''}`}
                />
                <ScopeRadio
                  checked={applyScope === 'single'}
                  onChange={() => setApplyScope('single')}
                  title="This style only"
                  subtitle="Just the one you clicked"
                />
                <ScopeRadio
                  checked={applyScope === 'selected'}
                  onChange={() => setApplyScope('selected')}
                  title="Select specific styles"
                  subtitle={applyScope === 'selected' ? `${selectedSiblingOrderIds.size} of ${siblings.length} siblings ticked` : 'Pick which siblings to include'}
                />
                {applyScope === 'selected' && (
                  <div className="ml-6 mt-2 border border-gray-200 rounded-lg bg-gray-50/40 max-h-40 overflow-y-auto divide-y divide-gray-100">
                    {siblings.map((s) => (
                      <label key={s.order_id} className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-white cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedSiblingOrderIds.has(s.order_id)}
                          onChange={() => toggleSelected(s.order_id)}
                          className="w-3.5 h-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        <span className="font-mono text-gray-700">{s.style_code || `#${s.order_id}`}</span>
                        <span className="text-gray-500 truncate">{s.description}</span>
                        <span className="text-gray-400 ml-auto truncate max-w-[90px]">{s.colour}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-[11px] text-amber-800 leading-relaxed">
            <strong className="text-amber-900">
              {effectiveCount === 1
                ? `This closes v${currentAttemptNo} and opens v${currentAttemptNo + 1}.`
                : `This closes v${currentAttemptNo} and opens v${currentAttemptNo + 1} on ${effectiveCount} styles.`}
            </strong>{' '}
            The sample status resets to OUTSTANDING on every affected style. v{currentAttemptNo}&apos;s history is preserved.
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
            {effectiveCount === 1
              ? `Reject & open v${currentAttemptNo + 1}`
              : `Reject on ${effectiveCount} styles`}
          </button>
        </div>
      </div>
    </div>
  );
}

function ScopeRadio({
  checked,
  onChange,
  title,
  subtitle,
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <label
      className={cn(
        'flex items-start gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors',
        checked ? 'bg-red-50/60 border-red-200' : 'bg-white border-gray-200 hover:bg-gray-50'
      )}
    >
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        className="mt-0.5 w-3.5 h-3.5 text-red-600 focus:ring-red-500 focus:ring-offset-0 border-gray-300"
      />
      <div className="min-w-0">
        <div className={cn('text-xs font-semibold', checked ? 'text-red-800' : 'text-gray-800')}>{title}</div>
        <div className={cn('text-[11px]', checked ? 'text-red-700' : 'text-gray-500')}>{subtitle}</div>
      </div>
    </label>
  );
}
