'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  AlertCircle,
  CheckCircle,
  Loader2,
  ShieldCheck,
  User as UserIcon,
  Building2,
  Users,
  Plus,
  Trash2,
  Edit2,
  X,
  KeyRound,
  Search,
  Eye,
  EyeOff,
  Settings as SettingsIcon,
  Mail,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider } from '@/components/layout/AuthProvider';
import { useStore } from '@/store/useStore';
import { usersApi, factoriesApi, settingsApi, ColumnSetting } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { User } from '@/types';
import { COLUMNS } from '@/types';

type Tab = 'account' | 'users' | 'columns' | 'fields';

export default function SettingsPage() {
  return (
    <AuthProvider>
      <SettingsContent />
    </AuthProvider>
  );
}

function SettingsContent() {
  const { user } = useStore();
  const [activeTab, setActiveTab] = useState<Tab>('account');

  // User management state
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);
  const [factories, setFactories] = useState<string[]>([]);
  const [userSearch, setUserSearch] = useState('');

  // Role column settings state
  const [supplierColumns, setSupplierColumns] = useState<ColumnSetting[]>([]);
  const [loadingColumns, setLoadingColumns] = useState(false);
  const [savingColumns, setSavingColumns] = useState(false);
  const [columnSearch, setColumnSearch] = useState('');

  const isInternal = user?.role === 'internal' || user?.role === 'admin';
  const isDesigner = user?.role === 'sourcelab_designer';
  const isFullInternal = isInternal && !isDesigner;

  useEffect(() => {
    if (isInternal) {
      loadUsers();
      loadFactories();
      loadSupplierColumns();
    }
  }, [isInternal]);

  const loadSupplierColumns = async () => {
    setLoadingColumns(true);
    try {
      const response = await settingsApi.getRoleColumns('supplier');
      setSupplierColumns(response.columns);
    } catch (error) {
      console.error('Failed to load supplier column settings:', error);
    } finally {
      setLoadingColumns(false);
    }
  };

  const loadFactories = async () => {
    try {
      const response = await factoriesApi.getFactories();
      setFactories(response.factories);
    } catch (error) {
      console.error('Failed to load factories:', error);
    }
  };

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const userList = await usersApi.getUsers();
      setUsers(userList);
    } catch (error) {
      toast.error('Failed to load users');
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleSaveColumnSettings = async () => {
    setSavingColumns(true);
    try {
      await settingsApi.updateRoleColumns('supplier', supplierColumns);
      toast.success('Column settings saved');
    } catch {
      toast.error('Failed to save');
    } finally {
      setSavingColumns(false);
    }
  };

  const handleDeleteUser = async (u: User) => {
    if (!confirm(`Delete user "${u.username}"?`)) return;
    try {
      await usersApi.deleteUser(u.id);
      toast.success('User deleted');
      loadUsers();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to delete');
    }
  };

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      u.username.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.factory_name || '').toLowerCase().includes(q)
    );
  }, [users, userSearch]);

  const userStats = useMemo(() => ({
    total: users.length,
    admin: users.filter(u => u.role === 'admin').length,
    internal: users.filter(u => u.role === 'internal').length,
    designer: users.filter(u => u.role === 'sourcelab_designer').length,
    supplier: users.filter(u => u.role === 'supplier').length,
    inactive: users.filter(u => !u.is_active).length,
  }), [users]);

  const tabs: { key: Tab; label: string; icon: React.ElementType; show: boolean }[] = [
    { key: 'account', label: 'My Account', icon: UserIcon, show: true },
    { key: 'users', label: 'Users', icon: Users, show: isFullInternal },
    { key: 'columns', label: 'Supplier Columns', icon: SettingsIcon, show: isFullInternal },
    { key: 'fields', label: 'Field Reference', icon: CheckCircle, show: true },
  ];

  return (
    <AppShell title="Settings">
      <div>
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your account, users, and role permissions</p>
        </div>

        <div className="grid grid-cols-[220px_1fr] gap-6">
          {/* Sidebar Tabs */}
          <aside className="sticky top-[72px] self-start">
            <nav className="space-y-1">
              {tabs.filter(t => t.show).map(t => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.key}
                    onClick={() => setActiveTab(t.key)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      activeTab === t.key
                        ? 'bg-primary-50 text-primary-700'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {t.label}
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Content */}
          <main className="min-w-0">
            {activeTab === 'account' && <AccountTab user={user} isDesigner={isDesigner} isInternal={isInternal} isFullInternal={isFullInternal} />}

            {activeTab === 'users' && isFullInternal && (
              <UsersTab
                users={filteredUsers}
                loadingUsers={loadingUsers}
                userSearch={userSearch}
                setUserSearch={setUserSearch}
                userStats={userStats}
                currentUserId={user?.id}
                onAdd={() => setShowAddUserModal(true)}
                onEdit={setEditingUser}
                onResetPassword={setResetPasswordUser}
                onDelete={handleDeleteUser}
              />
            )}

            {activeTab === 'columns' && isFullInternal && (
              <ColumnsTab
                supplierColumns={supplierColumns}
                setSupplierColumns={setSupplierColumns}
                loadingColumns={loadingColumns}
                savingColumns={savingColumns}
                onSave={handleSaveColumnSettings}
                search={columnSearch}
                setSearch={setColumnSearch}
              />
            )}

            {activeTab === 'fields' && <FieldReferenceTab />}
          </main>
        </div>
      </div>

      {/* Add User Modal */}
      {showAddUserModal && (
        <AddUserModal
          factories={factories}
          onClose={() => setShowAddUserModal(false)}
          onCreated={() => { setShowAddUserModal(false); loadUsers(); }}
        />
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <EditUserModal
          user={editingUser}
          factories={factories}
          onClose={() => setEditingUser(null)}
          onUpdated={() => { setEditingUser(null); loadUsers(); }}
        />
      )}

      {/* Reset Password Modal */}
      {resetPasswordUser && (
        <ResetPasswordModal
          user={resetPasswordUser}
          onClose={() => setResetPasswordUser(null)}
        />
      )}
    </AppShell>
  );
}

