'use client';

import { useRef, useState, useEffect, useMemo } from 'react';
import { MessageSquare, ChevronDown, ChevronUp, Rows3, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useStore } from '@/store/useStore';
import { ordersApi, statusesApi, settingsApi, approvalsApi, getErrorMessage, ColumnSetting } from '@/lib/api';
import { useSizeGuide } from '@/lib/useSizeGuide';
import { cn, getStatusColor } from '@/lib/utils';
import { EditableCell } from './EditableCell';
import { ColumnFilterDropdown } from './ColumnFilterDropdown';
import { ComponentSampleHover } from './ComponentSampleHover';
import { AttemptBadgeWithTooltip } from '@/components/samples/AttemptBadgeWithTooltip';
import { RejectSampleModal } from '@/components/samples/RejectSampleModal';
import { componentsForKind, type SampleKind } from '@/lib/sampleStatus';
import type { ColumnDef, Order } from '@/types';
import { COLUMNS, DASHBOARD_COLUMNS, TRACKING_REF_COLUMN, SAMPLE_STATUS_FIELD_TO_TYPE } from '@/types';
import type { SampleType } from '@/lib/api';

// Map per-component column keys to (kind, field) for the hover summary
// renderer. Only Strike Off and Lab Dip live on components — Fit Sample and
// PPS are order-level so they should NEVER show the multi-component "X/Y
// done" pill; they fall through to the plain EditableCell below.
const COMPONENT_COLUMN_MAP: Record<string, { kind: SampleKind; field: 'status' | 'received' | 'approved' }> = {
  strike_off_status: { kind: 'strike_off', field: 'status' },
  strike_off_received: { kind: 'strike_off', field: 'received' },
  strike_off_approved: { kind: 'strike_off', field: 'approved' },
  lab_dip_status: { kind: 'lab_dip', field: 'status' },
  lab_dip_received: { kind: 'lab_dip', field: 'received' },
  lab_dip_approved: { kind: 'lab_dip', field: 'approved' },
};

// Columns where the Excel-style header filter dropdown isn't useful:
// individual size buckets (numeric counts per size) would produce a wall
// of distinct integers without meaningful filter value.
const FILTER_DROPDOWN_BLOCKLIST = new Set<string>([
  'size_2xs', 'size_xs', 'size_s', 'size_m', 'size_l', 'size_xl',
  'size_2xl', 'size_3xl', 'size_4xl', 'size_5xl',
  'size_11', 'size_12', 'size_13', 'size_14',
]);

function isColumnFilterable(columnKey: string): boolean {
  return !FILTER_DROPDOWN_BLOCKLIST.has(columnKey);
}

// Pads / truncates a sizes array to exactly 14 slots for the reference grid,
// which has 14 size columns regardless of how many actual sizes a code uses.
const padSizes = (sizes: string[]): string[] => {
  const padded = [...sizes];
  while (padded.length < 14) padded.push('');
  return padded.slice(0, 14);
};

interface OrderTableProps {
  orders: Order[];
  isDashboard?: boolean;
  onOrderUpdate?: (order: Order) => void;
  highlightMode?: boolean;
  changedFields?: Record<string, string[]>;
  showTrackingRef?: boolean;
  onShippedStatusRequest?: (order: Order) => void;
  /** Called when the user scrolls near the end of the loaded rows.
   *  Parent should fetch the next page; the observer fires only when
   *  hasMore is true and isLoadingMore is false. */
  onReachEnd?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  columnKeys?: string[];  // If provided, only show these columns (in this order)
  /** Excel-style per-column filter state (snake_case field → selected values). */
  columnFilters?: Record<string, string[]>;
  /** Fires when the user applies a column filter via the header dropdown.
   *  Pass an empty values array to clear that column's filter. */
  onColumnFilterChange?: (column: string, values: string[]) => void;
  /** Active tab on /orders — passed to filter dropdowns so their distinct
   *  values only include rows on the current tab. Internal-only concept. */
  activeTab?: 'orders' | 'shipped';
  /** Refresh the current view in-place after a bulk save. Replaces the
   *  previous `window.location.reload()` — parent should re-fetch the
   *  current page WITHOUT flipping the loading spinner so this component
   *  stays mounted and scroll position is preserved. */
  onBulkSaveRefresh?: () => void;
}

