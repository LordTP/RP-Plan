'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  ClipboardList,
  Palette,
  BarChart3,
  FileSpreadsheet,
  Settings,
  LogOut,
  User,
  Menu,
  X,
  Package,
  ShoppingBag,
  Truck,
  Ship,
} from 'lucide-react';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';

import { ChevronDown, Check } from 'lucide-react';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'internal', 'sourcelab_designer', 'supplier'] },
  { href: '/orders', label: 'Orders', icon: ClipboardList, roles: ['admin', 'internal', 'supplier'] },
  { href: '/design', label: 'Design', icon: Palette, roles: ['admin', 'internal', 'sourcelab_designer'] },
  { href: '/tracking', label: 'Tracking', icon: Ship, roles: ['admin', 'internal'] },
  { href: '/analytics', label: 'Analytics', icon: BarChart3, roles: ['admin', 'internal'] },
  { href: '/import', label: 'Import', icon: FileSpreadsheet, roles: ['admin', 'internal'] },
  { href: '/settings', label: 'Settings', icon: Settings, roles: ['admin'] },
];

const factorySubItems = [
  { href: '/factory-product', label: 'Product', icon: ShoppingBag },
  { href: '/factory-shipping', label: 'Shipping', icon: Truck },
];

const factoryRoles = ['admin', 'supplier'];

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useStore();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [factoryMenuOpen, setFactoryMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const factoryRef = useRef<HTMLDivElement>(null);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  // Close user menu on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    if (userMenuOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [userMenuOpen]);

  // Close factory menu on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (factoryRef.current && !factoryRef.current.contains(e.target as Node)) {
        setFactoryMenuOpen(false);
      }
    }
    if (factoryMenuOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [factoryMenuOpen]);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    setFactoryMenuOpen(false);
  }, [pathname]);

  const isActive = (path: string) => {
    if (path === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(path);
  };

  const visibleItems = navItems.filter(
    (item) => user?.role && item.roles.includes(user.role)
  );

  const userInitials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : '??';

  const roleLabel = user?.role === 'admin'
    ? 'Admin'
    : user?.role === 'internal'
    ? 'Internal'
    : user?.role === 'sourcelab_designer'
    ? 'Designer'
    : 'Supplier';

  return (
    <>
      <header className="sticky top-0 z-40 flex h-12 items-center border-b border-gray-200 bg-white px-4">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2.5 mr-8">
          <div className="hidden sm:flex h-7 w-7 items-center justify-center rounded-lg bg-primary-600 text-white text-[10px] font-bold flex-shrink-0">
            <Package className="w-3.5 h-3.5" />
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] font-bold text-gray-900 tracking-[0.15em] uppercase leading-none">Critical Path</span>
            <span className="text-[9px] font-medium text-primary-600 tracking-[0.1em] uppercase leading-none mt-0.5">Source Lab</span>
          </div>
        </Link>

        {/* Desktop nav links */}
        <nav className="hidden md:flex items-center gap-1">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            // Insert Factory dropdown after Orders
            if (item.href === '/design' && user?.role && factoryRoles.includes(user.role)) {
              const factoryActive = pathname.startsWith('/factory-');
              return (
                <div key="factory-group" className="flex items-center gap-1">
                  {/* Factory dropdown */}
                  <div className="relative" ref={factoryRef}>
                    <button
                      onClick={() => setFactoryMenuOpen(!factoryMenuOpen)}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                        factoryActive
                          ? 'bg-primary-50 text-primary-700'
                          : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                      )}
                    >
                      <Package className="h-3.5 w-3.5" />
                      Factory
                      <ChevronDown className={cn('h-3 w-3 transition-transform', factoryMenuOpen && 'rotate-180')} />
                    </button>
                    {factoryMenuOpen && (
                      <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden w-44 z-50">
                        {factorySubItems.map(sub => {
                          const SubIcon = sub.icon;
                          const subActive = pathname === sub.href || pathname.startsWith(sub.href + '-v2');
                          return (
                            <Link
                              key={sub.href}
                              href={sub.href}
                              className={cn(
                                'flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium transition-colors',
                                subActive
                                  ? 'bg-primary-50 text-primary-700'
                                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                              )}
                            >
                              <SubIcon className="h-3.5 w-3.5" />
                              {sub.label}
                              {subActive && <Check className="h-3.5 w-3.5 ml-auto text-primary-600" />}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {/* Then render the current item (Design) */}
                  <Link
                    href={item.href}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                      active
                        ? 'bg-primary-50 text-primary-700'
                        : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {item.label}
                  </Link>
                </div>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Right side — user menu (desktop) */}
        <div className="ml-auto hidden md:flex items-center gap-2">
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 rounded-lg px-2 py-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            >
              <span className="text-xs font-medium text-gray-700">{user?.username}</span>
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-50 text-[10px] font-bold text-primary-700 ring-1 ring-primary-200">
                {userInitials}
              </div>
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-52 rounded-lg border border-gray-200 bg-white shadow-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-900">{user?.username}</p>
                  <p className="text-[10px] text-gray-400 capitalize mt-0.5">{roleLabel}</p>
                </div>
                <div className="p-1">
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="ml-auto flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 md:hidden"
        >
          {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </header>

      {/* Mobile nav drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-30 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileMenuOpen(false)} />
          <div className="absolute left-0 top-12 bottom-0 w-64 bg-white border-r border-gray-200 shadow-xl overflow-y-auto">
            <nav className="p-3 space-y-1">
              {visibleItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);

                // Insert factory sub-items before Design
                if (item.href === '/design' && user?.role && factoryRoles.includes(user.role)) {
                  return (
                    <div key="mobile-factory-group">
                      <div className="px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Factory</div>
                      {factorySubItems.map(sub => {
                        const SubIcon = sub.icon;
                        const subActive = pathname === sub.href;
                        return (
                          <Link
                            key={sub.href}
                            href={sub.href}
                            className={cn(
                              'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ml-2',
                              subActive
                                ? 'bg-primary-50 text-primary-700'
                                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                            )}
                          >
                            <SubIcon className="h-4 w-4" />
                            {sub.label}
                          </Link>
                        );
                      })}
                      <Link
                        href={item.href}
                        className={cn(
                          'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors',
                          active
                            ? 'bg-primary-50 text-primary-700'
                            : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    </div>
                  );
                }

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors',
                      active
                        ? 'bg-primary-50 text-primary-700'
                        : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="border-t border-gray-200 p-3 mt-2">
              <div className="px-4 py-2">
                <p className="text-sm font-semibold text-gray-900">{user?.username}</p>
                <p className="text-[10px] text-gray-400 capitalize mt-0.5">{roleLabel}</p>
              </div>
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
