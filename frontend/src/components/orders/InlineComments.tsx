'use client';

import { useState, useEffect, useRef } from 'react';
import { Send, MessageSquare, Clock, ArrowRight, Eye } from 'lucide-react';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import { useStore } from '@/store/useStore';
import { ordersApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Order, Comment, DateHistory } from '@/types';
import { MentionTextarea } from './MentionTextarea';
import { CommentText } from './CommentText';

interface InlineCommentsProps {
  order: Order;
  onCommentCountChange?: (orderId: number, commentCount: number, unreadCount: number) => void;
}

export function InlineComments({ order, onCommentCountChange }: InlineCommentsProps) {
  const { user } = useStore();
  const [comments, setComments] = useState<Comment[]>([]);
  const [history, setHistory] = useState<DateHistory[]>([]);
  const [activeTab, setActiveTab] = useState<'comments' | 'history'>('comments');
  const [newComment, setNewComment] = useState('');
  const [mentionedIds, setMentionedIds] = useState<number[]>([]);
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
      // Notify parent — all comments are now read since we just opened the panel
      const unreadCount = data.filter((c: Comment) => !c.read).length;
      onCommentCountChange?.(order.id, data.length, 0); // 0 unread since we mark as read on open
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
        const result = await ordersApi.bulkAddComment(order.po_number, newComment.trim(), mentionedIds);
        toast.success(`Comment added to ${result.comments_added} orders`);
        setAddToAllOnPO(false);
      } else {
        const source = user.role === 'supplier' ? 'supplier' : 'internal';
        await ordersApi.addOrderComment(order.id, newComment.trim(), source, mentionedIds);
        toast.success('Comment added');
      }
      setNewComment('');
      setMentionedIds([]);
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
      {/* Side-by-side layout: Comments left, History right */}
      <div className={cn('grid gap-6', canViewHistory ? 'grid-cols-[1fr_340px]' : 'grid-cols-1')}>
        {/* LEFT: Comments */}
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <MessageSquare className="w-3.5 h-3.5" />
            Comments
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-primary-100 text-primary-700">{comments.length}</span>
          </h4>
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
                let fullDate = '';
                try { timeAgo = formatDistanceToNow(parseISO(comment.created_at), { addSuffix: true }); } catch {}
                try { fullDate = format(parseISO(comment.created_at), 'dd/MM/yyyy HH:mm'); } catch {}
                const initials = comment.username.slice(0, 2).toUpperCase();

                return (
                  <div key={comment.id} className={cn('flex gap-3', !isSourcelab && 'flex-row-reverse')}>
                    {/* Avatar */}
                    <div className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shadow-md flex-shrink-0 mt-0.5',
                      isSourcelab
                        ? 'bg-gradient-to-br from-primary-400 to-primary-600 text-white ring-2 ring-primary-200/40'
                        : 'bg-gradient-to-br from-orange-400 to-orange-600 text-white ring-2 ring-orange-200/40'
                    )}>
                      {initials}
                    </div>

                    <div className={cn('flex-1 min-w-0 max-w-[80%]', !isSourcelab && 'flex flex-col items-end')}>
                      {/* Name + time */}
                      <div className={cn('flex items-center gap-2 mb-1', !isSourcelab && 'flex-row-reverse')}>
                        <span className="text-[11px] font-semibold text-gray-900">{comment.username}</span>
                        <span className={cn(
                          'text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider',
                          isSourcelab ? 'bg-primary-100 text-primary-600' : 'bg-orange-100 text-orange-600'
                        )}>
                          {isSourcelab ? 'SL' : 'Supplier'}
                        </span>
                        <span className="text-[10px] text-gray-400" title={fullDate}>{timeAgo}</span>
                      </div>

                      {/* Message bubble */}
                      <div className={cn(
                        'relative px-4 py-3 rounded-2xl shadow-sm',
                        isSourcelab
                          ? 'bg-white border border-gray-200/80 rounded-tl-md'
                          : 'bg-orange-50 border border-orange-200/60 rounded-tr-md',
                        isUnread && 'ring-2 ring-primary-300/50'
                      )}>
                        {isUnread && (
                          <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-primary-500 rounded-full ring-2 ring-white animate-pulse" />
                        )}
                        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                          <CommentText text={comment.comment_text} />
                        </p>
                      </div>

                      {/* Read receipts */}
                      {comment.read_by_users && comment.read_by_users.length > 0 && (
                        <ReadReceipts readers={comment.read_by_users} />
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={commentsEndRef} />
          </div>

          {/* Comment Input */}
          <form onSubmit={handleSubmit} className="pt-4 border-t border-gray-100 mt-2">
            <div className="relative">
              <MentionTextarea
                value={newComment}
                onChange={setNewComment}
                onMentionsChange={setMentionedIds}
                onSubmit={() => {
                  if (newComment.trim() && !isSubmitting) {
                    handleSubmit({ preventDefault: () => {} } as React.FormEvent);
                  }
                }}
                onEnterSubmit
                placeholder="Write a message... type @ to mention someone"
                disabled={isSubmitting}
                rows={3}
                textareaClassName="w-full px-4 py-3 pr-12 text-sm border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 placeholder:text-gray-400 bg-gray-50/60 resize-none"
              />
              <button
                type="submit"
                disabled={!newComment.trim() || isSubmitting}
                className="absolute right-2 bottom-2 p-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-all disabled:opacity-30 shadow-sm"
              >
                {isSubmitting ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
            <label className="flex items-center gap-2 mt-2 px-1 text-[10px] text-gray-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={addToAllOnPO}
                onChange={(e) => setAddToAllOnPO(e.target.checked)}
                className="rounded text-primary-600 w-3 h-3 border-gray-300"
              />
              Add to all styles on this PO
            </label>
          </form>
        </div>

        {/* RIGHT: History */}
        {canViewHistory && (
          <div className="border-l border-gray-100 pl-6">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" />
              History
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-gray-200/80 text-gray-500">{history.length}</span>
            </h4>
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
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
          </div>
        )}
      </div>
    </div>
  );
}

function ReadReceipts({ readers }: { readers: { username: string; full_name?: string | null; read_at: string }[] }) {
  const [showPopup, setShowPopup] = useState(false);

  return (
    <div className="relative ml-8 mt-1.5">
      <button
        onMouseEnter={() => setShowPopup(true)}
        onMouseLeave={() => setShowPopup(false)}
        className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
      >
        <Eye className="w-3 h-3" />
        <span>Seen by {readers.length}</span>
      </button>
      {showPopup && (
        <div className="absolute left-0 bottom-full mb-1 bg-gray-900 text-white rounded-lg px-3 py-2 shadow-lg z-50 min-w-[140px]">
          <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Read by</p>
          {readers.map((r, i) => (
            <div key={i} className="flex items-center justify-between gap-3 py-0.5">
              <span className="text-[11px] font-medium">{r.full_name || r.username}</span>
              <span className="text-[9px] text-gray-500">
                {(() => { try { return formatDistanceToNow(parseISO(r.read_at), { addSuffix: true }); } catch { return ''; } })()}
              </span>
            </div>
          ))}
          <div className="absolute left-4 top-full w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-gray-900" />
        </div>
      )}
    </div>
  );
}
