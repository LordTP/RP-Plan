'use client';

import { useRef, useState, useEffect, type RefObject } from 'react';
import { MessageSquare, ChevronDown, ChevronUp, Rows3, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useStore } from '@/store/useStore';
import { ordersApi, statusesApi, settingsApi, approvalsApi, getErrorMessage, ColumnSetting } from '@/lib/api';
import { cn, getStatusColor } from '@/lib/utils';
import { EditableCell } from './EditableCell';
import type { ColumnDef, Order } from '@/types';
import { COLUMNS, DASHBOARD_COLUMNS, TRACKING_REF_COLUMN } from '@/types';

// Size reference mapping - matches Excel rows 2-14
const SIZE_REFERENCE = [
  { gender: '001-MENS/ ADULTS', sizes: ['2XS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '', '', '', ''] },
  { gender: '002-LADIES', sizes: ['6', '8', '10', '12', '14', '16', '18', '20', '22', '24', '', '', '', ''] },
  { gender: '003-KIDS LETTER', sizes: ['XSB', 'SB', 'MB', 'LB', 'XLB', '', '', '', '', '', '', '', '', ''] },
  { gender: '004-KIDS', sizes: ['2-3', '4-5', '6-7', '8-9', '10-11', '12-13', '14-15', '', '', '', '', '', '', ''] },
  { gender: '005-KIDS ALT 1', sizes: ['2-3', '3-4', '5-6', '7-8', '9-10', '11-12', '13', '', '', '', '', '', '', ''] },
  { gender: '006-LADIES LETTER', sizes: ['2XS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '', '', '', '', '', ''] },
  { gender: '007-KIDS ALT 2', sizes: ['3-4', '4-5', '6-7', '8-9', '10-11', '12-13', '', '', '', '', '', '', '', ''] },
  { gender: '008-BABY', sizes: ['0-3M', '3-6M', '6-9M', '9-12M', '12-18M', '18-24M/ 18-23M', '', '', '', '', '', '', '', ''] },
  { gender: '009-ACCESSORIES/ HEADWEAR', sizes: ['ONE SIZE', 'BABY', 'JUNIOR', 'ADULT', '6-12 M', '1-3 YRS', 'INFANT', '', '', '', '', '', '', ''] },
  { gender: '010-MENS FOOTWEAR', sizes: ['3-6', '7-11', '7-8', '9-10', '11-12', '', '', '', '', '', '', '', '', ''] },
  { gender: '011-KIDS FOOTWEAR', sizes: ['10-11', '12-13', '1-2', '3-4', '5-6', '', '', '', '', '', '', '', '', ''] },
  { gender: '012-DOG', sizes: ['XS', 'S', 'M', 'L', 'XL', 'S/M', 'M/L', '', '', '', '', '', '', ''] },
  { gender: '013-LADIES DUAL', sizes: ['8-10', '12-14', '16-18', '20-22', '', '', '', '', '', '', '', '', '', ''] },
  { gender: '014-KIDS DRY ROBE', sizes: ['5-9 YRS', '10-13YRS', '', '', '', '', '', '', '', '', '', '', '', ''] },
  { gender: '015- KIDS 3-15', sizes: ['3/4', '4/5', '5/6', '6/7', '7/8', '8/9', '9/10', '10/11', '11/12', '12/13', '13/14', '14/15', '', ''] },
  { gender: '016- KIDS 1-14', sizes: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14'] },
];

interface OrderTableProps {
  orders: Order[];
  isDashboard?: boolean;
  onOrderUpdate?: (order: Order) => void;
  highlightMode?: boolean;
  changedFields?: Record<string, string[]>;
  showTrackingRef?: boolean;
  onShippedStatusRequest?: (order: Order) => void;
  scrollSentinelRef?: RefObject<HTMLDivElement | null>;
  isLoadingMore?: boolean;
  columnKeys?: string[];  // If provided, only show these columns (in this order)
}

export function OrderTable({ orders, isDashboard = false, onOrderUpdate, highlightMode = false, changedFields, showTrackingRef = false, onShippedStatusRequest, scrollSentinelRef, isLoadingMore = false, columnKeys }: OrderTableProps) {
  const { user, setSelectedOrder, updateOrderInList } = useStore();
  const tableRef = useRef<HTMLDivElement>(null);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [statusDropdownOrder, setStatusDropdownOrder] = useState<number | null>(null);
  const [bulkStatusUpdate, setBulkStatusUpdate] = useState(false);
  const [supplierColumnSettings, setSupplierColumnSettings] = useState<ColumnSetting[]>([]);
  const [showSizeReference, setShowSizeReference] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<Record<number, Record<string, {
    current_value: string | null;
    proposed_value: string | null;
    reason: string;
    submitted_by: string;
    submitted_at: string | null;
  }>>>({});

  const isSupplier = user?.role === 'supplier';
  const isInternal = user?.role === 'internal' || user?.role === 'admin';

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

  // Load supplier column settings
  useEffect(() => {
    if (isSupplier) {
      settingsApi.getRoleColumns('supplier')
        .then(res => setSupplierColumnSettings(res.columns))
        .catch(console.error);
    }
  }, [isSupplier]);

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

  // Get editable status for supplier
  const isSupplierEditable = (columnKey: string): boolean => {
    if (!isSupplier) return false;
    if (supplierColumnSettings.length > 0) {
      const setting = supplierColumnSettings.find((s) => s.column_key === columnKey);
      return setting?.is_editable ?? false;
    }
    // Fallback to hardcoded defaults
    const col = COLUMNS.find((c) => c.key === columnKey);
    return col?.supplierEditable ?? false;
  };

  const visibleColumns = getVisibleColumns();

  // Compute sticky left offsets for pinned columns
  // Comment icon (32px) sticks at left:0, po_number at 32, style_code at 32+po_width
  const COMMENT_COL_WIDTH = 32;
  const STICKY_COLUMNS = ['po_number', 'style_code'] as const;
  const stickyLeftMap: Record<string, number> = {};
  {
    const poCol = visibleColumns.find(c => c.key === 'po_number');
    stickyLeftMap['po_number'] = COMMENT_COL_WIDTH;
    stickyLeftMap['style_code'] = COMMENT_COL_WIDTH + (poCol ? poCol.width : 0);
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
        // Refresh would be needed here
        window.location.reload();
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
  const totalWidth = COMMENT_COL_WIDTH + visibleColumns.reduce((sum, col) => sum + col.width, 0);

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
              {/* Comment column - first, sticky */}
              <th
                rowSpan={showSizeReference ? headerRowCount : 1}
                className="px-0.5 py-1 text-center border border-gray-300 bg-gray-100 align-top"
                style={{ position: 'sticky', left: 0, zIndex: 30, width: COMMENT_COL_WIDTH, minWidth: COMMENT_COL_WIDTH }}
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
                    {column.label}
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
                  colSpan={visibleColumns.length + 1}
                  className="px-3 py-8 text-center text-gray-400 text-xs"
                >
                  No orders found
                </td>
              </tr>
            ) : (
              orders.map((order) => {
                const orderChangedFields = changedFields?.[String(order.id)] || [];

                return (
                <tr
                  key={order.id}
                  className={cn(
                    "table-row border-b border-gray-100 hover:bg-gray-50",
                    orderChangedFields.length > 0 && "!bg-green-50",
                    order.unread_comment_count && order.unread_comment_count > 0 && "!border-l-2 !border-l-primary-400"
                  )}
                >
                  {/* Comment cell - first, sticky */}
                  <td
                    className="px-0.5 py-1 text-center border border-gray-100 bg-white"
                    style={{ position: 'sticky', left: 0, zIndex: 10, width: COMMENT_COL_WIDTH, minWidth: COMMENT_COL_WIDTH }}
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
                        isSupplierEditable(column.key) && "bg-green-50 border-green-200/60",
                        isCellChanged && "!bg-emerald-200 !border-emerald-400",
                        isStickyCol && !isCellChanged && !isSupplierEditable(column.key) && "bg-white",
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
                        <div className="px-1 py-1 truncate text-[10px]">
                          {formatCellValue(order[column.key as keyof Order], column)}
                        </div>
                      ) : (
                        <EditableCell
                          value={order[column.key as keyof Order]}
                          column={column}
                          order={order}
                          isEditable={column.editable}
                          isSupplierEditable={isSupplierEditable(column.key)}
                          userRole={user?.role || 'supplier'}
                          onSave={handleSave}
                          onBulkSave={() => {
                            toast.success('Bulk update successful');
                            window.location.reload();
                          }}
                          isChanged={changedFields?.[String(order.id)]?.includes(column.key) || false}
                          pendingChange={pendingChanges[order.id]?.[column.key]}
                        />
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
        {/* Infinite scroll sentinel */}
        {scrollSentinelRef && <div ref={scrollSentinelRef as React.RefObject<HTMLDivElement>} className="h-1" />}
        {isLoadingMore && (
          <div className="flex items-center justify-center py-3">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            <span className="ml-2 text-sm text-gray-500">Loading more...</span>
          </div>
        )}
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