// ─── Account Tab ─────────────────────────────────────────────
function AccountTab({ user, isDesigner, isInternal, isFullInternal }: { user: any; isDesigner: boolean; isInternal: boolean; isFullInternal: boolean }) {
  const roleLabel = isDesigner ? 'Designer' : user?.role === 'admin' ? 'Admin' : isInternal ? 'Internal User' : 'Supplier';
  const roleColor = user?.role === 'admin'
    ? 'bg-purple-100 text-purple-700'
    : isDesigner
    ? 'bg-violet-100 text-violet-700'
    : isInternal
    ? 'bg-primary-100 text-primary-700'
    : 'bg-teal-100 text-teal-700';

  const initials = user?.username ? user.username.slice(0, 2).toUpperCase() : '??';

  return (
    <div className="space-y-6">
      {/* Profile Card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-start gap-5">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-xl font-bold shadow-sm flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-lg font-bold text-gray-900">{user?.username}</h2>
              <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', roleColor)}>
                <ShieldCheck className="w-3 h-3 inline mr-1" />
                {roleLabel}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
              <Mail className="w-3.5 h-3.5" />
              {user?.email}
            </div>
            {user?.factory_name && (
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <Building2 className="w-3.5 h-3.5 text-gray-400" />
                <span>{user.factory_name}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Permissions */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-gray-500" />
            Your Permissions
          </h3>
        </div>
        <div className="divide-y divide-gray-100">
          <PermissionRow label="View all columns" allowed={isFullInternal} description="Full access to all order data" />
          <PermissionRow label="Edit all fields" allowed={isFullInternal} description="Can edit any order field" />
          <PermissionRow label="Upload Excel files" allowed={isFullInternal} description="Can import orders from Excel" />
          <PermissionRow label="Export to Excel" allowed={isFullInternal} description="Download orders as Excel file" />
          <PermissionRow label="Manage users" allowed={isFullInternal} description="Add, edit, and remove user accounts" />
          <PermissionRow label="Access Design page" allowed={isDesigner || isInternal} description="View and manage design tasks" />
        </div>
      </div>
    </div>
  );
}

function PermissionRow({ label, allowed, description }: { label: string; allowed: boolean; description: string }) {
  return (
    <div className="flex items-start gap-3 px-5 py-3">
      <div className={cn('w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5', allowed ? 'bg-green-100' : 'bg-gray-100')}>
        {allowed ? <CheckCircle className="w-3.5 h-3.5 text-green-600" /> : <AlertCircle className="w-3.5 h-3.5 text-gray-400" />}
      </div>
      <div className="flex-1">
        <p className={cn('text-sm font-medium', allowed ? 'text-gray-900' : 'text-gray-500')}>{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{description}</p>
      </div>
    </div>
  );
}

// ─── Users Tab ─────────────────────────────────────────────
function UsersTab({
  users, loadingUsers, userSearch, setUserSearch, userStats, currentUserId, onAdd, onEdit, onResetPassword, onDelete
}: any) {
  return (
    <div className="space-y-5">
      {/* Stats bar */}
      <div className="grid grid-cols-5 gap-3">
        <StatPill label="Total" value={userStats.total} color="bg-gray-100 text-gray-700" />
        <StatPill label="Admin" value={userStats.admin} color="bg-purple-100 text-purple-700" />
        <StatPill label="Internal" value={userStats.internal} color="bg-primary-100 text-primary-700" />
        <StatPill label="Designer" value={userStats.designer} color="bg-violet-100 text-violet-700" />
        <StatPill label="Supplier" value={userStats.supplier} color="bg-teal-100 text-teal-700" />
      </div>

      {/* Header + search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search users by name, email, or factory..."
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        <button onClick={onAdd} className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700">
          <Plus className="w-4 h-4" />
          Add User
        </button>
      </div>

      {/* User cards */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {loadingUsers ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-400">No users found</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {users.map((u: User) => (
              <UserRow
                key={u.id}
                user={u}
                isMe={u.id === currentUserId}
                onEdit={() => onEdit(u)}
                onResetPassword={() => onResetPassword(u)}
                onDelete={() => onDelete(u)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      <div className="flex items-center justify-between mt-1">
        <span className="text-2xl font-bold text-gray-900">{value}</span>
        <span className={cn('w-2 h-2 rounded-full', color.replace('text-', 'bg-').split(' ')[0].replace('bg-', 'bg-'))}></span>
      </div>
    </div>
  );
}

function UserRow({ user: u, isMe, onEdit, onResetPassword, onDelete }: any) {
  const roleColor =
    u.role === 'admin' ? 'bg-purple-100 text-purple-700' :
    u.role === 'internal' ? 'bg-primary-100 text-primary-700' :
    u.role === 'sourcelab_designer' ? 'bg-violet-100 text-violet-700' :
    'bg-teal-100 text-teal-700';

  const initials = u.username.slice(0, 2).toUpperCase();
  const roleLabel = u.role === 'sourcelab_designer' ? 'Designer' : u.role.charAt(0).toUpperCase() + u.role.slice(1);

  return (
    <div className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors">
      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center text-xs font-bold text-gray-600 flex-shrink-0">
        {initials}
      </div>
      <div className="flex-1 min-w-0 grid grid-cols-[1fr_auto_auto_auto] items-center gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900 truncate">{u.username}</span>
            {isMe && <span className="text-[10px] bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded font-semibold">YOU</span>}
            {!u.is_active && <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-semibold">INACTIVE</span>}
          </div>
          <p className="text-xs text-gray-400 truncate">{u.email}</p>
        </div>
        <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', roleColor)}>
          {roleLabel}
        </span>
        <div className="text-xs text-gray-400 min-w-[120px] text-right">
          {u.factory_name ? (
            <span className="flex items-center gap-1 justify-end">
              <Building2 className="w-3 h-3" />
              {u.factory_name}
            </span>
          ) : (
            <span className="text-gray-300">—</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <IconButton onClick={onEdit} title="Edit user" icon={Edit2} />
          <IconButton onClick={onResetPassword} title="Reset password" icon={KeyRound} />
          {!isMe && <IconButton onClick={onDelete} title="Delete user" icon={Trash2} danger />}
        </div>
      </div>
    </div>
  );
}

function IconButton({ onClick, title, icon: Icon, danger }: { onClick: () => void; title: string; icon: React.ElementType; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'p-1.5 rounded-lg transition-colors',
        danger
          ? 'text-gray-400 hover:text-red-600 hover:bg-red-50'
          : 'text-gray-400 hover:text-primary-600 hover:bg-primary-50'
      )}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}

// ─── Columns Tab ─────────────────────────────────────────────
function ColumnsTab({ supplierColumns, setSupplierColumns, loadingColumns, savingColumns, onSave, search, setSearch }: any) {
  const sizeColumnKeys = ['size_2xs', 'size_xs', 'size_s', 'size_m', 'size_l', 'size_xl', 'size_2xl', 'size_3xl', 'size_4xl', 'size_5xl', 'size_11', 'size_12', 'size_13', 'size_14'];

  const handleVisibilityChange = (columnKey: string, isVisible: boolean) => {
    if (columnKey === 'sizes_group') {
      setSupplierColumns((prev: ColumnSetting[]) =>
        prev.map(col => sizeColumnKeys.includes(col.column_key) ? { ...col, is_visible: isVisible, is_editable: isVisible ? col.is_editable : false } : col)
      );
    } else {
      setSupplierColumns((prev: ColumnSetting[]) =>
        prev.map(col => col.column_key === columnKey ? { ...col, is_visible: isVisible, is_editable: isVisible ? col.is_editable : false } : col)
      );
    }
  };

  const handleEditableChange = (columnKey: string, isEditable: boolean) => {
    if (columnKey === 'sizes_group') {
      setSupplierColumns((prev: ColumnSetting[]) =>
        prev.map(col => sizeColumnKeys.includes(col.column_key) ? { ...col, is_editable: isEditable } : col)
      );
    } else {
      setSupplierColumns((prev: ColumnSetting[]) =>
        prev.map(col => col.column_key === columnKey ? { ...col, is_editable: isEditable } : col)
      );
    }
  };

  const displayColumns = useMemo(() => {
    const nonSize = supplierColumns.filter((col: ColumnSetting) => !sizeColumnKeys.includes(col.column_key));
    const sizeCols = supplierColumns.filter((col: ColumnSetting) => sizeColumnKeys.includes(col.column_key));
    const allSizesVisible = sizeCols.length > 0 && sizeCols.every((col: ColumnSetting) => col.is_visible);
    const allSizesEditable = sizeCols.length > 0 && sizeCols.every((col: ColumnSetting) => col.is_editable);

    const result: any[] = [];
    for (const col of nonSize) {
      result.push(col);
      if (col.column_key === 'gender' && sizeCols.length > 0) {
        result.push({ column_key: 'sizes_group', is_visible: allSizesVisible, is_editable: allSizesEditable, isGroup: true });
      }
    }
    return result;
  }, [supplierColumns]);

  const filteredColumns = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return displayColumns;
    return displayColumns.filter((col: any) => {
      const isGroup = col.isGroup;
      const label = isGroup ? 'Sizes (2XS - 5XL)' : (COLUMNS.find(c => c.key === col.column_key)?.label || col.column_key);
      return label.toLowerCase().includes(q) || col.column_key.toLowerCase().includes(q);
    });
  }, [displayColumns, search]);

  const visibleCount = supplierColumns.filter((c: ColumnSetting) => c.is_visible).length;
  const editableCount = supplierColumns.filter((c: ColumnSetting) => c.is_editable).length;

  return (
    <div className="space-y-5">
      {/* Summary + Save */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Supplier Column Permissions</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {visibleCount} visible · {editableCount} editable of {supplierColumns.length} columns
          </p>
        </div>
        <button
          onClick={onSave}
          disabled={savingColumns}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
        >
          {savingColumns ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
          ) : (
            <><CheckCircle className="w-4 h-4" /> Save Changes</>
          )}
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Search columns..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
      </div>

      {/* Column list */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {loadingColumns ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : filteredColumns.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-400">No columns match your search</div>
        ) : (
          <>
            {/* Header */}
            <div className="grid grid-cols-[1fr_100px_100px] px-5 py-2.5 border-b border-gray-100 bg-gray-50/60 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
              <div>Column</div>
              <div className="text-center">Visible</div>
              <div className="text-center">Editable</div>
            </div>
            <div className="divide-y divide-gray-50 max-h-[600px] overflow-y-auto">
              {filteredColumns.map((col: any) => {
                const isGroup = 'isGroup' in col && col.isGroup;
                const columnDef = !isGroup ? COLUMNS.find(c => c.key === col.column_key) : null;
                const label = isGroup ? 'Sizes (2XS – 5XL)' : (columnDef?.label || col.column_key);

                return (
                  <div
                    key={col.column_key}
                    className={cn(
                      'grid grid-cols-[1fr_100px_100px] items-center px-5 py-2.5 transition-colors',
                      isGroup ? 'bg-blue-50/40 hover:bg-blue-50' : 'hover:bg-gray-50'
                    )}
                  >
                    <div className="min-w-0">
                      <span className={cn('text-sm font-medium', isGroup ? 'text-blue-800' : 'text-gray-900')}>{label}</span>
                      {!isGroup && columnDef && (
                        <span className="text-[10px] text-gray-400 ml-2 font-mono">{col.column_key}</span>
                      )}
                    </div>
                    <div className="flex justify-center">
                      <Toggle checked={col.is_visible} onChange={(v) => handleVisibilityChange(col.column_key, v)} />
                    </div>
                    <div className="flex justify-center">
                      <Toggle checked={col.is_editable} onChange={(v) => handleEditableChange(col.column_key, v)} disabled={!col.is_visible} />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={cn(
        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0',
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
        checked ? 'bg-primary-500' : 'bg-gray-200'
      )}
    >
      <span className={cn('inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform', checked ? 'translate-x-5' : 'translate-x-1')} />
    </button>
  );
}

// ─── Add User Modal ─────────────────────────────────────────────
function AddUserModal({ factories, onClose, onCreated }: { factories: string[]; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    role: 'supplier' as 'admin' | 'internal' | 'supplier' | 'sourcelab_designer',
    factory_name: '',
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async () => {
    if (!form.username || !form.email || !form.password) {
      toast.error('Please fill in username, email, and password');
      return;
    }
    setSubmitting(true);
    try {
      await usersApi.createUser({ ...form, factory_name: form.role === 'supplier' ? form.factory_name : undefined });
      toast.success('User created');
      onCreated();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to create user');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-scale-in overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary-100 rounded-lg flex items-center justify-center">
              <Plus className="w-4 h-4 text-primary-600" />
            </div>
            <h3 className="text-base font-bold text-gray-900">Add New User</h3>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <Field label="Username" required>
            <input type="text" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="input" placeholder="Enter username" />
          </Field>
          <Field label="Email" required>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" placeholder="user@example.com" />
          </Field>
          <Field label="Password" required>
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="input" placeholder="At least 8 characters" />
          </Field>
          <Field label="Role" required>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as any })} className="input">
              <option value="supplier">Supplier</option>
              <option value="internal">Internal</option>
              <option value="sourcelab_designer">Designer</option>
              <option value="admin">Admin</option>
            </select>
          </Field>
          {form.role === 'supplier' && (
            <Field label="Factory">
              <select value={form.factory_name} onChange={(e) => setForm({ ...form, factory_name: e.target.value })} className="input">
                <option value="">Select a factory...</option>
                {factories.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </Field>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100 bg-gray-50/60">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button onClick={submit} disabled={submitting} className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create User
          </button>
        </div>
      </div>

      <style jsx>{`.input { width: 100%; padding: 0.5rem 0.75rem; font-size: 0.875rem; border: 1px solid #e5e7eb; border-radius: 0.5rem; background: white; }
      .input:focus { outline: none; border-color: transparent; box-shadow: 0 0 0 2px rgb(59 130 246 / 0.3); }`}</style>
    </div>
  );
}

// ─── Edit User Modal ─────────────────────────────────────────────
function EditUserModal({ user: u, factories, onClose, onUpdated }: { user: User; factories: string[]; onClose: () => void; onUpdated: () => void }) {
  const [role, setRole] = useState(u.role);
  const [factoryName, setFactoryName] = useState(u.factory_name || '');
  const [isActive, setIsActive] = useState(u.is_active);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async () => {
    setSubmitting(true);
    try {
      await usersApi.updateUser(u.id, {
        role,
        factory_name: role === 'supplier' ? factoryName || undefined : undefined,
        is_active: isActive,
      });
      toast.success('User updated');
      onUpdated();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to update');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-scale-in overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary-100 rounded-lg flex items-center justify-center">
              <Edit2 className="w-4 h-4 text-primary-600" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Edit User</h3>
              <p className="text-xs text-gray-500">{u.username} · {u.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <Field label="Role">
            <select value={role} onChange={(e) => setRole(e.target.value as any)} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="supplier">Supplier</option>
              <option value="internal">Internal</option>
              <option value="sourcelab_designer">Designer</option>
              <option value="admin">Admin</option>
            </select>
          </Field>
          {role === 'supplier' && (
            <Field label="Factory">
              <select value={factoryName} onChange={(e) => setFactoryName(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500">
                <option value="">No factory</option>
                {factories.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </Field>
          )}
          <div className="flex items-center justify-between py-2 border-t border-gray-100 pt-4">
            <div>
              <p className="text-sm font-medium text-gray-900">Active</p>
              <p className="text-xs text-gray-400">Inactive users cannot log in</p>
            </div>
            <Toggle checked={isActive} onChange={setIsActive} />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100 bg-gray-50/60">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button onClick={submit} disabled={submitting} className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Reset Password Modal ─────────────────────────────────────────────
function ResetPasswordModal({ user: u, onClose }: { user: User; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async () => {
    if (password.length < 4) { toast.error('Password must be at least 4 characters'); return; }
    setSubmitting(true);
    try {
      await usersApi.updateUser(u.id, { password });
      toast.success('Password reset');
      onClose();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to reset');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-scale-in overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
              <KeyRound className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Reset Password</h3>
              <p className="text-xs text-gray-500">for {u.username}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
        <div className="p-5">
          <Field label="New Password">
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                placeholder="Enter new password"
                autoFocus
                className="w-full pl-3 pr-10 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <button onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </Field>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100 bg-gray-50/60">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button onClick={submit} disabled={submitting || password.length < 4} className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 flex items-center gap-2">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            Reset Password
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

// ─── Field Reference Tab ─────────────────────────────────────────────

type FieldSection = {
  title: string;
  description?: string;
  fields: {
    label: string;
    key: string;
    type: 'text' | 'date' | 'number' | 'currency' | 'dropdown';
    description: string;
    editable?: string; // who can edit
    autoCalc?: string; // auto-calc formula
    options?: string[];
  }[];
};

const FIELD_SECTIONS: FieldSection[] = [
  {
    title: 'PO Identifiers',
    description: 'Core identifying information for each order',
    fields: [
      { label: 'PO#', key: 'po_number', type: 'text', description: 'Purchase order number — unique identifier for the order group.', editable: 'Admin / Internal' },
      { label: 'SL System PO#', key: 'system_po_number', type: 'text', description: 'Internal Source Lab system reference (hidden from suppliers).', editable: 'Admin / Internal' },
      { label: 'Customer', key: 'customer', type: 'text', description: 'End customer for the order.', editable: 'Admin / Internal' },
      { label: 'Order Reference', key: 'china_orderbook_ref', type: 'text', description: 'China orderbook reference.', editable: 'Admin / Internal' },
      { label: 'Customer PO#', key: 'customer_po_number', type: 'text', description: "Customer's own PO reference.", editable: 'Admin / Internal' },
      { label: 'Direct Repeat / New', key: 'direct_repeat_new', type: 'text', description: 'Marks whether an order is direct, a repeat, or new.' },
      { label: 'Season', key: 'season', type: 'text', description: 'Season designation (e.g. SS26, FW26).' },
      { label: 'Supplier', key: 'factory', type: 'text', description: 'Factory producing the order.' },
      { label: 'Terms', key: 'terms', type: 'text', description: 'Shipping/trade terms (e.g. FOB, CIF).' },
      { label: 'SL Sales Person', key: 'sales_person', type: 'text', description: 'Source Lab sales representative.' },
    ],
  },
  {
    title: 'Product Details',
    fields: [
      { label: 'Style Code', key: 'style_code', type: 'text', description: 'Internal style identifier. Combined with PO# to uniquely identify a row.' },
      { label: 'Cust Style Code', key: 'customer_style_code', type: 'text', description: "Customer's style code." },
      { label: 'Description', key: 'description', type: 'text', description: 'Product description.' },
      { label: 'Colour', key: 'colour', type: 'text', description: 'Product colour.' },
      { label: 'Gender', key: 'gender', type: 'text', description: 'Gender/size-range code (e.g. 001-MENS/ADULTS, 002-LADIES). Determines which size labels appear in the size breakdown.' },
    ],
  },
  {
    title: 'Financial',
    fields: [
      { label: 'Total Qty', key: 'total_quantity', type: 'number', description: 'Total units across all sizes.', autoCalc: 'Sum of all size columns' },
      { label: 'Factory Cost Price', key: 'trade_price', type: 'currency', description: 'Unit cost from the factory. Hidden from suppliers and designers.' },
      { label: 'Total Order Cost', key: 'total_order_value', type: 'currency', description: 'Total order value. Hidden from suppliers and designers.', autoCalc: 'Trade Price × Total Qty' },
    ],
  },
  {
    title: 'Order Flow Dates',
    description: 'Key dates in the order-to-factory workflow',
    fields: [
      { label: 'Order Received', key: 'order_received_date', type: 'date', description: 'When the order was received from the customer. Hidden from suppliers.' },
      { label: 'Sent to Factory', key: 'order_sent_to_factory_date', type: 'date', description: 'When the order was sent to the factory. Triggers tech pack / specs warnings.' },
      { label: 'Tech Packs Sent', key: 'tech_packs_sent_to_factory', type: 'date', description: 'When tech packs were sent to the factory. Baseline for sample due-date warnings.' },
      { label: 'Specs Sent', key: 'specs_sent_to_factory', type: 'date', description: 'When specs were sent to the factory.' },
      { label: 'Barcodes Sent', key: 'barcodes_sent_to_factory', type: 'date', description: 'When barcodes were sent to the factory.' },
      { label: 'Requested Ex-Fac', key: 'original_po_ex_factory', type: 'date', description: "Customer's originally requested ex-factory date." },
      { label: 'Factory Confirmed Ex-Fac', key: 'factory_confirmed_ex_factory', type: 'date', description: 'Factory\'s confirmed ex-factory date. Editable by suppliers (goes through approval).' },
      { label: 'Revised Ex-Fac', key: 'revised_po_ex_factory', type: 'date', description: 'Revised ex-factory date. Editable by suppliers (goes through approval). Defaults to Factory Confirmed if blank.', autoCalc: 'Falls back to Factory Confirmed Ex-Fac when empty' },
    ],
  },
  {
    title: 'Samples — Fit',
    description: 'Fit sample tracking (per-style, or per-component if components exist)',
    fields: [
      { label: 'Fit Sample Req', key: 'fit_sample_required', type: 'text', description: 'Y/N whether a fit sample is required.' },
      { label: 'Fit Sample Status', key: 'fit_sample_status', type: 'dropdown', description: 'Current fit sample status.', options: ['NOT REQUIRED', 'APPROVED', 'OUTSTANDING', 'P23 ADVISE UPDATE', 'LATE', 'RECEIVED'] },
      { label: 'Fit Sample Rcvd', key: 'fit_sample_received', type: 'date', description: 'Date the fit sample was received.' },
      { label: 'Fit Sample Appr', key: 'fit_sample_approved', type: 'date', description: 'Date the fit sample was approved.' },
    ],
  },
  {
    title: 'Samples — Strike Off',
    fields: [
      { label: 'Strike Off Status', key: 'strike_off_status', type: 'dropdown', description: 'Current strike off status.', options: ['NOT REQUIRED', 'OUTSTANDING', 'P23 ADVISE UPDATE', 'LATE', 'RECEIVED', 'APPROVED'] },
      { label: 'Strike Off Rcvd', key: 'strike_off_received', type: 'date', description: 'Date strike off was received.' },
      { label: 'Strike Off Appr', key: 'strike_off_approved', type: 'date', description: 'Date strike off was approved.' },
    ],
  },
  {
    title: 'Samples — Lab Dip',
    fields: [
      { label: 'Lab Dip Status', key: 'lab_dip_status', type: 'dropdown', description: 'Current lab dip status.', options: ['NOT REQUIRED', 'OUTSTANDING', 'P23 ADVISE UPDATE', 'LATE', 'RECEIVED', 'APPROVED'] },
      { label: 'Lab Dip Rcvd', key: 'lab_dip_received', type: 'date', description: 'Date lab dip was received.' },
      { label: 'Lab Dip Appr', key: 'lab_dip_approved', type: 'date', description: 'Date lab dip was approved.' },
    ],
  },
  {
    title: 'Samples — PPS',
    fields: [
      { label: 'PPS Status', key: 'pps_status', type: 'dropdown', description: 'Current PPS status.', options: ['NOT REQUIRED', 'OUTSTANDING', 'P23 ADVISE UPDATE', 'LATE', 'RECEIVED', 'APPROVED'] },
      { label: 'PPS Received', key: 'pps_received', type: 'date', description: 'Date PPS was received.' },
      { label: 'PPS Sent to Cust', key: 'pps_sent_to_customer', type: 'date', description: 'Date PPS was sent to the customer.' },
      { label: 'PPS Approved', key: 'pps_approved', type: 'date', description: 'Date PPS was approved.' },
    ],
  },
  {
    title: 'Other Samples',
    fields: [
      { label: 'Photo Sample Rcvd', key: 'photo_sample_received', type: 'date', description: 'Date photo sample was received.' },
      { label: 'Ex-Fac from PP Appr', key: 'ex_factory_from_pp_approval', type: 'date', description: 'Calculated ex-factory date based on PPS approval.', autoCalc: 'PPS Approved + 35 days' },
      { label: 'Shipment Sample Rcvd', key: 'shipment_sample_received', type: 'date', description: 'Date shipment sample was received.' },
    ],
  },
  {
    title: 'Delivery Dates',
    fields: [
      { label: 'Cust Req Delivery', key: 'original_del_date_to_customer', type: 'date', description: 'Customer-requested delivery date.' },
      { label: 'ETA UK', key: 'eta_to_uk', type: 'date', description: 'Estimated arrival to UK.', autoCalc: 'Revised Ex-Fac + 60 days' },
      { label: 'ETA Customer', key: 'eta_to_customer', type: 'date', description: 'Estimated arrival to customer.', autoCalc: 'ETA UK + 5 days' },
      { label: 'PO Open Month', key: 'customer_po_open_month', type: 'text', description: 'Month name from Customer Requested Delivery.', autoCalc: 'Month of Cust Req Delivery (e.g. "February")' },
      { label: 'Exp Cust Del Month', key: 'expected_dispatch_arrive_uk_month', type: 'text', description: 'Expected customer delivery month.', autoCalc: 'Month of ETA Customer' },
    ],
  },
  {
    title: 'Shipping & Vessel',
    fields: [
      { label: 'FCL / LCL', key: 'fcl_lcl', type: 'dropdown', description: 'Shipping container type (FCL, LCL, or AIR). Affects Estimated Del calculation.', options: ['FCL', 'LCL', 'AIR'] },
      { label: 'Vessel Name', key: 'vessel_name', type: 'text', description: 'Name of the shipping vessel.' },
      { label: 'Vessel ETD', key: 'vessel_etd', type: 'date', description: 'Estimated departure date of the vessel. Editable by suppliers (goes through approval).' },
      { label: 'Vessel ETA to Port', key: 'vessel_eta_to_port', type: 'date', description: 'Estimated arrival of the vessel at port. Editable by suppliers (goes through approval).' },
      { label: 'Revised Vessel ETA', key: 'revised_vessel_eta_to_port', type: 'date', description: 'Revised vessel ETA to port. Bulk-updatable from the Tracking page.' },
      { label: 'Est Del to Cust', key: 'estimated_del_to_customer', type: 'date', description: 'Estimated delivery to customer based on vessel ETA and shipping type.', autoCalc: 'Vessel ETA + 5d (FCL) / 7d (LCL) / 2d (AIR)' },
      { label: 'Tracking Ref', key: 'tracking_reference', type: 'text', description: 'Shipment tracking reference (P number). Used by the Tracking page.' },
    ],
  },
  {
    title: 'Status',
    fields: [
      { label: 'Status', key: 'status', type: 'text', description: 'Order status (In Production, Shipped, Delivered, etc).' },
    ],
  },
];

const WARNING_RULES = [
  { title: 'Tech Packs Need Sending', trigger: 'Order sent to factory 3+ business days ago, tech packs not sent (PO-level).' },
  { title: 'Specs Need Sending', trigger: 'Order sent to factory 3+ business days ago, specs not sent (PO-level).' },
  { title: 'Fit Sample Overdue', trigger: '3+ business weeks since tech packs sent, fit sample not received. Skips if status = NOT REQUIRED. Checks per-component if components exist.' },
  { title: 'Lab Dip Overdue', trigger: '3+ business weeks since tech packs sent, lab dip not received. Skips if status = NOT REQUIRED. Checks per-component if components exist.' },
  { title: 'Lab Dip Needs Approval', trigger: 'Lab dip received 5+ business days ago, not yet approved.' },
  { title: 'Strike Off Overdue', trigger: '4+ business weeks since tech packs sent, strike off not received. 5 weeks for components named badges / woven labels / woven tapes.' },
  { title: 'Strike Off Needs Approval', trigger: 'Strike off received 5+ business days ago, not yet approved.' },
  { title: 'PPS Needs Approval', trigger: 'PPS sent to customer 7+ business days ago, not yet approved.' },
];

function FieldReferenceTab() {
  const [search, setSearch] = useState('');

  const filteredSections = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return FIELD_SECTIONS;
    return FIELD_SECTIONS.map(section => ({
      ...section,
      fields: section.fields.filter(f =>
        f.label.toLowerCase().includes(q) ||
        f.key.toLowerCase().includes(q) ||
        f.description.toLowerCase().includes(q) ||
        (f.autoCalc || '').toLowerCase().includes(q)
      ),
    })).filter(section => section.fields.length > 0);
  }, [search]);

  const totalFields = FIELD_SECTIONS.reduce((s, sec) => s + sec.fields.length, 0);
  const autoCalcCount = FIELD_SECTIONS.reduce((s, sec) => s + sec.fields.filter(f => f.autoCalc).length, 0);

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Total Fields</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{totalFields}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Sections</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{FIELD_SECTIONS.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Auto-Calculated</p>
          <p className="text-2xl font-bold text-primary-600 mt-1">{autoCalcCount}</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Search fields, descriptions, auto-calc formulas..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
      </div>

      {/* Sections */}
      <div className="space-y-4">
        {filteredSections.map(section => (
          <div key={section.title} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/40">
              <h3 className="text-sm font-bold text-gray-900">{section.title}</h3>
              {section.description && <p className="text-xs text-gray-500 mt-0.5">{section.description}</p>}
            </div>
            <div className="divide-y divide-gray-100">
              {section.fields.map(f => (
                <div key={f.key} className="px-5 py-3 grid grid-cols-[260px_1fr] gap-4 items-start">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-semibold text-gray-900">{f.label}</p>
                      {f.autoCalc && <span className="text-[9px] font-bold bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded uppercase tracking-wider">Auto</span>}
                      {f.type === 'dropdown' && <span className="text-[9px] font-bold bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded uppercase tracking-wider">Dropdown</span>}
                    </div>
                    <p className="text-[10px] text-gray-400 font-mono">{f.key}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-700 leading-relaxed">{f.description}</p>
                    {f.autoCalc && (
                      <p className="text-[11px] text-primary-700 mt-1 flex items-start gap-1.5">
                        <span className="text-primary-500">ƒ</span>
                        <span className="font-mono">{f.autoCalc}</span>
                      </p>
                    )}
                    {f.options && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {f.options.map(opt => (
                          <span key={opt} className="text-[10px] bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded font-medium">{opt}</span>
                        ))}
                      </div>
                    )}
                    {f.editable && (
                      <p className="text-[10px] text-gray-400 mt-1">Editable by: {f.editable}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Warning Rules */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-amber-50/40">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-500" />
            Warning Rules
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">Triggers for dashboard warnings (all use business days)</p>
        </div>
        <div className="divide-y divide-gray-100">
          {WARNING_RULES.map(w => (
            <div key={w.title} className="px-5 py-3">
              <p className="text-sm font-semibold text-gray-900">{w.title}</p>
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{w.trigger}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
