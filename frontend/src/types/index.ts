export interface User {
  id: number;
  username: string;
  email: string;
  full_name?: string | null;
  role: 'admin' | 'internal' | 'supplier' | 'sourcelab_designer';
  factory_name?: string;
  is_active: boolean;
  mentionable?: boolean;
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
  direct_repeat_new?: string;
  season?: string;
  factory?: string;
  terms?: string;
  sales_person?: string;
  // Product details
  style_code?: string;
  /** Auto-derived from style_code on the backend: everything BEFORE the
   *  first dash. e.g. "CP-1234-XL" → "CP". When there's no dash, this is
   *  just the whole style code. Read-only. */
  style_base?: string;
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
  size_11?: number;
  size_12?: number;
  size_13?: number;
  size_14?: number;
  // Financial
  total_quantity?: number;
  trade_price?: number;
  total_order_value?: number;
  // Dates - Order & Factory
  order_received_date?: string | null;
  order_sent_to_factory_date?: string | null;
  tech_packs_sent_to_factory?: string | null;
  specs_sent_to_factory?: string | null;
  barcodes_sent_to_factory?: string | null;
  original_po_ex_factory?: string | null;
  factory_confirmed_ex_factory?: string | null;
  // Samples - Fit
  fit_sample_required?: string;
  fit_sample_status?: string;
  fit_sample_received?: string | null;
  fit_sample_approved?: string | null;
  // Samples - Strike Off
  strike_off_status?: string;
  strike_off_received?: string | null;
  strike_off_approved?: string | null;
  // Samples - Lab Dip
  lab_dip_status?: string;
  lab_dip_received?: string | null;
  lab_dip_approved?: string | null;
  // Samples - PPS
  pps_status?: string;
  pps_received?: string | null;
  pps_sent_to_customer?: string | null;
  pps_approved?: string | null;
  // Samples - Other
  photo_sample_received?: string | null;
  ex_factory_from_pp_approval?: string | null;
  revised_po_ex_factory?: string | null;
  shipment_sample_received?: string | null;
  // Delivery dates
  original_del_date_to_customer?: string | null;
  eta_to_uk?: string | null;
  eta_to_customer?: string | null;
  customer_po_open_month?: string;
  expected_dispatch_arrive_uk_month?: string;
  // Shipping / Vessel
  fcl_lcl?: string;
  vessel_name?: string;
  vessel_etd?: string | null;
  vessel_eta_to_port?: string | null;
  revised_vessel_eta_to_port?: string | null;
  estimated_del_to_customer?: string | null;
  // Legacy fields (kept for data preservation)
  date_approved_to_production?: string | null;
  actual_date_del_to_uk?: string | null;
  actual_date_del_to_customer?: string | null;
  // Status
  status?: string;
  is_late?: boolean;
  // Shipping
  tracking_reference?: string;
  // Free-text overrides for the small set of date fields where customers /
  // factories occasionally give text instead of a real date (e.g. "ASAP").
  // Keys are field names (e.g. "original_del_date_to_customer"); values are
  // the free text. The corresponding date column is always null when a note
  // is set — the two are kept mutually exclusive on the server.
  date_notes?: Record<string, string> | null;
  // Comments
  comment_count?: number;
  unread_comment_count?: number;
  // Components (per-style sample tracking)
  components?: OrderComponent[];
  // Resubmission rollup per sample area. For orders with components this is the
  // max attempt across this order's components for that sample type; for orders
  // without components it reflects the order-level submission directly. PPS is
  // always order-level. Defaults to v1 / 0 when no rejection has happened.
  fit_sample_attempt_no?: number;
  fit_sample_rejection_count?: number;
  strike_off_attempt_no?: number;
  strike_off_rejection_count?: number;
  lab_dip_attempt_no?: number;
  lab_dip_rejection_count?: number;
  pps_attempt_no?: number;
  pps_rejection_count?: number;
  fit_sample_last_rejection?: LastRejection | null;
  strike_off_last_rejection?: LastRejection | null;
  lab_dip_last_rejection?: LastRejection | null;
  pps_last_rejection?: LastRejection | null;
  // Metadata
  created_at: string;
  updated_at: string;
}

