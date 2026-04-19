import axios, { AxiosError } from 'axios';
import type {
  AuthResponse,
  User,
  Order,
  Comment,
  DateHistory,
  DashboardStats,
  PaginatedResponse,
  POSummary,
  OrderComponent
} from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor for token refresh and error handling
api.interceptors.response.use(
  (response) => {
    // Pick up refreshed token from backend
    const newToken = response.headers['x-refresh-token'];
    if (newToken) {
      localStorage.setItem('access_token', newToken);
    }
    return response;
  },
  (error: AxiosError) => {
    // Don't auto-redirect on 401 - let components handle auth state
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token');
    }
    return Promise.reject(error);
  }
);

// Helper to extract error message from various error formats
export const getErrorMessage = (error: any): string => {
  // Network errors
  if (!error.response) {
    if (error.code === 'ECONNREFUSED' || error.message?.includes('Network Error')) {
      return 'Unable to connect to the server. Please check your internet connection and try again.';
    }
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      return 'The request timed out. Please try again.';
    }
    return 'A network error occurred. Please check your connection and try again.';
  }

  // HTTP errors with status codes
  const status = error.response?.status;
  const detail = error.response?.data?.detail;

  // Handle specific status codes with no detail
  if (!detail) {
    switch (status) {
      case 400:
        return 'Invalid request. Please check your input and try again.';
      case 401:
        return 'Your session has expired. Please log in again.';
      case 403:
        return 'You do not have permission to perform this action.';
      case 404:
        return 'The requested resource was not found.';
      case 413:
        return 'The file is too large. Please use a smaller file.';
      case 422:
        return 'The data format is invalid. Please check your input.';
      case 500:
        return 'A server error occurred. Please try again later or contact support.';
      case 502:
      case 503:
      case 504:
        return 'The server is temporarily unavailable. Please try again in a few moments.';
      default:
        return 'An unexpected error occurred. Please try again.';
    }
  }

  // Parse the detail message
  if (typeof detail === 'string') return detail;

  if (Array.isArray(detail)) {
    // Pydantic validation errors - make them more readable
    const messages = detail.map((e: any) => {
      const field = e.loc?.slice(1).join('.') || '';
      const msg = e.msg || e.message || '';
      if (field && msg) {
        return `${field}: ${msg}`;
      }
      return msg || JSON.stringify(e);
    });
    return messages.join('. ');
  }

  if (typeof detail === 'object') {
    return detail.msg || detail.message || JSON.stringify(detail);
  }

  return 'An error occurred. Please try again.';
};

// Auth endpoints
export const authApi = {
  login: async (username: string, password: string): Promise<AuthResponse> => {
    const response = await api.post<AuthResponse>('/api/auth/login', {
      username,
      password,
    });
    return response.data;
  },

  getCurrentUser: async (): Promise<User> => {
    const response = await api.get<User>('/api/auth/me');
    return response.data;
  },
};

// Orders endpoints
export interface OrderFilters {
  search?: string;
  po_number?: string;
  style_code?: string;
  factory?: string;
  customer?: string;
  status?: string;
  tab?: string;
}

