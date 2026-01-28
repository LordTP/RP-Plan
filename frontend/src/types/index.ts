export interface User {
  id: number;
  username: string;
  email: string;
  role: 'admin' | 'internal' | 'supplier';
  factory_name?: string;
  is_active: boolean;
  last_login?: string;
}

export interface Order {
  id: number;
  // Core PO identifiers
  po_number: string;
  system_po_number?: string;
  is_active?: boolean;
  customer?: string;
  china_orderbook_ref?: string;
  customer_po_number?: string;
  season?: string;
  factory?: string;
  terms?: string;
  sales_person?: string;
  // Product details
  style_code?: string;
  customer_style_code?: string;
  description?: string;
  colour?: string;
  gender?: string;
  // Sizes
  size_2xs?: number;
  size_xs?: number;
  size_s?: number;
  size_m?: number;
  size_l?: number;
  size_xl?: number;
  size_2xl?: number;
  size_3xl?: number;
  size_4xl?: number;
  size_5xl?: number;
  // Financial
  total_quantity?: number;
  trade_price?: number;
  total_order_value?: number;
  // Dates
  order_received_date?: string | null;
  order_sent_to_factory_date?: string | null;
  original_po_ex_factory?: string | null;
  date_approved_to_production?: string | null;
  revised_po_ex_factory?: string | null;
  original_del_date_to_customer?: string | null;
  customer_po_open_month?: string;
  expected_dispatch_arrive_uk_month?: string;
  eta_to_uk?: string | null;
  actual_date_del_to_uk?: string | null;
  eta_to_customer?: string | null;
  actual_date_del_to_customer?: string | null;
  // Status
  status?: string;
  is_late?: boolean;
  // Shipping
  tracking_reference?: string;
  // Comments
  comment_count?: number;
  unread_comment_count?: number;
  // Metadata
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: number;
  order_id: number;
  user_id: number;
  username: string;
  comment_text: string;
  source: string;
  created_at: string;
}

export interface DateHistory {
  id: number;
  po_id: number;
  user_id: number;
  username: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  source: string;
  approved_by: string | null;
  rejection_reason: string | null;
  created_at: string;
}

export interface DashboardStats {
  total_orders: number;
  orders_in_production: number;
  orders_pending_approval: number;
  orders_shipped: number;
  orders_delivered: number;
  orders_cancelled: number;
  orders_on_hold: number;
  total_open_value: number;
  orders_this_month: number;
  overdue_orders: number;
}

export interface POSummary {
  po_number: string;
  customer: string;
  factory: string;
  line_count: number;
  total_qty: number;
  total_value: number;
  earliest_ex_factory: string | null;
  latest_update: string | null;
  status: string | null;
}