export interface CommentReadBy {
  username: string;
  full_name?: string | null;
  read_at: string;
}

export interface Comment {
  id: number;
  order_id: number;
  user_id: number;
  username: string;
  full_name?: string | null;
  comment_text: string;
  source: string;
  read: boolean;
  read_by_internal: boolean;
  read_by_supplier: boolean;
  read_by_users: CommentReadBy[];
  created_at: string;
}

/** Each component tracks ONE sample type — Strike Off or Lab Dip, never
 *  both. Picked at create time and immutable afterwards. The fields for the
 *  "other" type are kept on the API model for historical reasons but should
 *  not be shown or written for new-shape components. */
export type ComponentSampleType = 'strike_off' | 'lab_dip';

export interface OrderComponent {
  id: number;
  order_id: number;
  name: string;
  sample_type: ComponentSampleType;
  fit_sample_status?: string | null;
  fit_sample_received?: string | null;
  fit_sample_approved?: string | null;
  strike_off_status?: string | null;
  strike_off_received?: string | null;
  strike_off_approved?: string | null;
  lab_dip_status?: string | null;
  lab_dip_received?: string | null;
  lab_dip_approved?: string | null;
  created_at: string;
  updated_at: string;
  // Resubmission rollup — current attempt and prior rejection count per area.
  // Defaults to 1 / 0 when nothing's been rejected.
  fit_sample_attempt_no?: number;
  fit_sample_rejection_count?: number;
  strike_off_attempt_no?: number;
  strike_off_rejection_count?: number;
  lab_dip_attempt_no?: number;
  lab_dip_rejection_count?: number;
  // Latest rejection context per sample area — only populated when the current
  // attempt is > 1. The factory's "what was wrong last time" reference.
  fit_sample_last_rejection?: LastRejection | null;
  strike_off_last_rejection?: LastRejection | null;
  lab_dip_last_rejection?: LastRejection | null;
}

export interface LastRejection {
  attempt_no: number;
  reason: string | null;
  notes: string | null;
  rejected_at: string | null;
  photo_url: string | null;
  /** Username of who rejected. Optional — older API responses may omit it. */
  rejected_by?: string | null;
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
  component_name?: string | null;
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
  options?: string[];
}

// Dropdown options for status columns
export const FIT_SAMPLE_STATUS_OPTIONS = [
  'NOT REQUIRED',
  'APPROVED',
  'OUTSTANDING',
  'P23 ADVISE UPDATE',
  'LATE',
  'RECEIVED',
  'REJECTED',
];

export const SAMPLE_STATUS_OPTIONS = [
  'NOT REQUIRED',
  'OUTSTANDING',
  'P23 ADVISE UPDATE',
  'LATE',
  'RECEIVED',
  'APPROVED',
  'REJECTED',
];

// Map legacy sample-status field keys to the canonical sample_type used by
// the submissions API. Null = this field isn't a sample-status field that
// should trigger the resubmission flow.
export const SAMPLE_STATUS_FIELD_TO_TYPE: Record<string, 'fit' | 'strike' | 'lab' | 'pps' | undefined> = {
  fit_sample_status: 'fit',
  strike_off_status: 'strike',
  lab_dip_status: 'lab',
  pps_status: 'pps',
};

export const FCL_LCL_OPTIONS = ['FCL', 'LCL', 'AIR'];

export const FIT_REQUIRED_OPTIONS = ['Y', 'N'];

