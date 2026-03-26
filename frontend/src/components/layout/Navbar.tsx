'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Table2, Settings, LogOut, User, FileSpreadsheet, BarChart3, Palette, ShoppingBag, Truck } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'internal', 'sourcelab_designer', 'supplier'] },
  { href: '/orders', label: 'Orders', icon: Table2, roles: ['admin', 'internal', 'supplier'] },
  { href: '/factory-product', label: 'Factory Product', icon: ShoppingBag, roles: ['admin', 'supplier'] },
  { href: '/factory-shipping', label: 'Factory Shipping', icon: Truck, roles: ['admin', 'supplier'] },
  { href: '/design', label: 'Design', icon: Palette, roles: ['admin', 'internal', 'sourcelab_designer'] },
  { href: '/analytics', label: 'Analytics', icon: BarChart3, roles: ['admin', 'internal'] },
  { href: '/import', label: 'Import', icon: FileSpreadsheet, roles: ['admin', 'internal'] },
  { href: '/settings', label: 'Settings', icon: Settings, roles: ['admin', 'internal', 'sourcelab_designer', 'supplier'] },
];

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useStore();

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Left side - Logo and Nav */}
          <div className="flex items-center gap-8">
            {/* Logo */}
            <Link href="/dashboard" className="flex flex-col items-start justify-center -space-y-0.5">
              <img
                src="/sourcelab-logo.png"
                alt="Source Lab"
                className="h-7"
              />
              <span className="text-xs font-semibold text-gray-900">
                Critical Path
              </span>
            </Link>

            {/* Navigation Links */}
            <div className="flex items-center gap-1">
              {navItems
                .filter((item) => user?.role && item.roles.includes(user.role))
                .map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-primary-50 text-primary-700'
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="hidden sm:block">{item.label}</span>
                    </Link>
                  );
                })}
            </div>
          </div>

          {/* Right side - User info and Logout */}
          <div className="flex items-center gap-4">
            {/* User Info */}
            <div className="flex items-center gap-2 text-sm">
              <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                <User className="w-4 h-4 text-gray-600" />
              </div>
              <div className="hidden md:block">
                <p className="font-medium text-gray-900">{user?.username}</p>
                <p className="text-xs text-gray-500 capitalize">
                  {user?.role === 'admin' ? 'Admin' : user?.role === 'internal' ? 'Internal User' : user?.role === 'sourcelab_designer' ? 'Designer' : 'Supplier'}
                </p>
              </div>
            </div>

            {/* Role Badge */}
            <span
              className={cn(
                'px-2 py-1 rounded-full text-xs font-medium hidden lg:block',
                user?.role === 'internal' || user?.role === 'admin'
                  ? 'bg-primary-100 text-primary-700'
                  : user?.role === 'sourcelab_designer'
                  ? 'bg-violet-100 text-violet-700'
                  : 'bg-teal-100 text-teal-700'
              )}
            >
              {user?.role === 'internal' || user?.role === 'admin' ? 'Full Access' : user?.role === 'sourcelab_designer' ? 'Designer' : 'Limited Access'}
            </span>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:block text-sm font-medium">Logout</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
