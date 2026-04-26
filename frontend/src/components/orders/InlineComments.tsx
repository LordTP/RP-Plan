'use client';

import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';
import type { Order } from '@/types';
import { CommentThread } from './comments/CommentThread';
import { HistoryPanel } from './comments/HistoryPanel';

interface InlineCommentsProps {
  order: Order;
  onCommentCountChange?: (orderId: number, commentCount: number, unreadCount: number) => void;
}

/**
 * Comments tab content inside the V2 detail modal. Renders the shared
 * CommentThread on the left; for non-supplier users, the history panel
 * sits alongside on the right at a fixed 340px column.
 */
export function InlineComments({ order, onCommentCountChange }: InlineCommentsProps) {
  const { user } = useStore();
  const canViewHistory = user?.role !== 'supplier';

  return (
    <div className={cn(
      'grid gap-4 h-full min-h-0',
      canViewHistory ? 'grid-cols-[1fr_340px]' : 'grid-cols-1'
    )}>
      <CommentThread
        orderId={order.id}
        poNumber={order.po_number}
        onCommentCountChange={onCommentCountChange}
      />
      {canViewHistory && <HistoryPanel orderId={order.id} />}
    </div>
  );
}
