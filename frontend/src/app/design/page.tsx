'use client';

import { Palette } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider } from '@/components/layout/AuthProvider';
import { useStore } from '@/store/useStore';
import OrdersV2Page from '@/app/orders-v2/page';

export default function DesignPage() {
  return (
    <AuthProvider>
      <DesignContent />
    </AuthProvider>
  );
}

function DesignContent() {
  const { user } = useStore();

  // Block suppliers from accessing this page
  if (user && user.role === 'supplier') {
    return (
      <AppShell title="Design">
        <div className="flex items-center justify-center h-[calc(100vh-200px)]">
          <div className="text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Palette className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-500">You do not have permission to view the Design page.</p>
          </div>
        </div>
      </AppShell>
    );
  }

  return <OrdersV2Page />;
}