export const COLUMNS: ColumnDef[] = [
  // Core PO identifiers - matches new CP HEADERS order
  { key: 'po_number', label: 'PO#', width: 80, editable: true, supplierEditable: false, supplierHidden: false, type: 'text' },
  { key: 'system_po_number', label: 'SL System PO#', width: 110, editable: true, supplierEditable: false, supplierHidden: true, type: 'text' },
  { key: 'customer', label: 'Customer', width: 150, editable: true, supplierEditable: false, supplierHidden: false, type: 'text' },
  { key: 'china_orderbook_ref', label: 'Order Reference', width: 140, editable: true, supplierEditable: false, supplierHidden: false, type: 'text' },
  { key: 'customer_po_number', label: 'Customer PO#', width: 100, editable: true, supplierEditable: false, supplierHidden: false, type: 'text' },
  { key: 'direct_repeat_new', label: 'Direct Repeat/New', width: 120, editable: true, supplierEditable: false, supplierHidden: false, type: 'text' },
  { key: 'season', label: 'Season', width: 80, editable: true, supplierEditable: false, supplierHidden: false, type: 'text' },
  { key: 'factory', label: 'Supplier', width: 120, editable: true, supplierEditable: false, supplierHidden: false, type: 'text' },
  { key: 'terms', label: 'Terms', width: 80, editable: true, supplierEditable: false, supplierHidden: false, type: 'text' },
  { key: 'sales_person', label: 'SL Sales Person', width: 110, editable: true, supplierEditable: false, supplierHidden: false, type: 'text' },
  { key: 'style_code', label: 'Style Code', width: 100, editable: true, supplierEditable: false, supplierHidden: false, type: 'text' },
  // Auto-derived from style_code (everything before the first dash). Not
  // editable — backend computes it on every response.
  { key: 'style_base', label: 'Style', width: 80, editable: false, supplierEditable: false, supplierHidden: false, type: 'text' },
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
  { key: 'size_11', label: 'S11', width: 45, editable: true, supplierEditable: false, supplierHidden: false, type: 'number' },
  { key: 'size_12', label: 'S12', width: 45, editable: true, supplierEditable: false, supplierHidden: false, type: 'number' },
  { key: 'size_13', label: 'S13', width: 45, editable: true, supplierEditable: false, supplierHidden: false, type: 'number' },
  { key: 'size_14', label: 'S14', width: 45, editable: true, supplierEditable: false, supplierHidden: false, type: 'number' },
  // Financial
  { key: 'total_quantity', label: 'Total', width: 60, editable: false, supplierEditable: false, supplierHidden: false, type: 'number' },
  { key: 'trade_price', label: 'Factory Cost Price', width: 120, editable: true, supplierEditable: false, supplierHidden: true, type: 'currency' },
  { key: 'total_order_value', label: 'Total Order Cost', width: 120, editable: false, supplierEditable: false, supplierHidden: true, type: 'currency' },
  // Dates - Order & Factory
  { key: 'order_received_date', label: 'Order Received', width: 110, editable: true, supplierEditable: false, supplierHidden: true, type: 'date' },
  { key: 'order_sent_to_factory_date', label: 'Sent to Factory', width: 110, editable: true, supplierEditable: false, supplierHidden: false, type: 'date' },
  { key: 'tech_packs_sent_to_factory', label: 'Tech Packs Sent', width: 115, editable: true, supplierEditable: false, supplierHidden: false, type: 'date' },
  { key: 'specs_sent_to_factory', label: 'Specs Sent', width: 100, editable: true, supplierEditable: false, supplierHidden: false, type: 'date' },
  { key: 'barcodes_sent_to_factory', label: 'Barcodes Sent', width: 110, editable: true, supplierEditable: false, supplierHidden: false, type: 'date' },
  { key: 'original_po_ex_factory', label: 'Requested Ex-Fac', width: 120, editable: true, supplierEditable: false, supplierHidden: false, type: 'date' },
  { key: 'factory_confirmed_ex_factory', label: 'Factory Confirmed Ex-Fac', width: 150, editable: true, supplierEditable: false, supplierHidden: false, type: 'date' },
  // Samples - Fit (hidden for suppliers; mirrors the Excel export hide-list)
  { key: 'fit_sample_required', label: 'Fit Sample Req', width: 110, editable: true, supplierEditable: false, supplierHidden: true, type: 'text', options: FIT_REQUIRED_OPTIONS },
  { key: 'fit_sample_status', label: 'Fit Sample Status', width: 120, editable: true, supplierEditable: false, supplierHidden: true, type: 'text', options: FIT_SAMPLE_STATUS_OPTIONS },
  { key: 'fit_sample_received', label: 'Fit Sample Rcvd', width: 115, editable: true, supplierEditable: false, supplierHidden: true, type: 'date' },
  { key: 'fit_sample_approved', label: 'Fit Sample Appr', width: 115, editable: true, supplierEditable: false, supplierHidden: true, type: 'date' },
  // Samples - Strike Off
  { key: 'strike_off_status', label: 'Strike Off Status', width: 120, editable: true, supplierEditable: false, supplierHidden: true, type: 'text', options: SAMPLE_STATUS_OPTIONS },
  { key: 'strike_off_received', label: 'Strike Off Rcvd', width: 115, editable: true, supplierEditable: false, supplierHidden: true, type: 'date' },
  { key: 'strike_off_approved', label: 'Strike Off Appr', width: 115, editable: true, supplierEditable: false, supplierHidden: true, type: 'date' },
  // Samples - Lab Dip
  { key: 'lab_dip_status', label: 'Lab Dip Status', width: 115, editable: true, supplierEditable: false, supplierHidden: true, type: 'text', options: SAMPLE_STATUS_OPTIONS },
  { key: 'lab_dip_received', label: 'Lab Dip Rcvd', width: 110, editable: true, supplierEditable: false, supplierHidden: true, type: 'date' },
  { key: 'lab_dip_approved', label: 'Lab Dip Appr', width: 110, editable: true, supplierEditable: false, supplierHidden: true, type: 'date' },
  // Samples - PPS
  { key: 'pps_status', label: 'PPS Status', width: 100, editable: true, supplierEditable: false, supplierHidden: true, type: 'text', options: SAMPLE_STATUS_OPTIONS },
  { key: 'pps_received', label: 'PPS Received', width: 110, editable: true, supplierEditable: false, supplierHidden: true, type: 'date' },
  { key: 'pps_sent_to_customer', label: 'PPS Sent to Cust', width: 120, editable: true, supplierEditable: false, supplierHidden: true, type: 'date' },
  { key: 'pps_approved', label: 'PPS Approved', width: 110, editable: true, supplierEditable: false, supplierHidden: true, type: 'date' },
  // Samples - Other
  { key: 'photo_sample_received', label: 'Photo Sample Rcvd', width: 125, editable: true, supplierEditable: false, supplierHidden: true, type: 'date' },
  { key: 'ex_factory_from_pp_approval', label: 'Ex-Fac from PP Appr', width: 135, editable: false, supplierEditable: false, supplierHidden: true, type: 'date' },
  { key: 'revised_po_ex_factory', label: 'Revised Ex-Fac', width: 115, editable: true, supplierEditable: true, supplierHidden: false, type: 'date' },
  { key: 'shipment_sample_received', label: 'Shipment Sample Rcvd', width: 140, editable: true, supplierEditable: false, supplierHidden: false, type: 'date' },
  // Delivery dates
  { key: 'original_del_date_to_customer', label: 'Cust Req Delivery', width: 120, editable: true, supplierEditable: false, supplierHidden: false, type: 'date' },
  { key: 'eta_to_uk', label: 'ETA UK', width: 90, editable: false, supplierEditable: false, supplierHidden: false, type: 'date' },
  { key: 'eta_to_customer', label: 'ETA Customer', width: 100, editable: false, supplierEditable: false, supplierHidden: false, type: 'date' },
  { key: 'customer_po_open_month', label: 'PO Open Month', width: 100, editable: false, supplierEditable: false, supplierHidden: false, type: 'text' },
  { key: 'expected_dispatch_arrive_uk_month', label: 'Exp Cust Del Month', width: 125, editable: false, supplierEditable: false, supplierHidden: false, type: 'text' },
  // Shipping / Vessel
  { key: 'fcl_lcl', label: 'FCL/LCL', width: 75, editable: true, supplierEditable: false, supplierHidden: false, type: 'text', options: FCL_LCL_OPTIONS },
  { key: 'vessel_name', label: 'Vessel Name', width: 120, editable: true, supplierEditable: false, supplierHidden: false, type: 'text' },
  { key: 'vessel_etd', label: 'Vessel ETD', width: 100, editable: true, supplierEditable: false, supplierHidden: false, type: 'date' },
  { key: 'vessel_eta_to_port', label: 'Vessel ETA Port', width: 115, editable: true, supplierEditable: false, supplierHidden: false, type: 'date' },
  { key: 'revised_vessel_eta_to_port', label: 'Revised Vessel ETA', width: 130, editable: true, supplierEditable: false, supplierHidden: false, type: 'date' },
  { key: 'estimated_del_to_customer', label: 'Est Del to Cust', width: 115, editable: false, supplierEditable: false, supplierHidden: false, type: 'date' },
  // Status (internal-only, kept for app logic)
  { key: 'status', label: 'Status', width: 110, editable: true, supplierEditable: false, supplierHidden: false, type: 'text' },
];

