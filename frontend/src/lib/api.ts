import axios, { AxiosError } from 'axios';
import type {
  AuthResponse,
  User,
  Order,
  Comment,
  DateHistory,
  DashboardStats,
  PaginatedResponse,
  POSummary
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

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
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

  updateOrder: async (id: number, data: Partial<Order>): Promise<Order> => {
    const response = await api.put<Order>(`/api/orders/${id}`, data);
    return response.data;
  },

  getOrderComments: async (id: number): Promise<Comment[]> => {
    const response = await api.get<Comment[]>(`/api/orders/${id}/comments`);
    return response.data;
  },

  addOrderComment: async (id: number, commentText: string, source: 'internal' | 'supplier'): Promise<Comment> => {
    const response = await api.post<Comment>(`/api/orders/${id}/comments`, {
      comment_text: commentText,
      source,
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

  bulkUpdateStatus: async (poNumber: string, status: string): Promise<{ orders_updated: number }> => {
    const response = await api.post('/api/orders/bulk-update-status', {
      po_number: poNumber,
      status,
    });
    return response.data;
  },

  bulkAddComment: async (poNumber: string, commentText: string): Promise<{ comments_added: number }> => {
    const response = await api.post('/api/orders/bulk-add-comment', {
      po_number: poNumber,
      comment_text: commentText,
    });
    return response.data;
  },

  bulkUpdateDate: async (
    poNumber: string,
    fieldName: string,
    value: string | null,
    orderIds?: number[]
  ): Promise<{ orders_updated: number }> => {
    const response = await api.post('/api/orders/bulk-update-date', {
      po_number: poNumber,
      field_name: fieldName,
      new_value: value,
      order_ids: orderIds || [],
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
};

// Statuses endpoint
export const statusesApi = {
  getStatuses: async (): Promise<{ statuses: string[] }> => {
    const response = await api.get<{ statuses: string[] }>('/api/statuses');
    return response.data;
  },
};

// Excel endpoints
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
  summary?: {
    total_rows: number;
    new_count: number;
    update_count: number;
    unchanged_count: number;
  };
  errors: string[];
}

export const excelApi = {
  exportExcel: async (): Promise<Blob> => {
    const response = await api.get('/api/excel/export', {
      responseType: 'blob',
    });
    return response.data;
  },

  previewImport: async (file: File): Promise<ImportPreviewResult> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post('/api/excel/preview', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  importExcel: async (file: File): Promise<{
    success: boolean;
    rows_processed: number;
    rows_created: number;
    rows_updated: number;
    errors: string[];
  }> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post('/api/excel/import', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
};

// User management endpoints
export const usersApi = {
  getUsers: async (): Promise<User[]> => {
    const response = await api.get<User[]>('/api/users');
    return response.data;
  },

  createUser: async (userData: {
    username: string;
    email: string;
    password: string;
    role: 'admin' | 'internal' | 'supplier';
    factory_name?: string;
  }): Promise<User> => {
    const response = await api.post<User>('/api/users', userData);
    return response.data;
  },

  updateUser: async (userId: number, userData: {
    role?: string;
    factory_name?: string;
    is_active?: boolean;
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
};

export default api;
