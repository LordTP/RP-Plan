'use client';

import { useEffect, useState } from 'react';
import { Palette, Search } from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { AuthProvider } from '@/components/layout/AuthProvider';
import { useStore } from '@/store/useStore';
import { useRouter } from 'next/navigation';

export default function DesignPage() {
  return (
    <AuthProvider>
      <DesignContent />
    </AuthProvider>
  );
}

function DesignContent() {
  const { user } = useStore();
  const router = useRouter();

  // Block suppliers from accessing this page
  if (user && user.role === 'supplier') {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex items-center justify-center h-[calc(100vh-64px)]">
          <div className="text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Palette className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-500">You do not have permission to view the Design page.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Palette className="w-7 h-7 text-violet-600" />
            Design
          </h1>
          <p className="text-gray-500 mt-1">
            Manage design assets and artwork
          </p>
        </div>

        {/* Placeholder table */}
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Design Tasks</h2>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search..."
                  className="pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 w-48"
                  disabled
                />
              </div>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Style Code</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Description</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Customer</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Season</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-600">Design Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Assigned To</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Due Date</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                  <Palette className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                  <p className="text-sm font-medium text-gray-500">Design page coming soon</p>
                  <p className="text-xs text-gray-400 mt-1">This section is under development</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