// Factory Product view — PO through ETA Customer, product-focused
export const FACTORY_PRODUCT_COLUMNS: string[] = [
  'po_number', 'customer', 'china_orderbook_ref', 'direct_repeat_new', 'season',
  'style_code', 'description', 'colour', 'gender',
  // Size range & qty
  'size_2xs', 'size_xs', 'size_s', 'size_m', 'size_l', 'size_xl',
  'size_2xl', 'size_3xl', 'size_4xl', 'size_5xl', 'size_11', 'size_12', 'size_13', 'size_14',
  // Financial
  'total_quantity', 'trade_price', 'total_order_value',
  // Dates & samples through ETA Customer
  'order_received_date', 'order_sent_to_factory_date',
  'tech_packs_sent_to_factory', 'specs_sent_to_factory', 'barcodes_sent_to_factory',
  'original_po_ex_factory', 'factory_confirmed_ex_factory',
  'fit_sample_required', 'fit_sample_status', 'fit_sample_received', 'fit_sample_approved',
  'strike_off_status', 'strike_off_received', 'strike_off_approved',
  'lab_dip_status', 'lab_dip_received', 'lab_dip_approved',
  'pps_status', 'pps_received', 'pps_sent_to_customer', 'pps_approved',
  'photo_sample_received',
  'revised_po_ex_factory', 'shipment_sample_received',
  'original_del_date_to_customer', 'eta_to_uk', 'eta_to_customer',
];

// Factory Shipping view — shipping-focused columns
export const FACTORY_SHIPPING_COLUMNS: string[] = [
  'po_number', 'customer', 'china_orderbook_ref', 'terms',
  'style_code', 'description', 'colour', 'gender',
  // Size range & qty
  'size_2xs', 'size_xs', 'size_s', 'size_m', 'size_l', 'size_xl',
  'size_2xl', 'size_3xl', 'size_4xl', 'size_5xl', 'size_11', 'size_12', 'size_13', 'size_14',
  // Financial
  'total_quantity', 'trade_price', 'total_order_value',
  // Ex-factory dates
  'original_po_ex_factory', 'factory_confirmed_ex_factory',
  // PPS status all the way to estimated del to customer
  'pps_status', 'pps_received', 'pps_sent_to_customer', 'pps_approved',
  'photo_sample_received',
  'revised_po_ex_factory', 'shipment_sample_received',
  'original_del_date_to_customer', 'eta_to_uk', 'eta_to_customer',
  'customer_po_open_month', 'expected_dispatch_arrive_uk_month',
  'fcl_lcl', 'vessel_name', 'vessel_etd', 'vessel_eta_to_port',
  'revised_vessel_eta_to_port', 'estimated_del_to_customer',
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
