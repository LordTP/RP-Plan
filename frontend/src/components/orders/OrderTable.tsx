'use client';

import { useRef, useState, useEffect } from 'react';
import { MessageSquare, ChevronDown, ChevronUp, Rows3 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useStore } from '@/store/useStore';
import { ordersApi, statusesApi, settingsApi, getErrorMessage, ColumnSetting } from '@/lib/api';
import { cn, getStatusColor } from '@/lib/utils';
import { EditableCell } from './EditableCell';
import type { ColumnDef, Order } from '@/types';
import { COLUMNS, DASHBOARD_COLUMNS } from '@/types';

// Size reference mapping - matches Excel rows 2-14
const SIZE_REFERENCE = [
  { gender: '001-MENS', sizes: ['2XS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'] },
  { gender: '002-LADIES', sizes: ['6', '8', '10', '12', '14', '16', '18', '20', '22', '24'] },
  { gender: '003-KIDS', sizes: ['XSB', 'SB', 'MB', 'LB', 'XLB', '', '', '', '', ''] },
  { gender: '004-KIDS', sizes: ['2-3', '4-5', '6-7', '8-9', '10-11', '12-13', '14-15', '', '', ''] },
  { gender: '005-KIDS', sizes: ['2-3', '3-4', '5-6', '7-8', '9-10', '11-12', '13', '', '', ''] },
  { gender: '006-LADIES LETTER', sizes: ['2XS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '', ''] },
  { gender: '007-KIDS', sizes: ['3-4', '4-5', '6-7', '8-9', '10-11', '12-13', '', '', '', ''] },
  { gender: '008-BABY', sizes: ['0-3', '3-6', '6-9', '9-12', '12-18', '18-24', '', '', '', ''] },
  { gender: '009-CAPS/HATS', sizes: ['ONE SIZE', 'BABY', 'JUNIOR', 'ADULT', '6-12 M', '1-3 YRS', 'INFANT', '', '', ''] },
  { gender: '010-MENS SHOES', sizes: ['3-6', '7-11', '', '', '', '', '', '', '', ''] },
  { gender: '011-BOYS SHOES', sizes: ['10-11', '1-2', '5-6', '', '', '', '', '', '', ''] },
  { gender: '012-DOG', sizes: ['XS', 'S', 'M', 'L', 'XL', '', '', '', '', ''] },
  { gender: '013-LEEDS KIDS', sizes: ['2-3', '3-4', '4-5', '5-6', '7-8', '9-10', '11-12', '13', '', ''] },
];

interface OrderTableProps {
  orders: Order[];
  isDashboard?: boolean;
  onOrderUpdate?: (order: Order) => void;
  highlightMode?: boolean;
  changedFields?: Record<string, string[]>;
}

export function OrderTable({ orders, isDashboard = false, onOrderUpdate, highlightMode = false, changedFields }: OrderTableProps) {
  const { user, setSelectedOrder, updateOrderInList } = useStore();
  const tableRef = useRef<HTMLDivElement>(null);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [statusDropdownOrder, setStatusDropdownOrder] = useState<number | null>(null);
  const [bulkStatusUpdate, setBulkStatusUpdate] = useState(false);
  const [supplierColumnSettings, setSupplierColumnSettings] = useState<ColumnSetting[]>([]);
  const [showSizeReference, setShowSizeReference] = useState(true);

  const isSupplier = user?.role === 'supplier';
  const isInternal = user?.role === 'internal' || user?.role === 'admin';

  // Get size column keys
  const sizeColumns = ['size_2xs', 'size_xs', 'size_s', 'size_m', 'size_l', 'size_xl', 'size_2xl', 'size_3xl', 'size_4xl', 'size_5xl'];

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

  // Filter columns based on view type and user role
  const getVisibleColumns = (): ColumnDef[] => {
    let columns = isDashboard ? DASHBOARD_COLUMNS : COLUMNS;

    if (isSupplier && supplierColumnSettings.length > 0) {
      // Use dynamic settings from database
      const visibleKeys = supplierColumnSettings
        .filter((s) => s.is_visible)
        .map((s) => s.column_key);
      columns = columns.filter((col) => visibleKeys.includes(col.key));
    } else if (isSupplier) {
      // Fallback to hardcoded defaults if settings not loaded yet
      columns = columns.filter((col) => !col.supplierHidden);
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

  // Find indices for special columns (gender and sizes for the header reference rows)
  const genderColIndex = visibleColumns.findIndex(c => c.key === 'gender');
  const firstSizeColIndex = visibleColumns.findIndex(c => c.key === 'size_2xs');
  const lastSizeColIndex = visibleColumns.findIndex(c => c.key === 'size_5xl');
  const hasSizeColumns = firstSizeColIndex >= 0 && lastSizeColIndex >= 0 && genderColIndex >= 0;

  const handleSave = async (orderId: number, field: string, value: any) => {
    try {
      const updatedOrder = await ordersApi.updateOrder(orderId, { [field]: value });
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
    // Mark comments as read when opening
    ordersApi.markCommentsRead(order.id).catch(console.error);
  };

  // Calculate total table width
  const totalWidth = visibleColumns.reduce((sum, col) => sum + col.width, 0) + 60;

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
      <div ref={tableRef} className="overflow-auto flex-1">
        <table
          className="w-full border-collapse text-xs"
          style={{ minWidth: `${totalWidth}px` }}
        >
          <thead className="sticky top-0 z-10">
            {/* Row 1: Main headers */}
            <tr className="bg-gray-100">
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
                        colSpan={10}
                        className="px-1 py-1 text-center border border-gray-300 font-semibold bg-blue-100"
                      >
                        SIZE RANGE & QTY
                      </th>
                    );
                  } else {
                    // Compact mode - show column numbers 1-10
                    return (
                      <th
                        key={column.key}
                        className="px-1 py-1 text-center border border-gray-300 font-semibold bg-blue-100 text-[10px]"
                        style={{ minWidth: column.width }}
                      >
                        1
                      </th>
                    );
                  }
                }

                // Other size columns - skip when showing reference (covered by colSpan), show numbers when compact
                if (isSizeCol && !isFirstSizeCol && hasSizeColumns) {
                  if (showingReference) {
                    return null;
                  } else {
                    // Compact mode - show column numbers
                    const sizeIndex = sizeColumns.indexOf(column.key) + 1;
                    return (
                      <th
                        key={column.key}
                        className="px-1 py-1 text-center border border-gray-300 font-semibold bg-blue-100 text-[10px]"
                        style={{ minWidth: column.width }}
                      >
                        {sizeIndex}
                      </th>
                    );
                  }
                }

                // Regular columns (not gender, not size) - span all reference rows
                return (
                  <th
                    key={column.key}
                    rowSpan={showingReference ? headerRowCount : 1}
                    className={cn(
                      "px-1 py-1 text-left border border-gray-300 font-semibold whitespace-nowrap align-top",
                      "bg-gray-100"
                    )}
                    style={{ minWidth: column.width }}
                  >
                    {column.label}
                  </th>
                );
              })}
              {/* Actions column */}
              <th rowSpan={showSizeReference ? headerRowCount : 1} className="px-1 py-1 text-center border border-gray-300 w-[50px] bg-gray-100 align-top">
                <MessageSquare className="w-3 h-3 mx-auto" />
              </th>
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
                  className="px-3 py-12 text-center text-gray-500"
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
                    orderChangedFields.length > 0 && "!bg-green-50"
                  )}
                >
                  {visibleColumns.map((column) => {
                    const isCellChanged = orderChangedFields.includes(column.key);

                    return (
                    <td
                      key={column.key}
                      className={cn(
                        "border border-gray-100",
                        sizeColumns.includes(column.key) && "bg-blue-50/30",
                        column.key === 'gender' && "bg-amber-50/30",
                        isCellChanged && "!bg-emerald-200 !border-emerald-400"
                      )}
                      style={{ minWidth: column.width }}
                    >
                      {column.key === 'status' ? (
                        // Status dropdown
                        <div className="relative px-1 py-1">
                          <button
                            onClick={() => setStatusDropdownOrder(statusDropdownOrder === order.id ? null : order.id)}
                            className={cn(
                              'px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1',
                              getStatusColor(order.status)
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
                        />
                      )}
                    </td>
                    );
                  })}

                  {/* Actions/Comments column */}
                  <td className="px-1 py-1 text-center border border-gray-100">
                    <button
                      onClick={() => handleRowClick(order)}
                      className={cn(
                        "p-1 rounded transition-colors relative",
                        order.unread_comment_count && order.unread_comment_count > 0
                          ? "text-red-600 bg-red-50 hover:bg-red-100"
                          : "text-gray-400 hover:text-primary-600 hover:bg-primary-50"
                      )}
                      title={order.unread_comment_count ? `${order.unread_comment_count} unread` : 'View comments'}
                    >
                      <MessageSquare className="w-3 h-3" />
                      {order.comment_count && order.comment_count > 0 && (
                        <span className={cn(
                          "absolute -top-1 -right-1 text-[8px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center",
                          order.unread_comment_count && order.unread_comment_count > 0
                            ? "bg-red-500 text-white"
                            : "bg-gray-300 text-gray-700"
                        )}>
                          {order.comment_count}
                        </span>
                      )}
                    </button>
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
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
      return new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: 'GBP',
      }).format(value);
    case 'number':
      return new Intl.NumberFormat('en-GB').format(value);
    default:
      return value.toString();
  }
}
