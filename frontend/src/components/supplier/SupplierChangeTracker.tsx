'use client';

import { useEffect, useState, useCallback } from 'react';
import { Clock, CheckCircle, XCircle, X, Loader2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';
import { approvalsApi, MyPendingChange, MyApprovedChange, RejectedChange } from '@/lib/api';

/**
 * Three-column tracker shown to suppliers: their pending date-change requests,
 * recently approved ones, and rejected ones. Pulled out of the dashboard so it
 * can sit at the top of /factory-product (suppliers' new landing page).
 *
 * Refreshes on mount and whenever `refreshKey` changes, so callers can
 * trigger a refresh after submitting a new date-change request.
 */
export function SupplierChangeTracker({ refreshKey = 0 }: { refreshKey?: number }) {
  const [myPendingChanges, setMyPendingChanges] = useState<MyPendingChange[]>([]);
  const [myApprovedChanges, setMyApprovedChanges] = useState<MyApprovedChange[]>([]);
  const [rejectedChanges, setRejectedChanges] = useState<RejectedChange[]>([]);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [pending, approved, rejected] = await Promise.all([
        approvalsApi.getMyPendingChanges(),
        approvalsApi.getMyApprovedChanges(),
        approvalsApi.getRejectedChanges(),
      ]);
      setMyPendingChanges(pending.pending_changes);
      setMyApprovedChanges(approved.approved_changes);
      setRejectedChanges(rejected.rejected_changes);
    } catch (e) {
      // Silent — dashboard cards just stay empty.
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData, refreshKey]);

  const handleCancelPending = async (id: number) => {
    setCancellingId(id);
    try {
      await approvalsApi.cancelPendingChange(id);
      toast.success('Pending change cancelled');
      loadData();
    } catch {
      toast.error('Failed to cancel pending change');
    } finally {
      setCancellingId(null);
    }
  };

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return '—';
    try { return format(parseISO(dateStr), 'dd MMM yyyy'); } catch { return dateStr; }
  };

  const formatFieldName = (field: string): string =>
    field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  // Nothing in any bucket and not loading → render nothing so we don't leave a gap
  const hasAny = myPendingChanges.length > 0 || myApprovedChanges.length > 0 || rejectedChanges.length > 0;
  if (!hasAny && !isLoading) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
      {/* Pending */}
      <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] ring-1 ring-gray-100 overflow-hidden">
        <div className="px-4 py-2.5 bg-orange-50 border-b border-orange-100 flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-orange-600" />
          <span className="text-[11px] font-medium text-orange-800">Pending approval</span>
          <span className="ml-auto text-[10px] bg-orange-200 text-orange-800 px-1.5 py-0.5 rounded-full font-semibold">{myPendingChanges.length}</span>
        </div>
        <div className="divide-y divide-gray-50 max-h-56 overflow-y-auto">
          {myPendingChanges.length === 0 ? (
            <div className="p-3 text-center text-[11px] text-gray-400">No pending changes</div>
          ) : myPendingChanges.map((change) => (
            <div key={change.id} className="p-2.5 hover:bg-gray-50">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[12px] font-medium text-gray-900">
                    {change.po_number} <span className="text-[10px] text-gray-400">({change.style_code})</span>
                  </p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{formatFieldName(change.field_name)}</p>
                  <p className="text-[11px] mt-0.5">
                    <span className="text-gray-400">{change.current_value ? formatDate(change.current_value) : 'Not set'}</span>
                    {' → '}
                    <span className="font-medium text-orange-600">{change.proposed_value ? formatDate(change.proposed_value) : 'Not set'}</span>
                  </p>
                </div>
                <button
                  onClick={() => handleCancelPending(change.id)}
                  disabled={cancellingId === change.id}
                  className="p-0.5 text-gray-400 hover:text-red-500 rounded transition-colors"
                  title="Cancel this pending request"
                >
                  {cancellingId === change.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Approved */}
      <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] ring-1 ring-gray-100 overflow-hidden">
        <div className="px-4 py-2.5 bg-green-50 border-b border-green-100 flex items-center gap-2">
          <CheckCircle className="w-3.5 h-3.5 text-green-600" />
          <span className="text-[11px] font-medium text-green-800">Approved</span>
          <span className="ml-auto text-[10px] bg-green-200 text-green-800 px-1.5 py-0.5 rounded-full font-semibold">{myApprovedChanges.length}</span>
        </div>
        <div className="divide-y divide-gray-50 max-h-56 overflow-y-auto">
          {myApprovedChanges.length === 0 ? (
            <div className="p-3 text-center text-[11px] text-gray-400">No approved changes yet</div>
          ) : myApprovedChanges.slice(0, 10).map((change) => (
            <div key={change.id} className="p-2.5 hover:bg-gray-50">
              <p className="text-[12px] font-medium text-gray-900">
                {change.po_number} <span className="text-[10px] text-gray-400">({change.style_code})</span>
              </p>
              <p className="text-[11px] text-gray-500 mt-0.5">{formatFieldName(change.field_name)}</p>
              <p className="text-[10px] text-green-600 mt-0.5">Approved by {change.approved_by}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Rejected */}
      <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] ring-1 ring-gray-100 overflow-hidden">
        <div className="px-4 py-2.5 bg-red-50 border-b border-red-100 flex items-center gap-2">
          <XCircle className="w-3.5 h-3.5 text-red-600" />
          <span className="text-[11px] font-medium text-red-800">Rejected</span>
          <span className="ml-auto text-[10px] bg-red-200 text-red-800 px-1.5 py-0.5 rounded-full font-semibold">{rejectedChanges.length}</span>
        </div>
        <div className="divide-y divide-gray-50 max-h-56 overflow-y-auto">
          {rejectedChanges.length === 0 ? (
            <div className="p-3 text-center text-[11px] text-gray-400">No rejected changes</div>
          ) : rejectedChanges.slice(0, 10).map((change) => (
            <div key={change.id} className="p-2.5 hover:bg-gray-50">
              <p className="text-[12px] font-medium text-gray-900">
                {change.po_number} <span className="text-[10px] text-gray-400">({change.style_code})</span>
              </p>
              <p className="text-[11px] text-gray-500 mt-0.5">{formatFieldName(change.field_name)}</p>
              <p className="text-[10px] text-red-600 mt-0.5 truncate">{change.rejection_reason}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
