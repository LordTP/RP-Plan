'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Send, MessageSquare, Clock, User, ArrowRight } from 'lucide-react';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import { useStore } from '@/store/useStore';
import { ordersApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Comment, DateHistory } from '@/types';

export function CommentSidebar() {
  const {
    selectedOrder,
    comments,
    setComments,
    addComment,
    isSidebarOpen,
    setSidebarOpen,
    user,
  } = useStore();

  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [history, setHistory] = useState<DateHistory[]>([]);
  const [activeTab, setActiveTab] = useState<'comments' | 'history'>('comments');
  const [addToAllOnPO, setAddToAllOnPO] = useState(false);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  const isSupplier = user?.role === 'supplier';
  const canViewHistory = !isSupplier;

  useEffect(() => {
    if (selectedOrder?.id) {
      loadComments();
      if (canViewHistory) {
        loadHistory();
      }
    }
  }, [selectedOrder?.id, canViewHistory]);

  useEffect(() => {
    if (selectedOrder?.id && canViewHistory && activeTab === 'history') {
      loadHistory();
    }
  }, [selectedOrder?.updated_at, canViewHistory, activeTab]);

  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments]);

  const loadComments = async () => {
    if (!selectedOrder?.id) return;
    try {
      const data = await ordersApi.getOrderComments(selectedOrder.id);
      setComments(data);
    } catch (error) {
      console.error('Failed to load comments:', error);
    }
  };

  const loadHistory = async () => {
    if (!selectedOrder?.id) return;
    try {
      const data = await ordersApi.getOrderHistory(selectedOrder.id);
      setHistory(data);
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !selectedOrder?.id || !user) return;

    setIsSubmitting(true);
    try {
      if (addToAllOnPO && selectedOrder.po_number) {
        const result = await ordersApi.bulkAddComment(selectedOrder.po_number, newComment.trim());
        toast.success(`Comment added to ${result.comments_added} orders`);
        setAddToAllOnPO(false);
      } else {
        const source = user.role === 'supplier' ? 'supplier' : 'internal';
        const comment = await ordersApi.addOrderComment(
          selectedOrder.id,
          newComment.trim(),
          source
        );
        addComment(comment);
        toast.success('Comment added');
      }
      setNewComment('');
      loadComments();
    } catch (error) {
      toast.error('Failed to add comment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatFieldName = (field: string): string => {
    return field
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const isUnread = (comment: Comment): boolean => {
    if (!user) return false;
    return !comment.read;
  };

  if (!selectedOrder) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className={cn(
          "fixed inset-0 z-40 transition-all duration-[550ms] ease-out",
          isSidebarOpen
            ? "bg-black/15 backdrop-blur-[1px] pointer-events-auto"
            : "bg-transparent backdrop-blur-0 pointer-events-none"
        )}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <div
        className={cn(
          'sidebar w-full max-w-sm flex flex-col',
          isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'
        )}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200/60 bg-gradient-to-r from-primary-600 to-primary-700">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-white truncate">
                {selectedOrder.po_number}
                {selectedOrder.style_code && <span className="text-primary-200 font-normal"> · {selectedOrder.style_code}</span>}
              </h2>
              <p className="text-xs text-primary-200 truncate mt-0.5">{selectedOrder.customer} — {selectedOrder.description || selectedOrder.colour || ''}</p>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1.5 hover:bg-white/15 rounded-lg transition-colors flex-shrink-0 ml-2"
            >
              <X className="w-4 h-4 text-primary-200" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex bg-gray-50/80 px-2 pt-2 gap-1">
          <button
            onClick={() => setActiveTab('comments')}
            className={cn(
              'flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-medium transition-all rounded-t-lg',
              canViewHistory ? 'flex-1' : 'w-full',
              activeTab === 'comments'
                ? 'text-primary-700 bg-white shadow-sm border border-gray-200/60 border-b-white -mb-px'
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100/60'
            )}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Comments
            <span className={cn(
              'text-[10px] px-1.5 py-0.5 rounded-full font-semibold',
              activeTab === 'comments' ? 'bg-primary-100 text-primary-700' : 'bg-gray-200/80 text-gray-500'
            )}>
              {comments.length}
            </span>
          </button>
          {canViewHistory && (
            <button
              onClick={() => setActiveTab('history')}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-medium transition-all rounded-t-lg',
                activeTab === 'history'
                  ? 'text-primary-700 bg-white shadow-sm border border-gray-200/60 border-b-white -mb-px'
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100/60'
              )}
            >
              <Clock className="w-3.5 h-3.5" />
              History
              <span className={cn(
                'text-[10px] px-1.5 py-0.5 rounded-full font-semibold',
                activeTab === 'history' ? 'bg-primary-100 text-primary-700' : 'bg-gray-200/80 text-gray-500'
              )}>
                {history.length}
              </span>
            </button>
          )}
        </div>
        <div className="border-b border-gray-200/60" />

        {/* Content */}
        <div className="flex-1 overflow-y-auto h-[calc(100vh-220px)]">
          {activeTab === 'comments' ? (
            <div className="p-4 space-y-3">
              {comments.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                    <MessageSquare className="w-6 h-6 text-gray-300" />
                  </div>
                  <p className="text-sm font-medium text-gray-500">No comments yet</p>
                  <p className="text-xs text-gray-400 mt-1">Be the first to add a comment</p>
                </div>
              ) : (
                comments.map((comment) => (
                  <CommentBubble key={comment.id} comment={comment} unread={isUnread(comment)} />
                ))
              )}
              <div ref={commentsEndRef} />
            </div>
          ) : (
            <div className="p-4 space-y-2">
              {history.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                    <Clock className="w-6 h-6 text-gray-300" />
                  </div>
                  <p className="text-sm font-medium text-gray-500">No history recorded</p>
                </div>
              ) : (
                history.map((item) => {
                  const isImport = item.source === 'Excel Import';
                  const isSupplierSource = item.source === 'Supplier';
                  const isSupplierApproved = item.source === 'Supplier (Approved)';
                  const isSupplierRejected = item.source === 'Supplier (Rejected)';

                  let timeAgo = '';
                  try {
                    timeAgo = formatDistanceToNow(parseISO(item.created_at), { addSuffix: true });
                  } catch { /* */ }

                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "rounded-xl px-4 py-3 text-xs border transition-colors",
                        isImport ? "bg-purple-50/80 border-purple-100"
                          : isSupplierRejected ? "bg-red-50/80 border-red-100"
                          : (isSupplierSource || isSupplierApproved) ? "bg-orange-50/80 border-orange-100"
                          : "bg-gray-50/80 border-gray-100"
                      )}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900">
                            {formatFieldName(item.field_name)}
                          </span>
                          <span
                            className={cn(
                              "text-[10px] px-2 py-0.5 rounded-full font-semibold",
                              isImport
                                ? "bg-purple-100 text-purple-700"
                                : isSupplierApproved
                                ? "bg-green-100 text-green-700"
                                : isSupplierRejected
                                ? "bg-red-100 text-red-700"
                                : isSupplierSource
                                ? "bg-orange-100 text-orange-700"
                                : "bg-blue-100 text-blue-700"
                            )}
                          >
                            {item.source || 'Sourcelab'}
                          </span>
                        </div>
                        <span className="text-[11px] text-gray-400" title={format(parseISO(item.created_at), 'dd/MM/yyyy HH:mm')}>
                          {timeAgo}
                        </span>
                      </div>
                      <div className={cn(
                        "flex items-center gap-2 text-xs mt-1",
                        isSupplierRejected ? "text-red-500" : "text-gray-600"
                      )}>
                        <span className="line-through text-gray-400 bg-gray-100/80 px-1.5 py-0.5 rounded">
                          {item.old_value || 'Empty'}
                        </span>
                        <ArrowRight className="w-3 h-3 text-gray-300 flex-shrink-0" />
                        <span className={cn(
                          "font-semibold px-1.5 py-0.5 rounded",
                          isSupplierRejected ? "line-through bg-red-100/60" : "bg-primary-50/80"
                        )}>
                          {item.new_value || 'Empty'}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-400 mt-1.5">
                        by <span className="font-medium text-gray-500">{item.username}</span>
                        {item.approved_by && !isSupplierRejected && (
                          <span className="text-green-600"> · Approved by {item.approved_by}</span>
                        )}
                        {item.approved_by && isSupplierRejected && (
                          <span className="text-red-500"> · Rejected by {item.approved_by}</span>
                        )}
                      </p>
                      {item.rejection_reason && (
                        <div className="mt-2 px-3 py-2 bg-red-100/80 border border-red-200 rounded-lg text-[11px] text-red-700">
                          <strong>Reason:</strong> {item.rejection_reason}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Comment Input */}
        {activeTab === 'comments' && (
          <form
            onSubmit={handleSubmit}
            className="p-4 border-t border-gray-200/60 bg-gray-50/50"
          >
            <label className="flex items-center gap-2 mb-3 text-[11px] text-gray-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={addToAllOnPO}
                onChange={(e) => setAddToAllOnPO(e.target.checked)}
                className="rounded text-primary-600 w-3.5 h-3.5 border-gray-300"
              />
              Add to all styles on this PO
            </label>
            <div className="flex gap-2 items-end">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a comment..."
                rows={2}
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 placeholder:text-gray-300 bg-white transition-all resize-none"
                disabled={isSubmitting}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (newComment.trim() && !isSubmitting) {
                      (e.target as HTMLTextAreaElement).form?.requestSubmit();
                    }
                  }
                }}
              />
              <button
                type="submit"
                disabled={!newComment.trim() || isSubmitting}
                className="px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-all disabled:opacity-40 shadow-sm hover:shadow"
              >
                {isSubmitting ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}

function CommentBubble({ comment, unread }: { comment: Comment; unread: boolean }) {
  const isSourcelab = comment.source === 'Sourcelab' ||
                      comment.source === 'SOURCELAB' ||
                      comment.source === 'internal';

  let timeAgo = '';
  try {
    timeAgo = formatDistanceToNow(parseISO(comment.created_at), { addSuffix: true });
  } catch { /* */ }

  return (
    <div
      className={cn(
        'rounded-xl px-4 py-3 relative border transition-colors',
        isSourcelab ? 'bg-white border-primary-100 hover:border-primary-200' : 'bg-white border-orange-100 hover:border-orange-200',
        unread && 'ring-2 ring-primary-200/60 border-primary-200'
      )}
    >
      {unread && (
        <div className="absolute top-3 right-3 w-2 h-2 bg-primary-500 rounded-full animate-pulse" />
      )}
      <div className="flex items-center gap-2 mb-2">
        <div
          className={cn(
            'w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shadow-sm',
            isSourcelab ? 'bg-gradient-to-br from-primary-400 to-primary-600 text-white' : 'bg-gradient-to-br from-orange-400 to-orange-600 text-white'
          )}
        >
          {comment.username.slice(0, 1).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-900">
              {comment.username}
            </span>
            <span
              className={cn(
                'text-[10px] px-2 py-0.5 rounded-full font-semibold',
                isSourcelab
                  ? 'bg-primary-50 text-primary-600'
                  : 'bg-orange-50 text-orange-600'
              )}
            >
              {isSourcelab ? 'Sourcelab' : 'Supplier'}
            </span>
          </div>
        </div>
        <span className="text-[11px] text-gray-400 flex-shrink-0" title={format(parseISO(comment.created_at), 'dd/MM/yyyy HH:mm')}>
          {timeAgo}
        </span>
      </div>
      <p className="text-[13px] text-gray-700 ml-9 leading-relaxed">{comment.comment_text}</p>
    </div>
  );
}
