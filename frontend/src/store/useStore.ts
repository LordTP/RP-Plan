import { create } from 'zustand';
import type { User, Order, Comment, DashboardStats } from '@/types';

interface AppState {
  // Auth
  user: User | null;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  logout: () => void;

  // Orders
  orders: Order[];
  totalOrders: number;
  currentPage: number;
  pageSize: number;
  setOrders: (orders: Order[], total: number) => void;
  appendOrders: (orders: Order[], total: number) => void;
  updateOrderInList: (order: Order) => void;
  setPage: (page: number) => void;

  // Selected order for sidebar
  selectedOrderId: number | null;
  selectedOrder: Order | null;
  comments: Comment[];
  setSelectedOrder: (order: Order | null) => void;
  setComments: (comments: Comment[]) => void;
  addComment: (comment: Comment) => void;

  // Dashboard stats
  dashboardStats: DashboardStats | null;
  setDashboardStats: (stats: DashboardStats) => void;

  // UI State
  isSidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  isLoading: boolean;
  setLoading: (loading: boolean) => void;
}

export const useStore = create<AppState>((set) => ({
  // Auth
  user: null,
  isAuthenticated: false,
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  logout: () => {
    localStorage.removeItem('access_token');
    set({ user: null, isAuthenticated: false });
  },

  // Orders
  orders: [],
  totalOrders: 0,
  currentPage: 1,
  // Rows per infinite-scroll page on /orders. Raised 50 -> 200 (Sep 2026)
  // because scrolling in 50s was tedious on a 700-row book. Safe to raise
  // only after the comment-count N+1 was collapsed to two aggregate
  // queries — at 50 the old code cost 100 round trips per page, so this
  // would have made the table four times slower rather than faster.
  pageSize: 200,
  setOrders: (orders, total) => set({ orders, totalOrders: total }),
  appendOrders: (newOrders, total) =>
    set((state) => ({
      orders: [...state.orders, ...newOrders],
      totalOrders: total,
    })),
  updateOrderInList: (updatedOrder) =>
    set((state) => ({
      orders: state.orders.map((order) =>
        order.id === updatedOrder.id ? updatedOrder : order
      ),
      selectedOrder:
        state.selectedOrder?.id === updatedOrder.id
          ? updatedOrder
          : state.selectedOrder,
    })),
  setPage: (page) => set({ currentPage: page }),

  // Selected order
  selectedOrderId: null,
  selectedOrder: null,
  comments: [],
  setSelectedOrder: (order) =>
    set({
      selectedOrderId: order?.id || null,
      selectedOrder: order,
      isSidebarOpen: !!order,
    }),
  setComments: (comments) => set({ comments }),
  addComment: (comment) =>
    set((state) => ({ comments: [...state.comments, comment] })),

  // Dashboard
  dashboardStats: null,
  setDashboardStats: (stats) => set({ dashboardStats: stats }),

  // UI
  isSidebarOpen: false,
  setSidebarOpen: (open) => set({ isSidebarOpen: open }),
  isLoading: false,
  setLoading: (loading) => set({ isLoading: loading }),
}));
