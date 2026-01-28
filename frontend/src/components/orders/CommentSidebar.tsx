'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Send, MessageSquare, Clock, User } from 'lucide-react';
import { format, parseISO } from 'date-fns';
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

  // Suppliers cannot see history
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

  // Reload history when the order is updated or when switching to history tab
  useEffect(() => {
    if (selectedOrder?.id && canViewHistory && activeTab === 'history') {
      loadHistory();
    }
  }, [selectedOrder?.updated_at, canViewHistory, activeTab]);

  useEffect(() => {
    // Scroll to bottom when new comments are added
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
        // Add comment to all orders with the same PO number
        const result = await ordersApi.bulkAddComment(selectedOrder.po_number, newComment.trim());
        toast.success(`Comment added to ${result.comments_added} orders`);
        setAddToAllOnPO(false);
      } else {
        // Add to single order
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

  if (!selectedOrder) return null;

  return (
    <>
      {/* Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          'sidebar w-full max-w-md',
          isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <h2 className="font-semibold text-gray-900">
              Order {selectedOrder.customer_po_number || selectedOrder.po_number}
            </h2>
            <p className="text-sm text-gray-500">{selectedOrder.customer} - {selectedOrder.style_code}</p>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('comments')}
            className={cn(
              'flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors',
              canViewHistory ? 'flex-1' : 'w-full',
              activeTab === 'comments'
                ? 'text-primary-600 border-b-2 border-primary-600'
                : 'text-gray-500 hover:text-gray-700'
            )}
          >
            <MessageSquare className="w-4 h-4" />
            Comments ({comments.length})
          </button>
          {canViewHistory && (
            <button
              onClick={() => setActiveTab('history')}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors',
                activeTab === 'history'
                  ? 'text-primary-600 border-b-2 border-primary-600'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <Clock className="w-4 h-4" />
              History ({history.length})
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto h-[calc(100vh-220px)]">
          {activeTab === 'comments' ? (
            <div className="p-4 space-y-4">
              {comments.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No comments yet</p>
                  <p className="text-sm">Be the first to add a comment</p>
                </div>
              ) : (
                comments.map((comment) => (
                  <CommentBubble key={comment.id} comment={comment} />
                ))
              )}
              <div ref={commentsEndRef} />
            </div>
          ) : (
            <div className="p-4 space-y-3">
              {history.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No history recorded</p>
                </div>
              ) : (
                history.map((item) => {
                  const isImport = item.source === 'Excel Import';
                  const isSupplierSource = item.source === 'Supplier';
                  const isSupplierApproved = item.source === 'Supplier (Approved)';
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "rounded-lg p-3 text-sm",
                        isImport ? "bg-purple-50" : (isSupplierSource || isSupplierApproved) ? "bg-orange-50" : "bg-gray-50"
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">
                            {formatFieldName(item.field_name)}
                          </span>
                          <span
                            className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                              isImport
                                ? "bg-purple-100 text-purple-700"
                                : isSupplierApproved
                                ? "bg-green-100 text-green-700"
                                : isSupplierSource
                                ? "bg-orange-100 text-orange-700"
                                : "bg-blue-100 text-blue-700"
                            )}
                          >
                            {item.source || 'Sourcelab'}
                          </span>
                        </div>
                        <span className="text-xs text-gray-500">
                          {format(parseISO(item.created_at), 'dd/MM/yyyy HH:mm')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-600">
                        <span className="line-through text-gray-400">
                          {item.old_value || 'Empty'}
                        </span>
                        <span>→</span>
                        <span className="font-medium">{item.new_value || 'Empty'}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Changed by {item.username}
                        {item.approved_by && (
                          <span className="text-green-600"> • Approved by {item.approved_by}</span>
                        )}
                      </p>
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
            className="p-4 border-t border-gray-200 bg-white"
          >
            <label className="flex items-center gap-2 mb-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={addToAllOnPO}
                onChange={(e) => setAddToAllOnPO(e.target.checked)}
                className="rounded text-primary-600"
              />
              Add to all styles on this PO
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a comment..."
                className="input-field flex-1"
                disabled={isSubmitting}
              />
              <button
                type="submit"
                disabled={!newComment.trim() || isSubmitting}
                className="btn-primary px-3"
              >
                {isSubmitting ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}

function CommentBubble({ comment }: { comment: Comment }) {
  // Check for Sourcelab (new format) or internal/SOURCELAB (old formats)
  const isSourcelab = comment.source === 'Sourcelab' ||
                      comment.source === 'SOURCELAB' ||
                      comment.source === 'internal';

  return (
    <div
      className={cn(
        'rounded-lg p-3',
        isSourcelab ? 'bg-primary-50' : 'bg-orange-50'
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <div
          className={cn(
            'w-6 h-6 rounded-full flex items-center justify-center',
            isSourcelab ? 'bg-primary-200' : 'bg-orange-200'
          )}
        >
          <User className="w-3 h-3 text-gray-700" />
        </div>
        <span className="font-medium text-sm text-gray-900">
          {comment.username}
        </span>
        <span
          className={cn(
            'text-xs px-2 py-0.5 rounded-full',
            isSourcelab
              ? 'bg-blue-100 text-blue-700'
              : 'bg-orange-100 text-orange-700'
          )}
        >
          {isSourcelab ? 'Sourcelab' : 'Supplier'}
        </span>
      </div>
      <p className="text-sm text-gray-700 ml-8">{comment.comment_text}</p>
      <p className="text-xs text-gray-500 ml-8 mt-1">
        {format(parseISO(comment.created_at), 'dd/MM/yyyy HH:mm')}
      </p>
    </div>
  );
}
