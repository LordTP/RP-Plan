'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare, Send, Loader2 } from 'lucide-react';
import { format, parseISO, formatDistanceToNow, isToday, isYesterday, startOfDay } from 'date-fns';
import toast from 'react-hot-toast';
import { useStore } from '@/store/useStore';
import { ordersApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Comment } from '@/types';
import { MentionTextarea } from '../MentionTextarea';
import { CommentText } from '../CommentText';
import { SeenByStack } from './SeenByStack';
import { avatarColour, avatarInitials } from '@/lib/avatar';

interface Props {
  orderId: number;
  poNumber: string;
  /** Notify parent of new (count, unread) so the order list / nav badges stay in sync. */
  onCommentCountChange?: (orderId: number, commentCount: number, unreadCount: number) => void;
  /** When true, renders inside a self-bounding card with its own header. Set
   *  this to false if the parent already provides the framing (e.g. a panel
   *  with its own H4). Default true. */
  framed?: boolean;
  /** Optional callback invoked after a successful comment add — used by the
   *  sidebar to bump the count on the row in the orders table. */
  onCommentAdded?: () => void;
}

/**
 * Card-style comment thread used in both the V2 detail modal (Comments tab)
 * and the slide-out sidebar from /orders. One source of truth so both
 * surfaces stay visually consistent.
 *
 * Each comment is its own bordered card with a header strip (avatar + name +
 * role + timestamp) and a body. Suppliers get an orange tint, internal users
 * stay neutral. Unread incoming comments get a 2px blue border + ring + NEW
 * pill until you scroll past them. Date dividers ("Today · 24 Apr") group
 * messages chronologically.
 */