export const ordersApi = {
  getOrders: async (
    page: number = 1,
    pageSize: number = 50,
    filters?: OrderFilters
  ): Promise<PaginatedResponse<Order>> => {
    const response = await api.get<PaginatedResponse<Order>>('/api/orders', {
      params: {
        page,
        page_size: pageSize,
        ...filters
      },
    });
    return response.data;
  },

  getOrder: async (id: number): Promise<Order> => {
    const response = await api.get<Order>(`/api/orders/${id}`);
    return response.data;
  },

  updateOrder: async (id: number, data: Partial<Order> & { change_reason?: string }): Promise<Order | {
    order: Order;
    pending_approval: boolean;
    pending_fields: string[];
    message: string;
  }> => {
    const response = await api.put(`/api/orders/${id}`, data);
    return response.data;
  },

  getOrderComments: async (id: number): Promise<Comment[]> => {
    const response = await api.get<Comment[]>(`/api/orders/${id}/comments`);
    return response.data;
  },

  addOrderComment: async (id: number, commentText: string, source: 'internal' | 'supplier', mentionedUserIds?: number[]): Promise<Comment> => {
    const response = await api.post<Comment>(`/api/orders/${id}/comments`, {
      comment_text: commentText,
      source,
      mentioned_user_ids: mentionedUserIds && mentionedUserIds.length > 0 ? mentionedUserIds : undefined,
    });
    return response.data;
  },

  getOrderHistory: async (id: number): Promise<DateHistory[]> => {
    const response = await api.get<DateHistory[]>(`/api/orders/${id}/history`);
    return response.data;
  },

  markCommentsRead: async (id: number): Promise<void> => {
    await api.post(`/api/orders/${id}/comments/mark-read`);
  },

  bulkUpdateStatus: async (poNumber: string, status: string, trackingReference?: string): Promise<{ orders_updated: number }> => {
    const response = await api.post('/api/orders/bulk-update-status', {
      po_number: poNumber,
      status,
      ...(trackingReference ? { tracking_reference: trackingReference } : {}),
    });
    return response.data;
  },

  setShippedStatus: async (orderId: number, trackingRef: string): Promise<Order> => {
    const response = await api.put(`/api/orders/${orderId}`, {
      status: 'Shipped',
      tracking_reference: trackingRef,
    });
    return response.data;
  },

  bulkSetShippedStatus: async (poNumber: string, trackingRef: string, orderIds?: number[]): Promise<{ orders_updated: number }> => {
    const response = await api.post('/api/orders/bulk-update-status', {
      po_number: poNumber,
      status: 'Shipped',
      tracking_reference: trackingRef,
      ...(orderIds && orderIds.length > 0 ? { order_ids: orderIds } : {}),
    });
    return response.data;
  },

  bulkAddComment: async (poNumber: string, commentText: string, mentionedUserIds?: number[]): Promise<{ comments_added: number }> => {
    const response = await api.post('/api/orders/bulk-add-comment', {
      po_number: poNumber,
      comment_text: commentText,
      mentioned_user_ids: mentionedUserIds && mentionedUserIds.length > 0 ? mentionedUserIds : undefined,
    });
    return response.data;
  },

  bulkUpdateDate: async (
    poNumber: string,
    fieldName: string,
    value: string | null,
    orderIds?: number[],
    changeReason?: string
  ): Promise<{ orders_updated?: number; pending_approval?: boolean; pending_count?: number; message?: string }> => {
    const response = await api.post('/api/orders/bulk-update-date', {
      po_number: poNumber,
      field_name: fieldName,
      new_value: value,
      order_ids: orderIds || [],
      change_reason: changeReason,
    });
    return response.data;
  },

  getStylesOnPO: async (poNumber: string): Promise<{
    orders: Array<{
      id: number;
      style_code: string;
      description: string;
      colour: string;
    }>;
  }> => {
    const response = await api.get(`/api/orders/styles-on-po/${encodeURIComponent(poNumber)}`);
    return response.data;
  },

  getRecentChanges: async (poNumber?: string, since?: string): Promise<{
    since: string;
    changes: Record<string, string[]>;
  }> => {
    const params: Record<string, string> = {};
    if (poNumber) params.po_number = poNumber;
    if (since) params.since = since;
    const response = await api.get('/api/orders/recent-changes', { params });
    return response.data;
  },
};

