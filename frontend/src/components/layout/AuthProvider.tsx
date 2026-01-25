'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useStore } from '@/store/useStore';
import { authApi } from '@/lib/api';
import { wsClient } from '@/lib/websocket';

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { setUser, isAuthenticated, updateOrderInList } = useStore();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    // Connect to WebSocket when authenticated
    if (isAuthenticated) {
      wsClient.connect();

      // Subscribe to order updates
      const unsubscribe = wsClient.subscribe((data) => {
        if (data.type === 'order_update' && data.order) {
          updateOrderInList(data.order);
        }
      });

      return () => {
        unsubscribe();
        wsClient.disconnect();
      };
    }
  }, [isAuthenticated, updateOrderInList]);

  const checkAuth = async () => {
    const token = localStorage.getItem('access_token');

    if (!token) {
      setIsChecking(false);
      if (pathname !== '/') {
        window.location.href = '/';
      }
      return;
    }

    try {
      const user = await authApi.getCurrentUser();
      setUser(user);
      setIsChecking(false);
    } catch (error) {
      console.error('Auth check failed:', error);
      localStorage.removeItem('access_token');
      if (pathname !== '/') {
        window.location.href = '/';
      }
      setIsChecking(false);
    }
  };

  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
