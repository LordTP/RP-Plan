'use client';

import { useState } from 'react';
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
  Package,
  ShoppingBag,
  Truck,
} from 'lucide-react';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';

const navSections = [
  {
    label: 'Main',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'internal', 'sourcelab_designer', 'supplier'] },
      { href: '/orders', label: 'Orders', icon: ClipboardList, roles: ['admin', 'internal', 'supplier'] },
      { href: '/factory-product', label: 'Factory Product', icon: ShoppingBag, roles: ['admin', 'supplier'] },
      { href: '/factory-shipping', label: 'Factory Shipping', icon: Truck, roles: ['admin', 'supplier'] },
      { href: '/design', label: 'Design', icon: Palette, roles: ['admin', 'internal', 'sourcelab_designer'] },
    ],
  },
  {
    label: 'Insights',
    items: [
      { href: '/analytics', label: 'Analytics', icon: BarChart3, roles: ['admin', 'internal'] },
      { href: '/import', label: 'Import', icon: FileSpreadsheet, roles: ['admin', 'internal'] },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/settings', label: 'Settings', icon: Settings, roles: ['admin', 'internal', 'sourcelab_designer', 'supplier'] },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useStore();
  const [expanded, setExpanded] = useState(false);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  const userInitials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : '??';

  const isActivePath = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  };

  return (
    <aside
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      className={cn(
        'fixed left-0 top-0 h-screen bg-gray-900 flex flex-col z-40 transition-all duration-300 ease-in-out',
        expanded ? 'w-[220px]' : 'w-[68px]'
      )}
    >
      {/* Logo */}
      <div className={cn(
        'flex items-center gap-2.5 border-b border-white/[0.06] h-[52px] transition-all duration-300',
        expanded ? 'px-5' : 'px-0 justify-center'
      )}>
        <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center flex-shrink-0">
          <Package className="w-4 h-4 text-white" />
        </div>
        <div className={cn(
          'overflow-hidden transition-all duration-300',
          expanded ? 'w-auto opacity-100' : 'w-0 opacity-0'
        )}>
          <p className="text-white text-sm font-bold tracking-tight leading-tight whitespace-nowrap">Critical Path</p>
          <p className="text-gray-500 text-[10px] font-medium tracking-wider uppercase leading-tight whitespace-nowrap">Source Lab</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2.5 py-4 space-y-1 overflow-y-auto overflow-x-hidden">
        {navSections.map((section, idx) => {
          const visibleItems = section.items.filter(
            (item) => user?.role && item.roles.includes(user.role)
          );
          if (visibleItems.length === 0) return null;

          return (
            <div key={section.label}>
              {idx > 0 && <div className="mx-3 mb-2 border-t border-white/[0.06]" />}
              <div className="space-y-1">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = isActivePath(item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'group relative flex items-center rounded-lg text-[13px] font-medium transition-all duration-200 h-10',
                        expanded ? 'px-2.5 gap-3' : 'justify-center',
                        isActive
                          ? 'bg-primary-500/10 text-white'
                          : 'text-gray-400 hover:bg-white/[0.05] hover:text-gray-200'
                      )}
                    >
                      {isActive && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary-400 rounded-r-full" />
                      )}
                      <Icon className={cn(
                        'w-[18px] h-[18px] flex-shrink-0 transition-colors',
                        isActive ? 'text-primary-400' : 'text-gray-500 group-hover:text-gray-300'
                      )} strokeWidth={isActive ? 2 : 1.5} />
                      <span className={cn(
                        'overflow-hidden transition-all duration-300 whitespace-nowrap',
                        expanded ? 'w-auto opacity-100' : 'w-0 opacity-0'
                      )}>
                        {item.label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* User */}
      <div className="border-t border-white/[0.06] px-2.5 py-3">
        <div className={cn(
          'flex items-center transition-all duration-500 ease-in-out',
          expanded ? 'gap-3' : 'gap-0 justify-center'
        )}>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-[11px] font-bold shadow-sm shadow-primary-500/20 flex-shrink-0">
            {userInitials}
          </div>
          <div className={cn(
            'flex-1 min-w-0 overflow-hidden transition-all duration-500 ease-in-out',
            expanded ? 'max-w-[140px] opacity-100' : 'max-w-0 opacity-0'
          )}>
            <p className="text-[12px] font-medium text-white truncate">{user?.username}</p>
            <p className="text-[10px] text-gray-500 capitalize whitespace-nowrap">
              {user?.role === 'admin' ? 'Admin' : user?.role === 'internal' ? 'Internal' : user?.role === 'sourcelab_designer' ? 'Designer' : 'Supplier'}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className={cn(
              'text-gray-500 hover:text-red-400 transition-all duration-500 ease-in-out p-1 rounded-md hover:bg-white/[0.05] flex-shrink-0',
              expanded ? 'opacity-100 max-w-[30px]' : 'opacity-0 max-w-0 overflow-hidden pointer-events-none'
            )}
            title="Logout"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