export function OrderTable({ orders, isDashboard = false, onOrderUpdate, highlightMode = false, changedFields, showTrackingRef = false, onShippedStatusRequest, onReachEnd, hasMore = false, isLoadingMore = false, columnKeys, columnFilters, onColumnFilterChange, activeTab, onBulkSaveRefresh }: OrderTableProps) {
  const { user, setSelectedOrder, updateOrderInList, orders: storeOrders, totalOrders: storeTotal, setOrders: setStoreOrders } = useStore();
  const tableRef = useRef<HTMLDivElement>(null);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [statusDropdownOrder, setStatusDropdownOrder] = useState<number | null>(null);
  const [bulkStatusUpdate, setBulkStatusUpdate] = useState(false);
  const [supplierColumnSettings, setSupplierColumnSettings] = useState<ColumnSetting[]>([]);
  const [showSizeReference, setShowSizeReference] = useState(false);
  const { rows: sizeGuideRows } = useSizeGuide();
  // Build the reference grid from the DB-driven size guide. Active codes only,
  // padded to 14 size columns. Gender label format matches the historic
  // "001-MENS/ ADULTS" style used by orders.gender.
  const SIZE_REFERENCE = useMemo(() => (
    sizeGuideRows
      .filter(r => r.is_active)
      .map(r => ({ gender: `${r.code}-${r.label}`, sizes: padSizes(r.sizes) }))
  ), [sizeGuideRows]);
  const [pendingChanges, setPendingChanges] = useState<Record<number, Record<string, {
    current_value: string | null;
    proposed_value: string | null;
    reason: string;
    submitted_by: string;
    submitted_at: string | null;
  }>>>({});
  // Reject modal state — only used when REJECTED is picked on an order-level
  // sample status from the spreadsheet view.
  const [rejectModal, setRejectModal] = useState<{
    orderId: number;
    sampleType: SampleType;
    currentAttemptNo: number;
  } | null>(null);

  const isSupplier = user?.role === 'supplier';
  const isDesigner = user?.role === 'sourcelab_designer';
  const isInternal = user?.role === 'internal' || user?.role === 'admin';

  // Row selection (internal/admin only) — powers the checkbox column,
  // the floating action bar and the right-click delete menu.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [lastCheckedIndex, setLastCheckedIndex] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Order[] | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; orderId: number } | null>(null);
  const canBulkDelete = isInternal;

  useEffect(() => {
    if (!contextMenu) return;
    const onDown = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setContextMenu(null); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [contextMenu]);

  // Drag-to-scroll state
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
  const hasDragged = useRef(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    const el = tableRef.current;
    if (!el) return;
    // Only left-click, and not on interactive elements
    if (e.button !== 0) return;
    const tag = (e.target as HTMLElement).tagName;
    if (['INPUT', 'SELECT', 'BUTTON', 'TEXTAREA', 'A'].includes(tag)) return;

    isDragging.current = true;
    hasDragged.current = false;
    dragStart.current = { x: e.clientX, y: e.clientY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop };
    el.style.cursor = 'grabbing';
    el.style.userSelect = 'none';
  };

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        hasDragged.current = true;
      }
      el.scrollLeft = dragStart.current.scrollLeft - dx;
      el.scrollTop = dragStart.current.scrollTop - dy;
    };

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        el.style.cursor = 'grab';
        el.style.userSelect = '';
      }
    };

    // Suppress click events after dragging so cells don't accidentally open
    const handleClick = (e: MouseEvent) => {
      if (hasDragged.current) {
        e.stopPropagation();
        hasDragged.current = false;
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    el.addEventListener('click', handleClick, true);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      el.removeEventListener('click', handleClick, true);
    };
  }, []);

  // Get size column keys
  const sizeColumns = ['size_2xs', 'size_xs', 'size_s', 'size_m', 'size_l', 'size_xl', 'size_2xl', 'size_3xl', 'size_4xl', 'size_5xl', 'size_11', 'size_12', 'size_13', 'size_14'];

  // Load available statuses
  useEffect(() => {
    statusesApi.getStatuses().then(res => setStatuses(res.statuses)).catch(console.error);
  }, []);

  // Load supplier column settings (also load for factory views so admins see green highlights)
  const isFactoryView = !!columnKeys;
  useEffect(() => {
    if (isSupplier || isFactoryView) {
      settingsApi.getRoleColumns('supplier')
        .then(res => setSupplierColumnSettings(res.columns))
        .catch(console.error);
    }
  }, [isSupplier, isFactoryView]);

  // Infinite scroll: observer must be rooted on the inner scroll container
  // (overflow-auto on tableRef) — not the viewport — otherwise the sentinel
  // never enters intersection range as the user scrolls within the table,
  // which leaves the list stuck at the first page.
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!onReachEnd) return;
    const sentinel = sentinelRef.current;
    const root = tableRef.current;
    if (!sentinel || !root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          onReachEnd();
        }
      },
      // Vertical margin = pre-load trigger distance. Horizontal is inflated
      // to effectively infinity so the sentinel is always considered in-view
      // horizontally — otherwise scrolling right shifts the sentinel out of
      // the viewport and vertical scroll stops triggering the next page.
      { root, threshold: 0, rootMargin: '200px 9999px 200px 9999px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [onReachEnd, hasMore, isLoadingMore]);

  // Fetch pending changes for visible orders (single batch request)
  useEffect(() => {
    const fetchPendingChanges = async () => {
      try {
        const orderIds = orders.map(o => o.id);
        const result = await approvalsApi.getBatchPendingChanges(orderIds);
        const pendingMap: typeof pendingChanges = {};
        for (const [orderIdStr, changes] of Object.entries(result.pending_changes)) {
          const orderId = Number(orderIdStr);
          pendingMap[orderId] = {};
          for (const change of changes) {
            pendingMap[orderId][change.field_name] = {
              current_value: change.current_value,
              proposed_value: change.proposed_value,
              reason: change.reason,
              submitted_by: change.submitted_by,
              submitted_at: change.submitted_at,
            };
          }
        }
        setPendingChanges(pendingMap);
      } catch (error) {
        console.error('Failed to fetch pending changes:', error);
      }
    };

    if (orders.length > 0 && !isDashboard) {
      fetchPendingChanges();
    }
  }, [orders, isDashboard]);

  // Filter columns based on view type and user role
  const getVisibleColumns = (): ColumnDef[] => {
    let columns = isDashboard ? DASHBOARD_COLUMNS : COLUMNS;

    // If explicit column keys provided, filter and order by those
    if (columnKeys) {
      const colMap = new Map(COLUMNS.map(c => [c.key, c]));
      columns = columnKeys.map(k => colMap.get(k as keyof Order)).filter((c): c is ColumnDef => !!c);
      // Suppliers see a restricted slice — same hide-list as the Excel export.
      // Prefer DB-backed role-column settings; fall back to the static
      // supplierHidden flag if settings haven't loaded yet.
      if (isSupplier) {
        if (supplierColumnSettings.length > 0) {
          const visibleKeys = new Set(
            supplierColumnSettings.filter((s) => s.is_visible).map((s) => s.column_key)
          );
          columns = columns.filter((col) => visibleKeys.has(col.key as string));
        } else {
          columns = columns.filter((col) => !col.supplierHidden);
        }
      }
    } else if (isSupplier && supplierColumnSettings.length > 0) {
      // Use dynamic settings from database
      const visibleKeys = supplierColumnSettings
        .filter((s) => s.is_visible)
        .map((s) => s.column_key);
      columns = columns.filter((col) => visibleKeys.includes(col.key));
    } else if (isSupplier) {
      // Fallback to hardcoded defaults if settings not loaded yet
      columns = columns.filter((col) => !col.supplierHidden);
    }

    // Designers don't see pricing
    if (isDesigner) {
      columns = columns.filter((col) => col.key !== 'trade_price' && col.key !== 'total_order_value');
    }

    // Insert tracking reference column after status for shipped tab
    if (showTrackingRef && !isSupplier) {
      const statusIndex = columns.findIndex(c => c.key === 'status');
      if (statusIndex >= 0) {
        columns = [...columns.slice(0, statusIndex + 1), TRACKING_REF_COLUMN, ...columns.slice(statusIndex + 1)];
      } else {
        columns = [...columns, TRACKING_REF_COLUMN];
      }
    }

    return columns;
  };

  // Check if order has been sent to factory (all 3 dates filled)
  const isOrderSentToFactory = (order: Order): boolean => {
    return !!(order.order_sent_to_factory_date && order.tech_packs_sent_to_factory && order.specs_sent_to_factory);
  };

  // Get editable status for supplier (also applies to factory views for green highlighting)
  const isSupplierEditableCol = (columnKey: string): boolean => {
    if (!isSupplier && !isFactoryView) return false;
    if (supplierColumnSettings.length > 0) {
      const setting = supplierColumnSettings.find((s) => s.column_key === columnKey);
      return setting?.is_editable ?? false;
    }
    const col = COLUMNS.find((c) => c.key === columnKey);
    return col?.supplierEditable ?? false;
  };

  // Full check: column is supplier-editable AND order has been sent to factory
  const isSupplierEditable = (columnKey: string, order?: Order): boolean => {
    if (!isSupplierEditableCol(columnKey)) return false;
    if (isSupplier && order && !isOrderSentToFactory(order)) return false;
    return true;
  };

  const visibleColumns = getVisibleColumns();

  // Compute sticky left offsets for pinned columns.
  // Layout: [ select? | comment | po_number | style_code | rest... ]
  // Select column (28px) only renders when the user can bulk-delete
  // (internal/admin). Comment icon (32px) sticks after it.
  const SELECT_COL_WIDTH = 28;
  const COMMENT_COL_WIDTH = 32;
  const LEADING_STICKY_WIDTH = (canBulkDelete ? SELECT_COL_WIDTH : 0) + COMMENT_COL_WIDTH;
  const STICKY_COLUMNS = ['po_number', 'style_code'] as const;
  const stickyLeftMap: Record<string, number> = {};
  {
    const poCol = visibleColumns.find(c => c.key === 'po_number');
    stickyLeftMap['po_number'] = LEADING_STICKY_WIDTH;
    stickyLeftMap['style_code'] = LEADING_STICKY_WIDTH + (poCol ? poCol.width : 0);
  }
  const lastStickyKey = (() => {
    for (let i = visibleColumns.length - 1; i >= 0; i--) {
      if ((STICKY_COLUMNS as readonly string[]).includes(visibleColumns[i].key)) {
        return visibleColumns[i].key;
      }
    }
    return null;
  })();

  // Find indices for special columns (gender and sizes for the header reference rows)
  const genderColIndex = visibleColumns.findIndex(c => c.key === 'gender');
  const firstSizeColIndex = visibleColumns.findIndex(c => c.key === 'size_2xs');
  const lastSizeColIndex = visibleColumns.findIndex(c => c.key === 'size_14');
  const hasSizeColumns = firstSizeColIndex >= 0 && lastSizeColIndex >= 0 && genderColIndex >= 0;

  const handleSave = async (orderId: number, field: string, value: any, changeReason?: string) => {
    // Intercept REJECTED on a sample status field — open the reject modal so
    // we capture a structured reason/note, same flow as the V2 detail panel.
    // Orders with components route the user to V2 detail because the modal
    // can't know which component they meant to reject.
    const sampleType = SAMPLE_STATUS_FIELD_TO_TYPE[field];
    if (value === 'REJECTED' && sampleType) {
      const order = orders.find(o => o.id === orderId);
      if (order && (order.components?.length ?? 0) > 0) {
        toast.error('This order has components — open it in V2 detail to reject a specific component\'s sample');
        throw new Error('redirect_to_v2');
      }
      const prefix = field.replace('_status', '') as 'fit_sample' | 'strike_off' | 'lab_dip' | 'pps';
      const currentAttemptNo = (order as any)?.[`${prefix}_attempt_no`] ?? 1;
      setRejectModal({ orderId, sampleType: sampleType as SampleType, currentAttemptNo });
      // EditableCell expects the save to throw on cancel/redirect so it doesn't
      // optimistically update the cell. Returning silently here would leave
      // "REJECTED" stuck in the cell until refresh.
      throw new Error('redirect_to_modal');
    }

    try {
      const updateData: any = { [field]: value };
      if (changeReason) {
        updateData.change_reason = changeReason;
      }

      const result = await ordersApi.updateOrder(orderId, updateData);

      // Check if this was a pending approval response
      if (result && typeof result === 'object' && 'pending_approval' in result && result.pending_approval) {
        toast.success(result.message || 'Date change submitted for approval');
        // Refresh pending changes for this order
        try {
          const pendingResult = await approvalsApi.getOrderPendingChanges(orderId);
          if (pendingResult.pending_changes.length > 0) {
            const orderPending: Record<string, any> = {};
            for (const change of pendingResult.pending_changes) {
              orderPending[change.field_name] = {
                current_value: change.current_value,
                proposed_value: change.proposed_value,
                reason: change.reason,
                submitted_by: change.submitted_by,
                submitted_at: change.submitted_at,
              };
            }
            setPendingChanges(prev => ({ ...prev, [orderId]: orderPending }));
          }
        } catch (e) {
          console.error('Failed to refresh pending changes:', e);
        }
        return;
      }

      // Normal update response
      const updatedOrder = result as any;
      updateOrderInList(updatedOrder);
      onOrderUpdate?.(updatedOrder);
      toast.success('Updated successfully');
    } catch (error: any) {
      const message = getErrorMessage(error);
      toast.error(message);
      throw error;
    }
  };

  const handleStatusChange = async (order: Order, newStatus: string) => {
    // Intercept "Shipped" status - require tracking reference via modal
    if (newStatus === 'Shipped' && onShippedStatusRequest) {
      setStatusDropdownOrder(null);
      setBulkStatusUpdate(false);
      onShippedStatusRequest(order);
      return;
    }

    try {
      if (bulkStatusUpdate) {
        // Update all orders with same PO number
        const result = await ordersApi.bulkUpdateStatus(order.po_number, newStatus);
        toast.success(`Updated status for ${result.orders_updated} orders`);
        // Optimistically patch every order sharing this PO so the visible
        // rows flip immediately; parent's silent refresh confirms with
        // server truth. Same pattern as the EditableCell bulk save —
        // avoids the pre-Sep-2026 window.location.reload() jump-to-top.
        const storeOrders = useStore.getState().orders;
        for (const o of storeOrders) {
          if (o.po_number === order.po_number) {
            updateOrderInList({ ...o, status: newStatus });
          }
        }
        if (onBulkSaveRefresh) {
          onBulkSaveRefresh();
        } else {
          window.location.reload();
        }
      } else {
        await handleSave(order.id, 'status', newStatus);
      }
      setStatusDropdownOrder(null);
      setBulkStatusUpdate(false);
    } catch (error) {
      // Error already handled in handleSave
    }
  };

  const handleRowClick = (order: Order) => {
    setSelectedOrder(order);
    // Mark comments as read when opening and clear badge immediately
    if (order.unread_comment_count && order.unread_comment_count > 0) {
      updateOrderInList({ ...order, unread_comment_count: 0 });
    }
    ordersApi.markCommentsRead(order.id).catch(console.error);
  };

  // Calculate total table width (includes comment col at start)
  const totalWidth = (canBulkDelete ? SELECT_COL_WIDTH : 0) + COMMENT_COL_WIDTH + visibleColumns.reduce((sum, col) => sum + col.width, 0);

  // Total header rows = 1 main + 13 reference = 14 (only if we have size columns AND showing reference)
  const headerRowCount = (hasSizeColumns && showSizeReference) ? SIZE_REFERENCE.length + 1 : 1;

  return (
    <div className="card overflow-hidden flex flex-col h-full">
      {/* Toolbar with compact toggle */}
      {hasSizeColumns && !isDashboard && (
        <div className="flex items-center justify-end px-2 py-1 border-b border-gray-200 bg-gray-50">
          <button
            onClick={() => setShowSizeReference(!showSizeReference)}
            className={cn(
              "flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors",
              showSizeReference
                ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                : "bg-gray-200 text-gray-600 hover:bg-gray-300"
            )}
            title={showSizeReference ? "Hide size reference guide" : "Show size reference guide"}
          >
            <Rows3 className="w-3.5 h-3.5" />
            {showSizeReference ? "Hide Size Guide" : "Show Size Guide"}
            {showSizeReference ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
      )}
      <div ref={tableRef} className="overflow-auto flex-1 cursor-grab" onMouseDown={handleMouseDown}>
        <table
          className="w-full border-separate border-spacing-0 text-xs"
          style={{ minWidth: `${totalWidth}px` }}
        >
          <thead className="sticky top-0 z-20">
            {/* Row 1: Main headers */}
            <tr className="bg-gray-100">
              {/* Select column — first, sticky. Only for internal/admin. */}
              {canBulkDelete && (
                <th
                  rowSpan={showSizeReference ? headerRowCount : 1}
                  className="px-0 py-1 text-center border border-gray-300 bg-gray-100 align-top"
                  style={{ position: 'sticky', left: 0, zIndex: 30, width: SELECT_COL_WIDTH, minWidth: SELECT_COL_WIDTH }}
                >
                  <input
                    type="checkbox"
                    className="w-3.5 h-3.5 accent-violet-600 cursor-pointer align-middle"
                    checked={orders.length > 0 && orders.every(o => selectedIds.has(o.id))}
                    ref={(el) => {
                      if (!el) return;
                      const some = orders.some(o => selectedIds.has(o.id));
                      const all = orders.length > 0 && orders.every(o => selectedIds.has(o.id));
                      el.indeterminate = some && !all;
                    }}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedIds(new Set(orders.map(o => o.id)));
                      else setSelectedIds(new Set());
                    }}
                    title="Select all visible"
                  />
                </th>
              )}
              {/* Comment column - sticky after select */}
              <th
                rowSpan={showSizeReference ? headerRowCount : 1}
                className="px-0.5 py-1 text-center border border-gray-300 bg-gray-100 align-top"
                style={{ position: 'sticky', left: canBulkDelete ? SELECT_COL_WIDTH : 0, zIndex: 30, width: COMMENT_COL_WIDTH, minWidth: COMMENT_COL_WIDTH }}
              >
                <MessageSquare className="w-3 h-3 mx-auto text-gray-400" />
              </th>
              {visibleColumns.map((column) => {
                const isSizeCol = sizeColumns.includes(column.key);
                const isFirstSizeCol = column.key === 'size_2xs';
                const isGenderCol = column.key === 'gender';
                const showingReference = hasSizeColumns && showSizeReference;

                // Gender column - spans rows only when NOT showing reference (compact mode)
                if (isGenderCol && hasSizeColumns) {
                  return (
                    <th
                      key={column.key}
                      className="px-1 py-1 text-left border border-gray-300 font-semibold bg-amber-100 whitespace-nowrap"
                      style={{ minWidth: column.width }}
                    >
                      GENDER
                    </th>
                  );
                }

                // First size column - merged header when showing reference, individual when compact
                if (isFirstSizeCol && hasSizeColumns) {
                  if (showingReference) {
                    return (
                      <th
                        key="size-range-header"
                        colSpan={14}
                        className="px-1 py-1 text-center border border-gray-300 font-semibold bg-blue-100"
                      >
                        SIZE RANGE & QTY
                      </th>
                    );
                  } else {
                    // Compact mode - merged "SIZE QTYS" header
                    return (
                      <th
                        key="size-range-header-compact"
                        colSpan={14}
                        className="px-1 py-1 text-center border border-gray-300 font-semibold bg-blue-100"
                      >
                        SIZE QTYS
                      </th>
                    );
                  }
                }

                // Other size columns - skip (covered by colSpan in both modes)
                if (isSizeCol && !isFirstSizeCol && hasSizeColumns) {
                  return null;
                }

                // Regular columns (not gender, not size) - span all reference rows
                const isSticky = column.key in stickyLeftMap;
                const isLastSticky = column.key === lastStickyKey;
                return (
                  <th
                    key={column.key}
                    rowSpan={showingReference ? headerRowCount : 1}
                    className={cn(
                      "px-1 py-1 text-left border border-gray-300 font-semibold whitespace-nowrap align-top",
                      "bg-gray-100",
                      isLastSticky && "sticky-shadow"
                    )}
                    style={{
                      minWidth: column.width,
                      ...(isSticky && {
                        position: 'sticky',
                        left: stickyLeftMap[column.key],
                        zIndex: 30,
                      }),
                    }}
                  >
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="truncate flex-1">{column.label}</span>
                      {onColumnFilterChange && isColumnFilterable(column.key as string) && (
                        <ColumnFilterDropdown
                          column={column.key as string}
                          label={column.label}
                          selected={columnFilters?.[column.key as string] || []}
                          allFilters={columnFilters || {}}
                          tab={activeTab}
                          onApply={(vals) => onColumnFilterChange(column.key as string, vals)}
                        />
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>

            {/* Size reference mapping - only show when expanded */}
            {/* Each row shows cells only for gender and size columns (other columns have rowSpan from header) */}
            {hasSizeColumns && showSizeReference && SIZE_REFERENCE.map((ref) => (
              <tr key={ref.gender} className="bg-gray-50 text-[8px]">
                {visibleColumns.map((column) => {
                  // Gender column - output gender code
                  if (column.key === 'gender') {
                    return (
                      <td key={column.key} className="px-1 py-0.5 border border-gray-200 bg-amber-50 font-medium whitespace-nowrap">
                        {ref.gender}
                      </td>
                    );
                  }

                  // Size columns - output the corresponding size label
                  const sizeIndex = sizeColumns.indexOf(column.key);
                  if (sizeIndex >= 0) {
                    return (
                      <td key={column.key} className="px-1 py-0.5 text-center border border-gray-200 bg-blue-50">
                        {ref.sizes[sizeIndex] || ''}
                      </td>
                    );
                  }

                  // Other columns have rowSpan from header - don't output a cell
                  return null;
                })}
              </tr>
            ))}

          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleColumns.length + 1 + (canBulkDelete ? 1 : 0)}
                  className="px-3 py-8 text-center text-gray-400 text-xs"
                >
                  No orders found
                </td>
              </tr>
            ) : (
              orders.map((order, rowIndex) => {
                const orderChangedFields = changedFields?.[String(order.id)] || [];
                const isSelected = selectedIds.has(order.id);

                return (
                <tr
                  key={order.id}
                  onContextMenu={canBulkDelete ? (e) => {
                    e.preventDefault();
                    if (!selectedIds.has(order.id)) setSelectedIds(new Set([order.id]));
                    setContextMenu({ x: e.clientX, y: e.clientY, orderId: order.id });
                  } : undefined}
                  className={cn(
                    "table-row border-b border-gray-100 hover:bg-gray-50",
                    isSelected && "!bg-violet-50 hover:!bg-violet-100",
                    orderChangedFields.length > 0 && !isSelected && "!bg-green-50",
                    order.unread_comment_count && order.unread_comment_count > 0 && "!border-l-2 !border-l-primary-400"
                  )}
                >
                  {/* Select cell — first, sticky. Only when canBulkDelete. */}
                  {canBulkDelete && (
                    <td
                      className={cn("px-0 py-1 text-center border border-gray-100", isSelected ? "bg-violet-50" : "bg-white")}
                      style={{ position: 'sticky', left: 0, zIndex: 10, width: SELECT_COL_WIDTH, minWidth: SELECT_COL_WIDTH }}
                    >
                      <input
                        type="checkbox"
                        className="w-3.5 h-3.5 accent-violet-600 cursor-pointer align-middle"
                        checked={isSelected}
                        onChange={() => { /* handled in onClick to catch shiftKey */ }}
                        onClick={(e) => {
                          e.stopPropagation();
                          const shift = (e.nativeEvent as MouseEvent).shiftKey;
                          if (shift && lastCheckedIndex !== null) {
                            const [from, to] = lastCheckedIndex <= rowIndex ? [lastCheckedIndex, rowIndex] : [rowIndex, lastCheckedIndex];
                            const range = orders.slice(from, to + 1).map(o => o.id);
                            setSelectedIds(prev => {
                              const next = new Set(prev);
                              range.forEach(id => next.add(id));
                              return next;
                            });
                          } else {
                            setSelectedIds(prev => {
                              const next = new Set(prev);
                              if (next.has(order.id)) next.delete(order.id);
                              else next.add(order.id);
                              return next;
                            });
                          }
                          setLastCheckedIndex(rowIndex);
                        }}
                      />
                    </td>
                  )}
                  {/* Comment cell - sticky after select */}
                  <td
                    className={cn("px-0.5 py-1 text-center border border-gray-100", isSelected ? "bg-violet-50" : "bg-white")}
                    style={{ position: 'sticky', left: canBulkDelete ? SELECT_COL_WIDTH : 0, zIndex: 10, width: COMMENT_COL_WIDTH, minWidth: COMMENT_COL_WIDTH }}
                  >
                    <button
                      onClick={() => handleRowClick(order)}
                      className={cn(
                        "p-1 rounded transition-colors relative mx-auto block",
                        order.unread_comment_count && order.unread_comment_count > 0
                          ? "text-primary-600 bg-primary-50 hover:bg-primary-100"
                          : order.comment_count && order.comment_count > 0
                          ? "text-gray-500 hover:text-primary-600 hover:bg-primary-50"
                          : "text-gray-300 hover:text-gray-500 hover:bg-gray-50"
                      )}
                      title={order.unread_comment_count ? `${order.unread_comment_count} unread` : order.comment_count ? `${order.comment_count} comments` : 'Add comment'}
                    >
                      {order.comment_count && order.comment_count > 0 ? (
                        <MessageSquare className="w-3.5 h-3.5 fill-current" />
                      ) : (
                        <MessageSquare className="w-3.5 h-3.5" />
                      )}
                      {order.unread_comment_count && order.unread_comment_count > 0 ? (
                        <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 bg-primary-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center shadow-sm">
                          {order.unread_comment_count}
                        </span>
                      ) : order.comment_count && order.comment_count > 0 ? (
                        <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 bg-gray-400 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                          {order.comment_count}
                        </span>
                      ) : null}
                    </button>
                  </td>
                  {visibleColumns.map((column) => {
                    const isCellChanged = orderChangedFields.includes(column.key);

                    const isStickyCol = column.key in stickyLeftMap;
                    const isLastStickyCol = column.key === lastStickyKey;
                    return (
                    <td
                      key={column.key}
                      className={cn(
                        "border border-gray-100",
                        sizeColumns.includes(column.key) && "bg-blue-50/30",
                        column.key === 'gender' && "bg-amber-50/30",
                        isSupplierEditable(column.key, order) && "bg-green-50 border-green-200/60",
                        isCellChanged && "!bg-emerald-200 !border-emerald-400",
                        isStickyCol && !isCellChanged && !isSupplierEditable(column.key, order) && "bg-white",
                        isLastStickyCol && "sticky-shadow"
                      )}
                      style={{
                        minWidth: column.width,
                        ...(isStickyCol && {
                          position: 'sticky',
                          left: stickyLeftMap[column.key],
                          zIndex: 10,
                        }),
                      }}
                    >
                      {column.key === 'status' ? (
                        // Status dropdown
                        <div className="relative px-1 py-1">
                          <button
                            onClick={() => setStatusDropdownOrder(statusDropdownOrder === order.id ? null : order.id)}
                            className={cn(
                              'px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1',
                              getStatusColor(order.status || '')
                            )}
                          >
                            {order.status || 'Set Status'}
                            <ChevronDown className="w-3 h-3" />
                          </button>
                          {statusDropdownOrder === order.id && (
                            <div className="absolute z-20 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[160px]">
                              <label className="flex items-center gap-2 px-3 py-1 text-[10px] border-b border-gray-100 hover:bg-gray-50">
                                <input
                                  type="checkbox"
                                  checked={bulkStatusUpdate}
                                  onChange={(e) => setBulkStatusUpdate(e.target.checked)}
                                  className="rounded text-primary-600"
                                />
                                Update all on PO
                              </label>
                              {statuses.map((s) => (
                                <button
                                  key={s}
                                  onClick={() => handleStatusChange(order, s)}
                                  className={cn(
                                    "w-full text-left px-3 py-1 text-[10px] hover:bg-gray-100",
                                    order.status === s && "bg-primary-50 font-medium"
                                  )}
                                >
                                  {s}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : isDashboard ? (
                        <div className="px-1 py-1 truncate text-[10px] flex items-center gap-1">
                          <span className="truncate">{formatCellValue(order[column.key as keyof Order], column)}</span>
                          <AttemptBadgeWithTooltip order={order} columnKey={column.key as string} />
                        </div>
                      ) : COMPONENT_COLUMN_MAP[column.key] && order.components && componentsForKind(order.components, COMPONENT_COLUMN_MAP[column.key].kind).length > 0 ? (
                        // Only render the components rollup when there's at
                        // least one component of THIS column's sample type.
                        // Mixed lists (e.g. only lab-dip components but
                        // viewing a strike-off column) fall through to the
                        // plain EditableCell so the order-level field shows.
                        <div className="px-1 py-1 flex items-center gap-1">
                          <ComponentSampleHover
                            components={order.components}
                            kind={COMPONENT_COLUMN_MAP[column.key].kind}
                            field={COMPONENT_COLUMN_MAP[column.key].field}
                          />
                          <AttemptBadgeWithTooltip order={order} columnKey={column.key as string} />
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <div className="flex-1 min-w-0">
                            <EditableCell
                              value={order[column.key as keyof Order]}
                              column={column}
                              order={order}
                              isEditable={column.editable}
                              isSupplierEditable={isSupplierEditable(column.key, order)}
                              userRole={user?.role || 'supplier'}
                              onSave={handleSave}
                              onBulkSave={() => {
                                toast.success('Bulk update successful');
                                // Prior code called window.location.reload() here — a
                                // full browser refresh scrolled the table back to the
                                // top and reset the infinite-scroll page state. Now
                                // we ask the parent to re-fetch the current page in
                                // place; OrderTable stays mounted, tableRef's
                                // scrollTop is preserved, the user stays where they
                                // were. Falls back to reload only if the parent
                                // didn't provide the callback.
                                if (onBulkSaveRefresh) {
                                  onBulkSaveRefresh();
                                } else {
                                  window.location.reload();
                                }
                              }}
                              isChanged={changedFields?.[String(order.id)]?.includes(column.key) || false}
                              pendingChange={pendingChanges[order.id]?.[column.key]}
                            />
                          </div>
                          <AttemptBadgeWithTooltip order={order} columnKey={column.key as string} className="mr-1 flex-shrink-0" />
                        </div>
                      )}
                    </td>
                    );
                  })}

                </tr>
                );
              })
            )}
          </tbody>
        </table>
        {/* Infinite scroll sentinel — only used when the parent provided an
            onReachEnd callback. The sentinel sits inside the same scroll
            container the observer is rooted on. */}
        {onReachEnd && <div ref={sentinelRef} className="h-1" />}
        {isLoadingMore && (
          <div className="flex items-center justify-center py-3">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            <span className="ml-2 text-sm text-gray-500">Loading more...</span>
          </div>
        )}
      </div>

      {rejectModal && (() => {
        const order = orders.find(o => o.id === rejectModal.orderId);
        return (
          <RejectSampleModal
            orderId={rejectModal.orderId}
            componentId={null}
            componentName={null}
            sampleType={rejectModal.sampleType}
            currentAttemptNo={rejectModal.currentAttemptNo}
            onClose={() => setRejectModal(null)}
            onRejected={async () => {
              setRejectModal(null);
              try {
                const fresh = await ordersApi.getOrder(rejectModal.orderId);
                updateOrderInList(fresh);
                onOrderUpdate?.(fresh);
              } catch { /* the toast inside the modal already covered the success message */ }
            }}
          />
        );
      })()}

      {/* Floating action bar — appears when 1+ rows selected. */}
      {canBulkDelete && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-gray-900 text-white rounded-full shadow-2xl px-2 py-1.5 flex items-center gap-2 ring-1 ring-white/10">
          <span className="pl-3 pr-1 text-sm font-semibold">
            {selectedIds.size} selected
          </span>
          <span className="text-white/30">·</span>
          <button
            onClick={() => setDeleteConfirm(orders.filter(o => selectedIds.has(o.id)))}
            className="px-3 py-1.5 rounded-full text-xs font-semibold bg-red-500 hover:bg-red-600 flex items-center gap-1.5 transition-colors"
          >
            Delete
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="px-3 py-1.5 rounded-full text-xs font-medium bg-white/10 hover:bg-white/20 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Right-click context menu */}
      {contextMenu && canBulkDelete && (
        <div
          className="fixed z-50 bg-white rounded-lg shadow-xl ring-1 ring-gray-200 overflow-hidden text-sm"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              setContextMenu(null);
              setDeleteConfirm(orders.filter(o => selectedIds.has(o.id)));
            }}
            className="w-full text-left px-4 py-2 hover:bg-red-50 text-red-600 flex items-center gap-2"
          >
            Delete {selectedIds.size} row{selectedIds.size === 1 ? '' : 's'}
          </button>
          <button
            onClick={() => { setContextMenu(null); setSelectedIds(new Set()); }}
            className="w-full text-left px-4 py-2 hover:bg-gray-50 text-gray-700 border-t border-gray-100"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Delete confirmation modal — hard-deletes on confirm. */}
      {deleteConfirm && (
        <DeleteConfirmModal
          orders={deleteConfirm}
          onCancel={() => setDeleteConfirm(null)}
          onConfirm={async () => {
            const ids = deleteConfirm.map(o => o.id);
            setDeleteConfirm(null);
            try {
              const res = await ordersApi.bulkDelete(ids);
              setSelectedIds(new Set());
              toast.success(`Deleted ${res.deleted_count} ${res.deleted_count === 1 ? 'row' : 'rows'}`);
              // Filter deleted rows out of the store so they disappear
              // from the parent's list immediately.
              const idSet = new Set(ids);
              setStoreOrders(storeOrders.filter(o => !idSet.has(o.id)), Math.max(0, storeTotal - res.deleted_count));
            } catch (err: any) {
              toast.error(err?.response?.data?.detail || 'Delete failed');
            }
          }}
        />
      )}
    </div>
  );
}

function DeleteConfirmModal({ orders, onCancel, onConfirm }: {
  orders: Order[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-6" onClick={onCancel}>
      <div className="w-full max-w-md bg-white rounded-xl shadow-2xl ring-1 ring-gray-100 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
            <span className="text-red-600 font-bold text-lg">!</span>
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900">Delete {orders.length} order{orders.length === 1 ? '' : 's'}?</h3>
            <p className="text-xs text-red-600 font-medium">This cannot be undone.</p>
          </div>
        </div>
        <div className="px-5 py-3 max-h-64 overflow-y-auto text-xs">
          <ul className="divide-y divide-gray-100">
            {orders.slice(0, 40).map(o => (
              <li key={o.id} className="py-1.5 flex items-center gap-3">
                <span className="font-mono font-semibold text-gray-900 w-16 flex-shrink-0">{o.po_number}</span>
                <span className="font-mono text-gray-700 truncate">{o.style_code || `#${o.id}`}</span>
                <span className="text-gray-400 truncate ml-auto max-w-[160px]">{o.customer}</span>
              </li>
            ))}
            {orders.length > 40 && (
              <li className="py-2 text-center text-gray-400 italic">…and {orders.length - 40} more</li>
            )}
          </ul>
        </div>
        <div className="px-5 py-3 bg-gray-50/40 border-t border-gray-100 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={async () => { setBusy(true); await onConfirm(); }}
            disabled={busy}
            className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Delete {orders.length} order{orders.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatCellValue(value: any, column: ColumnDef): string {
  if (value === null || value === undefined) return '-';

  switch (column.type) {
    case 'date':
      if (!value) return '-';
      try {
        return new Date(value).toLocaleDateString('en-GB');
      } catch {
        return value;
      }
    case 'currency':
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(value);
    case 'number':
      return new Intl.NumberFormat('en-GB').format(value);
    default:
      return value.toString();
  }
}
