'use client';

import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { ordersApi } from '@/lib/api';
import type { Order } from '@/types';

/**
 * Add one comment to every ticked style.
 *
 * Writes against the explicit selection rather than the whole PO — the bulk
 * bar's whole premise is that the user picked these rows, so commenting on
 * rows they did not tick would be a surprise.
 */
export function BulkCommentModal({ orders, onClose, onDone }: {
  orders: Order[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const pos = Array.from(new Set(orders.map(o => o.po_number)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  async function submit() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const res = await ordersApi.bulkAddCommentOnIds(orders.map(o => o.id), text.trim());
      toast.success(`Comment added to ${res.comments_added} ${res.comments_added === 1 ? 'style' : 'styles'}`);
      onDone();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Could not add the comment');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-6">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl ring-1 ring-black/5 overflow-hidden">
        <div className="px-5 pt-4 pb-3 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-bold text-gray-900 leading-tight">Add a comment</h3>
            <p className="text-[12px] text-gray-500 mt-1">
              Goes on all <b className="text-gray-700">{orders.length}</b> selected{' '}
              {orders.length === 1 ? 'style' : 'styles'}
              {pos.length === 1 ? <> on PO <b className="text-gray-700 font-mono">{pos[0]}</b></>
                               : <> across <b className="text-gray-700">{pos.length}</b> orders</>}.
            </p>
          </div>
          <button onClick={onClose} disabled={busy}
                  className="p-1 -mr-1 text-gray-300 hover:text-gray-700 rounded disabled:opacity-40">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 pb-3">
          <textarea
            autoFocus
            rows={4}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Type the comment… @mention someone to email them."
            className="w-full px-3 py-2 text-[13px] border border-gray-300 rounded-lg resize-none
                       focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400"
          />
          <p className="text-[11px] text-gray-400 mt-1.5">
            An @mention sends one consolidated email per person, not one per style.
          </p>
        </div>
        <div className="px-5 py-3 bg-gray-50/60 border-t border-gray-100 flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={busy}
                  className="px-3.5 py-2 text-[13px] font-medium text-gray-600 hover:text-gray-900 disabled:opacity-50">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !text.trim()}
            className="px-4 py-2 text-[13px] font-semibold text-white bg-primary-600 rounded-lg
                       hover:bg-primary-700 disabled:opacity-40 inline-flex items-center gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Add to {orders.length} {orders.length === 1 ? 'style' : 'styles'}
          </button>
        </div>
      </div>
    </div>
  );
}
