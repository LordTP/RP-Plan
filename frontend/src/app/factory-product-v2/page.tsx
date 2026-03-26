'use client';

import { X } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider } from '@/components/layout/AuthProvider';
import { FactoryV2View } from '@/components/orders/FactoryV2View';
import { useStore } from '@/store/useStore';

export default function FactoryProductV2Page() {
  return (
    <AuthProvider>
      <PageGuard />
    </AuthProvider>
  );
}

function PageGuard() {
  const { user } = useStore();

  if (user?.role !== 'supplier' && user?.role !== 'admin') {
    return (
      <AppShell title="Factory Product">
        <div className="flex items-center justify-center h-[calc(100vh-200px)]">
          <div className="text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <X className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-500">This page is only available to factory users.</p>
          </div>
        </div>
      </AppShell>
    );
  }

  return <FactoryV2View viewType="factory-product" />;
}