export interface PaginatedResponse<T> {
  total: number;
  page: number;
  page_size: number;
  orders: T[];
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

// Column definitions for the table
export interface ColumnDef {
  key: keyof Order;
  label: string;
  width: number;
  editable: boolean;
  supplierEditable: boolean;
  supplierHidden: boolean;
  type: 'text' | 'number' | 'date' | 'currency';
}

export const COLUMNS: ColumnDef[] = [
  // Core PO identifiers - matches Excel Sheet1 order
  { key: 'po_number', label: 'PO#', width: 80, editable: true, supplierEditable: false, supplierHidden: false, type: 'text' },
  { key: 'system_po_number', label: 'System PO#', width: 100, editable: true, supplierEditable: false, supplierHidden: true, type: 'text' },
  { key: 'customer', label: 'Customer', width: 150, editable: true, supplierEditable: false, supplierHidden: false, type: 'text' },
  { key: 'china_orderbook_ref', label: 'China Orderbook Ref', width: 160, editable: true, supplierEditable: false, supplierHidden: false, type: 'text' },
  { key: 'customer_po_number', label: 'Customer PO#', width: 100, editable: true, supplierEditable: false, supplierHidden: false, type: 'text' },
  { key: 'season', label: 'Season', width: 80, editable: true, supplierEditable: false, supplierHidden: false, type: 'text' },
  { key: 'factory', label: 'Factory', width: 120, editable: true, supplierEditable: false, supplierHidden: false, type: 'text' },
  { key: 'terms', label: 'Terms', width: 80, editable: true, supplierEditable: false, supplierHidden: false, type: 'text' },
  { key: 'sales_person', label: 'Sales Person', width: 100, editable: true, supplierEditable: false, supplierHidden: false, type: 'text' },
  { key: 'style_code', label: 'Style Code', width: 100, editable: true, supplierEditable: false, supplierHidden: false, type: 'text' },
  { key: 'customer_style_code', label: 'Cust Style Code', width: 110, editable: true, supplierEditable: false, supplierHidden: false, type: 'text' },
  { key: 'description', label: 'Description', width: 180, editable: true, supplierEditable: false, supplierHidden: false, type: 'text' },
  { key: 'colour', label: 'Colour', width: 80, editable: true, supplierEditable: false, supplierHidden: false, type: 'text' },
  { key: 'gender', label: 'Gender', width: 100, editable: true, supplierEditable: false, supplierHidden: false, type: 'text' },
  // Size columns
  { key: 'size_2xs', label: '2XS', width: 45, editable: true, supplierEditable: false, supplierHidden: false, type: 'number' },
  { key: 'size_xs', label: 'XS', width: 45, editable: true, supplierEditable: false, supplierHidden: false, type: 'number' },
  { key: 'size_s', label: 'S', width: 45, editable: true, supplierEditable: false, supplierHidden: false, type: 'number' },
  { key: 'size_m', label: 'M', width: 45, editable: true, supplierEditable: false, supplierHidden: false, type: 'number' },
  { key: 'size_l', label: 'L', width: 45, editable: true, supplierEditable: false, supplierHidden: false, type: 'number' },
  { key: 'size_xl', label: 'XL', width: 45, editable: true, supplierEditable: false, supplierHidden: false, type: 'number' },
  { key: 'size_2xl', label: '2XL', width: 45, editable: true, supplierEditable: false, supplierHidden: false, type: 'number' },
  { key: 'size_3xl', label: '3XL', width: 45, editable: true, supplierEditable: false, supplierHidden: false, type: 'number' },
  { key: 'size_4xl', label: '4XL', width: 45, editable: true, supplierEditable: false, supplierHidden: false, type: 'number' },
  { key: 'size_5xl', label: '5XL', width: 45, editable: true, supplierEditable: false, supplierHidden: false, type: 'number' },
  // Financial
  { key: 'total_quantity', label: 'Total', width: 60, editable: false, supplierEditable: false, supplierHidden: false, type: 'number' },
  { key: 'trade_price', label: 'Cost Price', width: 90, editable: true, supplierEditable: false, supplierHidden: true, type: 'currency' },
  { key: 'total_order_value', label: 'Order Value', width: 100, editable: false, supplierEditable: false, supplierHidden: true, type: 'currency' },
  // Dates
  { key: 'order_received_date', label: 'Order Received', width: 110, editable: true, supplierEditable: false, supplierHidden: true, type: 'date' },
  { key: 'order_sent_to_factory_date', label: 'Sent to Factory', width: 110, editable: true, supplierEditable: false, supplierHidden: false, type: 'date' },
  { key: 'original_po_ex_factory', label: 'Orig Ex-Factory', width: 110, editable: true, supplierEditable: false, supplierHidden: false, type: 'date' },
  { key: 'date_approved_to_production', label: 'Approved Prod', width: 110, editable: true, supplierEditable: true, supplierHidden: false, type: 'date' },
  { key: 'revised_po_ex_factory', label: 'Revised Ex-Fact', width: 110, editable: true, supplierEditable: true, supplierHidden: false, type: 'date' },
  { key: 'original_del_date_to_customer', label: 'Orig Del Cust', width: 110, editable: true, supplierEditable: false, supplierHidden: false, type: 'date' },
  { key: 'customer_po_open_month', label: 'PO Open Month', width: 100, editable: true, supplierEditable: false, supplierHidden: false, type: 'text' },
  { key: 'expected_dispatch_arrive_uk_month', label: 'Exp UK Month', width: 100, editable: true, supplierEditable: false, supplierHidden: false, type: 'text' },
  { key: 'eta_to_uk', label: 'ETA UK', width: 90, editable: true, supplierEditable: false, supplierHidden: false, type: 'date' },
  { key: 'actual_date_del_to_uk', label: 'Actual Del UK', width: 100, editable: true, supplierEditable: true, supplierHidden: false, type: 'date' },
  { key: 'eta_to_customer', label: 'ETA Customer', width: 100, editable: true, supplierEditable: false, supplierHidden: false, type: 'date' },
  { key: 'actual_date_del_to_customer', label: 'Actual Del Cust', width: 110, editable: true, supplierEditable: false, supplierHidden: true, type: 'date' },
  { key: 'status', label: 'Status', width: 110, editable: true, supplierEditable: false, supplierHidden: false, type: 'text' },
];

export const TRACKING_REF_COLUMN: ColumnDef = {
  key: 'tracking_reference' as keyof Order,
  label: 'Tracking Ref',
  width: 130,
  editable: true,
  supplierEditable: false,
  supplierHidden: true,
  type: 'text',
};

// Dashboard columns (subset for summary view)
export const DASHBOARD_COLUMNS: ColumnDef[] = [
  { key: 'po_number', label: 'PO#', width: 80, editable: false, supplierEditable: false, supplierHidden: false, type: 'text' },
  { key: 'customer', label: 'Customer', width: 150, editable: false, supplierEditable: false, supplierHidden: false, type: 'text' },
  { key: 'china_orderbook_ref', label: 'Orderbook Ref', width: 140, editable: false, supplierEditable: false, supplierHidden: false, type: 'text' },
  { key: 'style_code', label: 'Style Code', width: 100, editable: false, supplierEditable: false, supplierHidden: false, type: 'text' },
  { key: 'description', label: 'Description', width: 180, editable: false, supplierEditable: false, supplierHidden: false, type: 'text' },
  { key: 'total_quantity', label: 'Total', width: 60, editable: false, supplierEditable: false, supplierHidden: false, type: 'number' },
  { key: 'original_po_ex_factory', label: 'Ex-Factory', width: 100, editable: false, supplierEditable: false, supplierHidden: false, type: 'date' },
  { key: 'status', label: 'Status', width: 100, editable: false, supplierEditable: false, supplierHidden: false, type: 'text' },
  { key: 'factory', label: 'Factory', width: 100, editable: false, supplierEditable: false, supplierHidden: false, type: 'text' },
];
