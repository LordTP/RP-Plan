'use client';

import { useState, useEffect, useRef } from 'react';
import { Send, MessageSquare, Clock, ArrowRight } from 'lucide-react';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import { useStore } from '@/store/useStore';
import { ordersApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Order, Comment, DateHistory } from '@/types';

interface InlineCommentsProps {
  order: Order;
}

export function InlineComments({ order }: InlineCommentsProps) {
  const { user } = useStore();
  const [comments, setComments] = useState<Comment[]>([]);
  const [history, setHistory] = useState<DateHistory[]>([]);
  const [activeTab, setActiveTab] = useState<'comments' | 'history'>('comments');
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [addToAllOnPO, setAddToAllOnPO] = useState(false);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  const isSupplier = user?.role === 'supplier';
  const canViewHistory = !isSupplier;

  useEffect(() => {
    loadComments();
    if (canViewHistory) loadHistory();
    // Mark as read
    ordersApi.markCommentsRead(order.id).catch(() => {});
  }, [order.id]);

  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments]);

  const loadComments = async () => {
    try {
      const data = await ordersApi.getOrderComments(order.id);
      setComments(data);
    } catch (error) {
      console.error('Failed to load comments:', error);
    }
  };

  const loadHistory = async () => {
    try {
      const data = await ordersApi.getOrderHistory(order.id);
      setHistory(data);
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !user) return;

    setIsSubmitting(true);
    try {
      if (addToAllOnPO && order.po_number) {
        const result = await ordersApi.bulkAddComment(order.po_number, newComment.trim());
        toast.success(`Comment added to ${result.comments_added} orders`);
        setAddToAllOnPO(false);
      } else {
        const source = user.role === 'supplier' ? 'supplier' : 'internal';
        await ordersApi.addOrderComment(order.id, newComment.trim(), source);
        toast.success('Comment added');
      }
      setNewComment('');
      loadComments();
    } catch (error) {
      toast.error('Failed to add comment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatFieldName = (field: string): string => {
    return field.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  };

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1 px-1 pb-3">
        <button
          onClick={() => setActiveTab('comments')}
          className={cn(
            'flex items-center gap-2 py-2 px-4 text-xs font-medium transition-all rounded-lg',
            activeTab === 'comments'
              ? 'text-primary-700 bg-primary-50'
              : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
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
              'flex items-center gap-2 py-2 px-4 text-xs font-medium transition-all rounded-lg',
              activeTab === 'history'
                ? 'text-primary-700 bg-primary-50'
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
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

      {/* Content */}
      <div>
        {activeTab === 'comments' ? (
          <div className="space-y-2.5 pb-2">
            {comments.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-2">
                  <MessageSquare className="w-5 h-5 text-gray-300" />
                </div>
                <p className="text-xs font-medium text-gray-500">No comments yet</p>
              </div>
            ) : (
              comments.map((comment) => {
                const isSourcelab = comment.source === 'Sourcelab' || comment.source === 'SOURCELAB' || comment.source === 'internal';
                const isUnread = !comment.read;
                let timeAgo = '';
                try { timeAgo = formatDistanceToNow(parseISO(comment.created_at), { addSuffix: true }); } catch {}

                return (
                  <div
                    key={comment.id}
                    className={cn(
                      'rounded-lg px-3 py-2.5 border transition-colors',
                      isSourcelab ? 'bg-white border-gray-100' : 'bg-white border-orange-100',
                      isUnread && 'ring-1 ring-primary-200/60'
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className={cn(
                        'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold',
                        isSourcelab ? 'bg-primary-500 text-white' : 'bg-orange-500 text-white'
                      )}>
                        {comment.username.slice(0, 1).toUpperCase()}
                      </div>
                      <span className="text-[11px] font-semibold text-gray-900">{comment.username}</span>
                      <span className={cn(
                        'text-[9px] px-1.5 py-0.5 rounded-full font-semibold',
                        isSourcelab ? 'bg-primary-50 text-primary-600' : 'bg-orange-50 text-orange-600'
                      )}>
                        {isSourcelab ? 'SL' : 'Supplier'}
                      </span>
                      <span className="text-[10px] text-gray-400 ml-auto">{timeAgo}</span>
                    </div>
                    <p className="text-xs text-gray-700 ml-8 leading-relaxed">{comment.comment_text}</p>
                  </div>
                );
              })
            )}
            <div ref={commentsEndRef} />
          </div>
        ) : (
          <div className="space-y-2 pb-2">
            {history.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-2">
                  <Clock className="w-5 h-5 text-gray-300" />
                </div>
                <p className="text-xs font-medium text-gray-500">No history</p>
              </div>
            ) : (
              history.map((item) => {
                const isImport = item.source === 'Excel Import';
                const isSupplierSource = item.source === 'Supplier';
                const isSupplierApproved = item.source === 'Supplier (Approved)';
                const isSupplierRejected = item.source === 'Supplier (Rejected)';
                let timeAgo = '';
                try { timeAgo = formatDistanceToNow(parseISO(item.created_at), { addSuffix: true }); } catch {}

                return (
                  <div
                    key={item.id}
                    className={cn(
                      'rounded-lg px-3 py-2.5 text-xs border',
                      isImport ? 'bg-purple-50/80 border-purple-100'
                        : isSupplierRejected ? 'bg-red-50/80 border-red-100'
                        : (isSupplierSource || isSupplierApproved) ? 'bg-orange-50/80 border-orange-100'
                        : 'bg-gray-50/80 border-gray-100'
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-gray-900">{formatFieldName(item.field_name)}</span>
                        <span className={cn(
                          'text-[9px] px-1.5 py-0.5 rounded-full font-semibold',
                          isImport ? 'bg-purple-100 text-purple-700'
                            : isSupplierApproved ? 'bg-green-100 text-green-700'
                            : isSupplierRejected ? 'bg-red-100 text-red-700'
                            : isSupplierSource ? 'bg-orange-100 text-orange-700'
                            : 'bg-blue-100 text-blue-700'
                        )}>
                          {item.source || 'Sourcelab'}
                        </span>
                      </div>
                      <span className="text-[10px] text-gray-400">{timeAgo}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs mt-1">
                      <span className="line-through text-gray-400 bg-gray-100/80 px-1 py-0.5 rounded text-[11px]">{item.old_value || 'Empty'}</span>
                      <ArrowRight className="w-3 h-3 text-gray-300 flex-shrink-0" />
                      <span className={cn(
                        'font-semibold px-1 py-0.5 rounded text-[11px]',
                        isSupplierRejected ? 'line-through bg-red-100/60' : 'bg-primary-50/80'
                      )}>{item.new_value || 'Empty'}</span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">
                      by <span className="font-medium text-gray-500">{item.username}</span>
                      {item.approved_by && !isSupplierRejected && <span className="text-green-600"> · Approved by {item.approved_by}</span>}
                      {item.approved_by && isSupplierRejected && <span className="text-red-500"> · Rejected by {item.approved_by}</span>}
                    </p>
                    {item.rejection_reason && (
                      <div className="mt-1.5 px-2 py-1.5 bg-red-100/80 border border-red-200 rounded text-[10px] text-red-700">
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
        <form onSubmit={handleSubmit} className="pt-3 border-t border-gray-100 mt-2">
          <label className="flex items-center gap-2 mb-2 text-[10px] text-gray-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={addToAllOnPO}
              onChange={(e) => setAddToAllOnPO(e.target.checked)}
              className="rounded text-primary-600 w-3 h-3 border-gray-300"
            />
            Add to all styles on this PO
          </label>
          <div className="flex gap-2 items-end">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment..."
              rows={2}
              className="flex-1 px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 placeholder:text-gray-300 bg-white resize-none"
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
              className="px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-all disabled:opacity-40"
            >
              {isSubmitting ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