// Components API
export const componentsApi = {
  getComponents: async (orderId: number): Promise<OrderComponent[]> => {
    const response = await api.get<OrderComponent[]>(`/api/orders/${orderId}/components`);
    return response.data;
  },

  createComponent: async (orderId: number, data: { name: string }): Promise<OrderComponent> => {
    const response = await api.post<OrderComponent>(`/api/orders/${orderId}/components`, data);
    return response.data;
  },

  updateComponent: async (componentId: number, data: Partial<OrderComponent>): Promise<OrderComponent> => {
    const response = await api.put<OrderComponent>(`/api/components/${componentId}`, data);
    return response.data;
  },

  deleteComponent: async (componentId: number): Promise<void> => {
    await api.delete(`/api/components/${componentId}`);
  },

  bulkAddComponent: async (orderId: number, data: { name: string; order_ids?: number[] }): Promise<{ success: boolean; components_created: number }> => {
    const response = await api.post(`/api/orders/${orderId}/components/bulk-add`, data);
    return response.data;
  },

  applyFieldToPO: async (componentId: number, data: Partial<OrderComponent> & { order_ids?: number[] }): Promise<{ success: boolean; components_updated: number }> => {
    const response = await api.post(`/api/components/${componentId}/apply-to-po`, data);
    return response.data;
  },

  getStylesWithComponent: async (poNumber: string, componentName: string): Promise<{
    styles: { id: number; style_code: string; description: string; colour: string; component_id: number }[];
  }> => {
    const response = await api.get('/api/components/styles-with-component', {
      params: { po_number: poNumber, component_name: componentName },
    });
    return response.data;
  },
};

// Role Column Settings API
export interface ColumnSetting {
  column_key: string;
  is_visible: boolean;
  is_editable: boolean;
}

export interface RoleColumnSettings {
  role: string;
  columns: ColumnSetting[];
}

export const settingsApi = {
  getRoleColumns: async (role: string): Promise<RoleColumnSettings> => {
    const response = await api.get(`/api/settings/role-columns/${role}`);
    return response.data;
  },

  updateRoleColumns: async (role: string, columns: ColumnSetting[]): Promise<{ success: boolean }> => {
    const response = await api.put(`/api/settings/role-columns/${role}`, { columns });
    return response.data;
  },

  // Admin-managed app-wide settings (e.g. emails kill switch).
  getAppSettings: async (): Promise<{ settings: Record<string, string | boolean> }> => {
    const response = await api.get('/api/settings/app');
    return response.data;
  },

  updateAppSettings: async (updates: Record<string, string | boolean>): Promise<{ success: boolean; updated: string[] }> => {
    const response = await api.put('/api/settings/app', updates);
    return response.data;
  },

  getEmailAutomations: async (): Promise<{
    automations: { key: string; label: string; description: string; setting_key: string; enabled: boolean }[];
  }> => {
    const response = await api.get('/api/settings/email-automations');
    return response.data;
  },
};

// Statuses endpoint
export const statusesApi = {
  getStatuses: async (): Promise<{ statuses: string[] }> => {
    const response = await api.get<{ statuses: string[] }>('/api/statuses');
    return response.data;
  },
};

// Excel endpoints
export interface ImportConflict {
  order_id: number;
  po_number: string;
  style_code: string;
  field_name: string;
  pending_change_id: number;
  current_value: string;
  pending_proposed_value: string;
  excel_value: string;
  submitted_by: string;
  reason: string;
}

export interface ImportPreviewResult {
  success: boolean;
  error?: string;
  new_orders: Array<{
    po_number: string;
    style_code: string;
    customer: string;
    description: string;
    factory: string;
    colour: string;
    total_quantity: number;
  }>;
  updated_orders: Array<{
    id: number;
    po_number: string;
    style_code: string;
    customer: string;
    description: string;
    changes: Array<{
      field: string;
      old_value: string;
      new_value: string;
    }>;
  }>;
  unchanged_orders: Array<{
    po_number: string;
    style_code: string;
  }>;
  conflicts: ImportConflict[];
  summary?: {
    total_rows: number;
    new_count: number;
    update_count: number;
    unchanged_count: number;
    conflict_count: number;
  };
  errors: string[];
}