export function CommentThread({
  orderId,
  poNumber,
  onCommentCountChange,
  framed = true,
  onCommentAdded,
}: Props) {
  const { user } = useStore();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [mentionedIds, setMentionedIds] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [addToAllOnPO, setAddToAllOnPO] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);

  const isSupplier = user?.role === 'supplier';

  // Keep the latest callbacks in refs so the load effect only re-runs when the
  // orderId actually changes. Inline callbacks from parents would otherwise
  // trigger an infinite loop: fetch → onCommentCountChange → parent re-renders
  // → new callback identity → effect re-fires → loading stuck.
  const onCommentCountChangeRef = useRef(onCommentCountChange);
  const onCommentAddedRef = useRef(onCommentAdded);
  useEffect(() => { onCommentCountChangeRef.current = onCommentCountChange; }, [onCommentCountChange]);
  useEffect(() => { onCommentAddedRef.current = onCommentAdded; }, [onCommentAdded]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    ordersApi.getOrderComments(orderId)
      .then((data) => {
        if (cancelled) return;
        setComments(data);
        onCommentCountChangeRef.current?.(orderId, data.length, 0);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setIsLoading(false); });
    // Mark all as read on open — the panel itself acts as the "I saw this" event.
    ordersApi.markCommentsRead(orderId).catch(() => {});
    return () => { cancelled = true; };
  }, [orderId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments.length]);

  const groupedByDay = useMemo(() => groupCommentsByDay(comments), [comments]);

  const handleSubmit = async () => {
    if (!newComment.trim() || !user) return;
    setIsSubmitting(true);
    try {
      if (addToAllOnPO && poNumber) {
        const res = await ordersApi.bulkAddComment(poNumber, newComment.trim(), mentionedIds);
        toast.success(`Comment added to ${res.comments_added} orders`);
        setAddToAllOnPO(false);
      } else {
        const source = user.role === 'supplier' ? 'supplier' : 'internal';
        await ordersApi.addOrderComment(orderId, newComment.trim(), source, mentionedIds);
        toast.success('Comment added');
      }
      setNewComment('');
      setMentionedIds([]);
      const fresh = await ordersApi.getOrderComments(orderId);
      setComments(fresh);
      onCommentCountChangeRef.current?.(orderId, fresh.length, 0);
      onCommentAddedRef.current?.();
    } catch {
      toast.error('Failed to add comment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inner = (
    <>
      {framed && (
        <div className="px-4 py-3 border-b border-gray-200 bg-white flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-blue-100 rounded-md flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <div className="text-sm font-bold text-gray-900">Comments</div>
              <div className="text-[10px] text-gray-500">
                {isLoading ? 'Loading…' : `${comments.length} message${comments.length === 1 ? '' : 's'}`}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-10 h-10 mx-auto bg-gray-100 rounded-full flex items-center justify-center mb-2">
              <MessageSquare className="w-5 h-5 text-gray-300" />
            </div>
            <p className="text-xs font-medium text-gray-500">No comments yet</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Start the thread below — type @ to mention someone.</p>
          </div>
        ) : (
          <>
            {groupedByDay.map((group) => (
              <div key={group.dayKey} className="space-y-2">
                <div className="flex items-center gap-3 my-1">
                  <div className="flex-1 h-px bg-gray-200" />
                  <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">{group.label}</div>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>
                {group.comments.map((c) => <CommentCard key={c.id} comment={c} />)}
              </div>
            ))}
            <div ref={endRef} />
          </>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-gray-200 bg-white px-4 py-3 flex-shrink-0">
        <MentionTextarea
          value={newComment}
          onChange={setNewComment}
          onMentionsChange={setMentionedIds}
          onSubmit={() => { if (newComment.trim() && !isSubmitting) handleSubmit(); }}
          onEnterSubmit
          placeholder="Write a message…  Type @ to mention someone"
          disabled={isSubmitting}
          rows={3}
          textareaClassName="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg bg-gray-50/40 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 focus:bg-white"
        />
        <div className="flex items-center justify-between mt-2">
          {!isSupplier ? (
            <label className="flex items-center gap-1.5 text-[11px] text-gray-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={addToAllOnPO}
                onChange={(e) => setAddToAllOnPO(e.target.checked)}
                className="w-3 h-3 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              Apply to all styles on PO
            </label>
          ) : <span />}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!newComment.trim() || isSubmitting}
            className={cn(
              'px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-colors',
              newComment.trim() && !isSubmitting
                ? 'bg-gray-900 text-white hover:bg-gray-800'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            )}
          >
            {isSubmitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <>
                Send
                <Send className="w-3 h-3" />
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );

  if (!framed) {
    return <div className="flex flex-col h-full min-h-0">{inner}</div>;
  }

  return (
    <div className="border border-gray-200 rounded-xl bg-gray-50/30 flex flex-col overflow-hidden h-full min-h-0">
      {inner}
    </div>
  );
}

function CommentCard({ comment }: { comment: Comment }) {
  const isSupplier = comment.source === 'Supplier' || comment.source === 'supplier';
  const isUnread = !comment.read;
  let timeAgo = '';
  let fullDate = '';
  try { timeAgo = formatDistanceToNow(parseISO(comment.created_at), { addSuffix: true }); } catch {}
  try { fullDate = format(parseISO(comment.created_at), 'd MMM · HH:mm'); } catch {}

  const cardClass = cn(
    'rounded-lg overflow-hidden transition-colors',
    isUnread && 'border-2 border-blue-300 ring-2 ring-blue-100/50',
    !isUnread && isSupplier && 'border border-orange-200',
    !isUnread && !isSupplier && 'border border-gray-200',
  );
  const headerClass = cn(
    'px-3 py-2 border-b flex items-center gap-2.5',
    isUnread ? 'bg-blue-50/60 border-blue-100' : isSupplier ? 'bg-orange-50/60 border-orange-100' : 'bg-gray-50/60 border-gray-100'
  );

  return (
    <div className={cardClass}>
      <div className={headerClass}>
        <div className={cn('w-6 h-6 rounded-full text-white text-[9px] font-semibold flex items-center justify-center flex-shrink-0', avatarColour(comment.username))}>
          {avatarInitials(comment.full_name || comment.username)}
        </div>
        <div className="flex-1 min-w-0 flex items-baseline gap-2 flex-wrap">
          <span className="text-xs font-semibold text-gray-900 truncate">{comment.full_name || comment.username}</span>
          <span className={cn('text-[10px] font-medium', isSupplier ? 'text-orange-700' : 'text-gray-500')}>
            {isSupplier ? 'Supplier' : 'Sourcelab'}
          </span>
          {isUnread && (
            <span className="text-[10px] px-1 py-0 rounded bg-blue-600 text-white font-bold">NEW</span>
          )}
        </div>
        <span className="text-[10px] text-gray-400 whitespace-nowrap" title={fullDate}>{timeAgo}</span>
      </div>
      <div className="px-3 py-2 text-[13px] text-gray-800 leading-relaxed bg-white whitespace-pre-wrap break-words">
        <CommentText text={comment.comment_text} />
      </div>
      {comment.read_by_users && comment.read_by_users.length > 0 && (
        <div className={cn(
          'px-3 py-1.5 border-t',
          isSupplier ? 'bg-orange-50/30 border-orange-100' : 'bg-gray-50/40 border-gray-100'
        )}>
          <SeenByStack readers={comment.read_by_users} />
        </div>
      )}
    </div>
  );
}

interface DayGroup { dayKey: string; label: string; comments: Comment[]; }

function groupCommentsByDay(comments: Comment[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const c of comments) {
    let date: Date;
    try { date = parseISO(c.created_at); } catch { continue; }
    const dayStart = startOfDay(date);
    const key = dayStart.toISOString();
    let group = groups.find(g => g.dayKey === key);
    if (!group) {
      const label = isToday(date) ? `Today · ${format(date, 'd MMM')}`
                  : isYesterday(date) ? `Yesterday · ${format(date, 'd MMM')}`
                  : format(date, 'EEEE · d MMM yyyy');
      group = { dayKey: key, label, comments: [] };
      groups.push(group);
    }
    group.comments.push(c);
  }
  return groups;
}
