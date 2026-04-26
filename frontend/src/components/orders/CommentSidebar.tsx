'use client';

import { useState } from 'react';
import { X, MessageSquare, Clock } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';
import { CommentThread } from './comments/CommentThread';
import { HistoryPanel } from './comments/HistoryPanel';

/**
 * Slide-out comments panel anchored from the /orders spreadsheet. Tabs
 * comments / history (history hidden for suppliers). Both panes use the
 * same CommentThread / HistoryPanel components as the V2 detail modal so
 * the look stays consistent across surfaces.
 */
export function CommentSidebar() {
  const {
    selectedOrder,
    isSidebarOpen,
    setSidebarOpen,
    user,
    updateOrderInList,
  } = useStore();

  const [activeTab, setActiveTab] = useState<'comments' | 'history'>('comments');
  const isSupplier = user?.role === 'supplier';
  const canViewHistory = !isSupplier;

  if (!selectedOrder) return null;

  const handleCommentAdded = () => {
    if (selectedOrder) {
      updateOrderInList({
        ...selectedOrder,
        comment_count: (selectedOrder.comment_count || 0) + 1,
      });
    }
  };

  return (
    <>
      {/* Overlay */}
      <div
        className={cn(
          'fixed inset-0 z-40 transition-all duration-[550ms] ease-out',
          isSidebarOpen
            ? 'bg-black/15 backdrop-blur-[1px] pointer-events-auto'
            : 'bg-transparent backdrop-blur-0 pointer-events-none'
        )}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <div
        className={cn(
          'sidebar w-full max-w-md flex flex-col bg-white',
          isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'
        )}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 bg-white flex-shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">
                {selectedOrder.po_number}
                {selectedOrder.style_code && <span className="text-gray-400 font-normal"> · {selectedOrder.style_code}</span>}
              </div>
              <h2 className="text-sm font-bold text-gray-900 truncate">
                {selectedOrder.customer || selectedOrder.description || 'Order'}
              </h2>
              {(selectedOrder.description || selectedOrder.colour) && (
                <p className="text-[11px] text-gray-500 truncate mt-0.5">
                  {selectedOrder.description}
                  {selectedOrder.description && selectedOrder.colour && ' · '}
                  {selectedOrder.colour}
                </p>
              )}
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
              aria-label="Close panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        {canViewHistory ? (
          <div className="flex border-b border-gray-200 bg-gray-50/40 px-2 flex-shrink-0">
            <TabButton
              active={activeTab === 'comments'}
              onClick={() => setActiveTab('comments')}
              icon={<MessageSquare className="w-3.5 h-3.5" />}
              label="Comments"
            />
            <TabButton
              active={activeTab === 'history'}
              onClick={() => setActiveTab('history')}
              icon={<Clock className="w-3.5 h-3.5" />}
              label="History"
            />
          </div>
        ) : (
          <div className="px-5 py-2.5 border-b border-gray-200 bg-gray-50/40 flex items-center gap-2 flex-shrink-0">
            <MessageSquare className="w-3.5 h-3.5 text-gray-500" />
            <span className="text-xs font-semibold text-gray-700">Comments</span>
          </div>
        )}

        {/* Content — render the matching panel without its own framing since the
            sidebar already provides chrome. */}
        <div className="flex-1 min-h-0 flex flex-col">
          {activeTab === 'comments' ? (
            <CommentThread
              key={`comments-${selectedOrder.id}`}
              orderId={selectedOrder.id}
              poNumber={selectedOrder.po_number}
              framed={false}
              onCommentAdded={handleCommentAdded}
            />
          ) : (
            <HistoryPanel
              key={`history-${selectedOrder.id}`}
              orderId={selectedOrder.id}
              framed={false}
            />
          )}
        </div>
      </div>
    </>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-semibold transition-colors',
        active
          ? 'text-primary-700 border-b-2 border-primary-600 -mb-px'
          : 'text-gray-500 hover:text-gray-700 border-b-2 border-transparent'
      )}
    >
      {icon}
      {label}
    </button>
  );
}