export const excelApi = {
  exportExcel: async (filters?: OrderFilters): Promise<Blob> => {
    const params = new URLSearchParams();
    if (filters) {
      if (filters.po_number) params.append('po_number', filters.po_number);
      if (filters.style_code) params.append('style_code', filters.style_code);
      if (filters.factory) params.append('factory', filters.factory);
      if (filters.customer) params.append('customer', filters.customer);
      if (filters.status) params.append('status', filters.status);
    }
    const queryString = params.toString();
    const url = queryString ? `/api/excel/export?${queryString}` : '/api/excel/export';
    const response = await api.get(url, {
      responseType: 'blob',
    });
    return response.data;
  },

  previewImport: async (file: File, newOnly: boolean = false): Promise<ImportPreviewResult> => {
    const formData = new FormData();
    formData.append('file', file);
    if (newOnly) formData.append('new_only', 'true');

    const response = await api.post('/api/excel/preview', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  importExcel: async (
    file: File,
    conflictResolutions?: Array<{ pending_change_id: number; resolution: 'use_excel' | 'use_pending' }>,
    newOnly: boolean = false
  ): Promise<{
    success: boolean;
    rows_processed: number;
    rows_created: number;
    rows_updated: number;
    errors: string[];
    batch_id?: string;
  }> => {
    const formData = new FormData();
    formData.append('file', file);
    if (conflictResolutions && conflictResolutions.length > 0) {
      formData.append('conflict_resolutions', JSON.stringify(conflictResolutions));
    }
    if (newOnly) formData.append('new_only', 'true');

    const response = await api.post('/api/excel/import', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  getLastImport: async (): Promise<{
    batch: {
      batch_id: string;
      username: string;
      filename: string;
      rows_created: number;
      rows_updated: number;
      created_at: string;
    } | null;
  }> => {
    const response = await api.get('/api/excel/last-import');
    return response.data;
  },

  undoLastImport: async (): Promise<{
    success: boolean;
    orders_deleted: number;
    orders_reverted: number;
    batch_id: string;
  }> => {
    const response = await api.post('/api/excel/undo');
    return response.data;
  },
};

// User management endpoints
export interface MentionableUser {
  id: number;
  username: string;
  full_name?: string | null;
  role: string;
}

export const usersApi = {
  getUsers: async (): Promise<User[]> => {
    const response = await api.get<User[]>('/api/users');
    return response.data;
  },

  getMentionableUsers: async (query: string, limit = 10): Promise<MentionableUser[]> => {
    const response = await api.get<MentionableUser[]>('/api/users/mentionable', {
      params: { q: query || undefined, limit },
    });
    return response.data;
  },

  createUser: async (userData: {
    username: string;
    email: string;
    full_name?: string;
    password: string;
    role: 'admin' | 'internal' | 'supplier' | 'sourcelab_designer';
    factory_name?: string;
  }): Promise<User> => {
    const response = await api.post<User>('/api/users', userData);
    return response.data;
  },

  updateUser: async (userId: number, userData: {
    username?: string;
    email?: string;
    full_name?: string | null;
    role?: string;
    factory_name?: string;
    is_active?: boolean;
    mentionable?: boolean;
    password?: string;
  }): Promise<User> => {
    const response = await api.put<User>(`/api/users/${userId}`, userData);
    return response.data;
  },

  deleteUser: async (userId: number): Promise<void> => {
    await api.delete(`/api/users/${userId}`);
  },
};

// Factories endpoint (for user management dropdown)
export const factoriesApi = {
  getFactories: async (): Promise<{ factories: string[] }> => {
    const response = await api.get<{ factories: string[] }>('/api/factories');
    return response.data;
  },
};

// Activity summary types
export interface ActivitySummary {
  since: string;
  new_orders: {
    count: number;
    po_count: number;
    orders: {
      po_number: string;
      customer: string;
      factory: string;
      styles: string[];
      created_at: string;
    }[];
  };
  updated_orders: {
    count: number;
    po_count: number;
    orders: {
      po_number: string;
      customer: string;
      factory: string;
      styles: string[];
      updated_at: string;
    }[];
  };
  new_comments: {
    count: number;
    comments: {
      id: number;
      po_number: string;
      style_code: string;
      comment_text: string;
      source: string;
      username: string;
      created_at: string;
    }[];
  };
}

export interface RecentActivityEvent {
  type: 'field_change' | 'comment';
  username: string;
  user_initials: string;
  po_number: string;
  style_code: string;
  field_name?: string;
  old_value?: string;
  new_value?: string;
  comment_text?: string;
  source: string;
  created_at: string | null;
}

export interface MissedActivity {
  since: string | null;
  until: string | null;
  new_orders: {
    count: number;
    po_count: number;
    orders: {
      po_number: string;
      customer: string;
      factory: string;
      styles: string[];
      created_at: string;
    }[];
  };
  updated_orders: {
    count: number;
    po_count: number;
    orders: {
      po_number: string;
      customer: string;
      factory: string;
      styles: string[];
      updated_at: string;
    }[];
  };
  new_comments: {
    count: number;
    comments: {
      id: number;
      po_number: string;
      style_code: string;
      comment_text: string;
      source: string;
      username: string;
      created_at: string;
    }[];
  };
}

// Stats endpoints
export const statsApi = {
  getDashboardStats: async (): Promise<DashboardStats> => {
    const response = await api.get<DashboardStats>('/api/stats/dashboard');
    return response.data;
  },

  getPOSummary: async (limit: number = 10): Promise<{ po_summaries: POSummary[] }> => {
    const response = await api.get<{ po_summaries: POSummary[] }>('/api/stats/po-summary', {
      params: { limit },
    });
    return response.data;
  },

  getActivitySummary: async (): Promise<ActivitySummary> => {
    const response = await api.get<ActivitySummary>('/api/stats/activity-summary');
    return response.data;
  },

  getMissedActivity: async (): Promise<MissedActivity> => {
    const response = await api.get<MissedActivity>('/api/stats/missed-activity');
    return response.data;
  },

  getRecentActivity: async (limit: number = 15, offset: number = 0): Promise<{ events: RecentActivityEvent[]; has_more: boolean }> => {
    const response = await api.get('/api/stats/recent-activity', {
      params: { limit, offset },
    });
    return response.data;
  },
};

// Analytics endpoints
export const analyticsApi = {
  getOverview: async (months: number = 6) => {
    const response = await api.get('/api/analytics/overview', { params: { months } });
    return response.data;
  },

  getOrdersOverTime: async (months: number = 12) => {
    const response = await api.get('/api/analytics/orders-over-time', { params: { months } });
    return response.data;
  },

  getFactoryPerformance: async () => {
    const response = await api.get('/api/analytics/factory-performance');
    return response.data;
  },

  getCustomerAnalytics: async (limit: number = 10) => {
    const response = await api.get('/api/analytics/customer-analytics', { params: { limit } });
    return response.data;
  },

  getDeliveryPerformance: async (months: number = 6) => {
    const response = await api.get('/api/analytics/delivery-performance', { params: { months } });
    return response.data;
  },

  getDateChanges: async (months: number = 6) => {
    const response = await api.get('/api/analytics/date-changes', { params: { months } });
    return response.data;
  },

  getPipeline: async () => {
    const response = await api.get('/api/analytics/pipeline');
    return response.data;
  },

  getAlerts: async () => {
    const response = await api.get('/api/analytics/alerts');
    return response.data;
  },

  getDesignAnalytics: async () => {
    const response = await api.get('/api/analytics/design');
    return response.data;
  },

  getDashboardWarnings: async () => {
    const response = await api.get('/api/warnings/dashboard');
    return response.data;
  },
};

export const trackingApi = {
  listRefs: async (): Promise<{ refs: { ref: string; count: number }[] }> => {
    const response = await api.get('/api/tracking/refs');
    return response.data;
  },

  search: async (query: string): Promise<{ orders: any[] }> => {
    const response = await api.get('/api/tracking/search', { params: { q: query } });
    return response.data;
  },

  bulkUpdateRevisedVesselEta: async (orderIds: number[], newValue: string | null): Promise<{ success: boolean; updated_count: number }> => {
    const response = await api.post('/api/tracking/bulk-update-revised-vessel-eta', {
      order_ids: orderIds,
      new_value: newValue,
    });
    return response.data;
  },
};

// Pending date change approval types
export interface PendingChange {
  id: number;
  order_id: number;
  style_code: string;
  field_name: string;
  current_value: string | null;
  proposed_value: string | null;
  reason: string;
  submitted_by: string;
  submitted_at: string | null;
}

export interface PendingApprovalGroup {
  po_number: string;
  factory: string;
  customer: string;
  changes: PendingChange[];
}

export interface RejectedChange {
  id: number;
  po_number: string;
  style_code: string;
  field_name: string;
  current_value: string | null;
  proposed_value: string | null;
  reason: string;
  submitted_by: string;
  submitted_at: string | null;
  rejected_by: string;
  rejected_at: string | null;
  rejection_reason: string;
}

// Supplier's own pending/approved changes
export interface MyPendingChange {
  id: number;
  order_id: number;
  po_number: string;
  style_code: string;
  field_name: string;
  current_value: string | null;
  proposed_value: string | null;
  reason: string;
  submitted_at: string | null;
}

export interface MyApprovedChange {
  id: number;
  order_id: number;
  po_number: string;
  style_code: string;
  field_name: string;
  current_value: string | null;
  proposed_value: string | null;
  reason: string;
  submitted_at: string | null;
  approved_by: string;
  approved_at: string | null;
}

// Approval endpoints
export const approvalsApi = {
  getPendingApprovals: async (): Promise<{ pending_approvals: PendingApprovalGroup[] }> => {
    const response = await api.get('/api/approvals/pending');
    return response.data;
  },

  getRejectedChanges: async (): Promise<{ rejected_changes: RejectedChange[] }> => {
    const response = await api.get('/api/approvals/rejected');
    return response.data;
  },

  getOrderPendingChanges: async (orderId: number): Promise<{
    pending_changes: Array<{
      id: number;
      field_name: string;
      current_value: string | null;
      proposed_value: string | null;
      reason: string;
      submitted_by: string;
      submitted_at: string | null;
    }>;
  }> => {
    const response = await api.get(`/api/orders/${orderId}/pending-changes`);
    return response.data;
  },

  getBatchPendingChanges: async (orderIds: number[]): Promise<{
    pending_changes: Record<number, Array<{
      id: number;
      field_name: string;
      current_value: string | null;
      proposed_value: string | null;
      reason: string;
      submitted_by: string;
      submitted_at: string | null;
    }>>;
  }> => {
    const response = await api.post('/api/orders/batch-pending-changes', { order_ids: orderIds });
    return response.data;
  },

  approveChange: async (approvalId: number): Promise<{ success: boolean; message: string }> => {
    const response = await api.post(`/api/approvals/${approvalId}/approve`);
    return response.data;
  },

  rejectChange: async (approvalId: number, reason: string): Promise<{ success: boolean; message: string }> => {
    const response = await api.post(`/api/approvals/${approvalId}/reject`, { reason });
    return response.data;
  },

  bulkApprove: async (ids: number[]): Promise<{ success: boolean; approved_count: number }> => {
    const response = await api.post('/api/approvals/bulk-approve', { ids });
    return response.data;
  },

  bulkReject: async (ids: number[], reason: string): Promise<{ success: boolean; rejected_count: number }> => {
    const response = await api.post('/api/approvals/bulk-reject', { ids, reason });
    return response.data;
  },

  // Supplier-specific endpoints
  getMyPendingChanges: async (): Promise<{ pending_changes: MyPendingChange[] }> => {
    const response = await api.get('/api/approvals/my-pending');
    return response.data;
  },

  getMyApprovedChanges: async (): Promise<{ approved_changes: MyApprovedChange[] }> => {
    const response = await api.get('/api/approvals/my-approved');
    return response.data;
  },

  cancelPendingChange: async (approvalId: number): Promise<{ success: boolean; message: string }> => {
    const response = await api.delete(`/api/approvals/${approvalId}/cancel`);
    return response.data;
  },
};

export default api;
