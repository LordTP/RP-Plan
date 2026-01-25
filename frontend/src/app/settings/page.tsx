'use client';

import { useState, useEffect } from 'react';
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
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Navbar } from '@/components/layout/Navbar';
import { AuthProvider } from '@/components/layout/AuthProvider';
import { useStore } from '@/store/useStore';
import { usersApi, factoriesApi, settingsApi, ColumnSetting } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { User } from '@/types';
import { COLUMNS } from '@/types';

export default function SettingsPage() {
  return (
    <AuthProvider>
      <SettingsContent />
    </AuthProvider>
  );
}

function SettingsContent() {
  const { user } = useStore();

  // User management state
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editingFactory, setEditingFactory] = useState<string>('');
  const [factories, setFactories] = useState<string[]>([]);
  const [newUser, setNewUser] = useState({
    username: '',
    email: '',
    password: '',
    role: 'supplier' as 'admin' | 'internal' | 'supplier',
    factory_name: '',
  });

  // Role column settings state
  const [supplierColumns, setSupplierColumns] = useState<ColumnSetting[]>([]);
  const [loadingColumns, setLoadingColumns] = useState(false);
  const [savingColumns, setSavingColumns] = useState(false);

  const isInternal = user?.role === 'internal' || user?.role === 'admin';

  // Load users, factories, and role settings on mount for internal users
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

  // Size columns that should be grouped
  const sizeColumnKeys = ['size_2xs', 'size_xs', 'size_s', 'size_m', 'size_l', 'size_xl', 'size_2xl', 'size_3xl', 'size_4xl', 'size_5xl'];

  const handleColumnVisibilityChange = (columnKey: string, isVisible: boolean) => {
    // If it's the "sizes" group, update all size columns
    if (columnKey === 'sizes_group') {
      setSupplierColumns((prev) =>
        prev.map((col) =>
          sizeColumnKeys.includes(col.column_key) ? { ...col, is_visible: isVisible } : col
        )
      );
    } else {
      setSupplierColumns((prev) =>
        prev.map((col) =>
          col.column_key === columnKey ? { ...col, is_visible: isVisible } : col
        )
      );
    }
  };

  const handleColumnEditableChange = (columnKey: string, isEditable: boolean) => {
    // If it's the "sizes" group, update all size columns
    if (columnKey === 'sizes_group') {
      setSupplierColumns((prev) =>
        prev.map((col) =>
          sizeColumnKeys.includes(col.column_key) ? { ...col, is_editable: isEditable } : col
        )
      );
    } else {
      setSupplierColumns((prev) =>
        prev.map((col) =>
          col.column_key === columnKey ? { ...col, is_editable: isEditable } : col
        )
      );
    }
  };

  // Get grouped columns for display (sizes grouped into one row)
  const getDisplayColumns = () => {
    const nonSizeColumns = supplierColumns.filter((col) => !sizeColumnKeys.includes(col.column_key));
    const sizeColumns = supplierColumns.filter((col) => sizeColumnKeys.includes(col.column_key));

    // Check if all size columns have the same visibility/editable state
    const allSizesVisible = sizeColumns.length > 0 && sizeColumns.every((col) => col.is_visible);
    const allSizesEditable = sizeColumns.length > 0 && sizeColumns.every((col) => col.is_editable);

    // Insert sizes group after gender column
    const result: Array<ColumnSetting | { column_key: string; is_visible: boolean; is_editable: boolean; isGroup: true }> = [];
    for (const col of nonSizeColumns) {
      result.push(col);
      if (col.column_key === 'gender' && sizeColumns.length > 0) {
        result.push({
          column_key: 'sizes_group',
          is_visible: allSizesVisible,
          is_editable: allSizesEditable,
          isGroup: true,
        });
      }
    }
    return result;
  };

  const handleSaveColumnSettings = async () => {
    setSavingColumns(true);
    try {
      await settingsApi.updateRoleColumns('supplier', supplierColumns);
      toast.success('Supplier column settings saved');
    } catch (error) {
      toast.error('Failed to save column settings. Please try again or refresh the page.');
    } finally {
      setSavingColumns(false);
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
      toast.error('Failed to load user list. Please refresh the page.');
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleAddUser = async () => {
    if (!newUser.username || !newUser.email || !newUser.password) {
      toast.error('Please fill in username, email, and password to create a user.');
      return;
    }

    try {
      await usersApi.createUser({
        ...newUser,
        factory_name: newUser.role === 'supplier' ? newUser.factory_name : undefined,
      });
      toast.success('User created successfully');
      setShowAddUser(false);
      setNewUser({ username: '', email: '', password: '', role: 'supplier', factory_name: '' });
      loadUsers();
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Failed to create user';
      toast.error(message);
    }
  };

  const handleUpdateUser = async (userId: number, updates: { role?: string; factory_name?: string; is_active?: boolean }) => {
    try {
      await usersApi.updateUser(userId, updates);
      toast.success('User updated successfully');
      setEditingUser(null);
      setEditingFactory('');
      loadUsers();
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Failed to update user';
      toast.error(message);
    }
  };

  const handleDeleteUser = async (userId: number, username: string) => {
    if (!confirm(`Are you sure you want to delete user "${username}"?`)) {
      return;
    }

    try {
      await usersApi.deleteUser(userId);
      toast.success('User deleted successfully');
      loadUsers();
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Failed to delete user';
      toast.error(message);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-8">Settings</h1>

        {/* User Info Card */}
        <div className="card p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <UserIcon className="w-5 h-5" />
            Account Information
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-500 mb-1">Username</label>
              <p className="font-medium text-gray-900">{user?.username}</p>
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">Email</label>
              <p className="font-medium text-gray-900">{user?.email}</p>
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">Role</label>
              <span
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-1 rounded-full text-sm font-medium',
                  isInternal
                    ? 'bg-primary-100 text-primary-700'
                    : 'bg-teal-100 text-teal-700'
                )}
              >
                <ShieldCheck className="w-4 h-4" />
                {isInternal ? 'Internal User' : 'Supplier'}
              </span>
            </div>
            {user?.company_name && (
              <div>
                <label className="block text-sm text-gray-500 mb-1">Company</label>
                <p className="font-medium text-gray-900 flex items-center gap-1">
                  <Building2 className="w-4 h-4 text-gray-400" />
                  {user.company_name}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Permissions Card - Only show for internal users */}
        {isInternal && (
          <div className="card p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5" />
              Your Permissions
            </h2>

            <div className="space-y-3">
              <PermissionItem
                label="View all columns"
                allowed={isInternal}
                description="Full access to all order data"
              />
              <PermissionItem
                label="Edit all fields"
                allowed={isInternal}
                description="Can edit any order field"
              />
              <PermissionItem
                label="Upload Excel files"
                allowed={isInternal}
                description="Can import orders from Excel"
              />
              <PermissionItem
                label="Export to Excel"
                allowed={true}
                description="Download orders as Excel file"
              />
              <PermissionItem
                label="Manage users"
                allowed={isInternal}
                description="Add, edit, and remove user accounts"
              />
            </div>
          </div>
        )}

        {/* User Management Card - Only for Internal/Admin users */}
        {isInternal && (
          <div className="card p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Users className="w-5 h-5" />
                User Management
              </h2>
              <button
                onClick={() => setShowAddUser(true)}
                className="btn-primary flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add User
              </button>
            </div>

            {/* Add User Form */}
            {showAddUser && (
              <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium text-gray-900">Add New User</h3>
                  <button onClick={() => setShowAddUser(false)} className="text-gray-400 hover:text-gray-600">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Username *</label>
                    <input
                      type="text"
                      value={newUser.username}
                      onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="Enter username"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                    <input
                      type="email"
                      value={newUser.email}
                      onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="Enter email"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                    <input
                      type="password"
                      value={newUser.password}
                      onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="Enter password"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
                    <select
                      value={newUser.role}
                      onChange={(e) => setNewUser({ ...newUser, role: e.target.value as 'admin' | 'internal' | 'supplier' })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="supplier">Supplier</option>
                      <option value="internal">Internal</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  {newUser.role === 'supplier' && (
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Factory Name</label>
                      <select
                        value={newUser.factory_name}
                        onChange={(e) => setNewUser({ ...newUser, factory_name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      >
                        <option value="">Select a factory...</option>
                        {factories.map((factory) => (
                          <option key={factory} value={factory}>{factory}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <button onClick={() => setShowAddUser(false)} className="btn-secondary">
                    Cancel
                  </button>
                  <button onClick={handleAddUser} className="btn-primary">
                    Create User
                  </button>
                </div>
              </div>
            )}

            {/* Users Table */}
            {loadingUsers ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Username</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Email</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Role</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Factory</th>
                      <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">Status</th>
                      <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{u.username}</td>
                        <td className="px-4 py-3 text-gray-600">{u.email}</td>
                        <td className="px-4 py-3">
                          {editingUser?.id === u.id ? (
                            <select
                              value={editingUser.role}
                              onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value as any })}
                              className="px-2 py-1 border border-gray-300 rounded text-sm"
                            >
                              <option value="supplier">Supplier</option>
                              <option value="internal">Internal</option>
                              <option value="admin">Admin</option>
                            </select>
                          ) : (
                            <span className={cn(
                              'px-2 py-1 rounded-full text-xs font-medium',
                              u.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                              u.role === 'internal' ? 'bg-primary-100 text-primary-700' :
                              'bg-teal-100 text-teal-700'
                            )}>
                              {u.role}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {editingUser?.id === u.id ? (
                            <select
                              value={editingFactory}
                              onChange={(e) => setEditingFactory(e.target.value)}
                              className="px-2 py-1 border border-gray-300 rounded text-sm"
                            >
                              <option value="">No factory</option>
                              {factories.map((factory) => (
                                <option key={factory} value={factory}>{factory}</option>
                              ))}
                            </select>
                          ) : (
                            u.factory_name || '-'
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={cn(
                            'px-2 py-1 rounded-full text-xs font-medium',
                            u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          )}>
                            {u.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-2">
                            {editingUser?.id === u.id ? (
                              <>
                                <button
                                  onClick={() => handleUpdateUser(u.id, { role: editingUser.role, factory_name: editingFactory || undefined })}
                                  className="p-1 text-green-600 hover:bg-green-50 rounded"
                                  title="Save"
                                >
                                  <CheckCircle className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingUser(null);
                                    setEditingFactory('');
                                  }}
                                  className="p-1 text-gray-400 hover:bg-gray-100 rounded"
                                  title="Cancel"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => {
                                    setEditingUser(u);
                                    setEditingFactory(u.factory_name || '');
                                  }}
                                  className="p-1 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded"
                                  title="Edit user"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                {u.id !== user?.id && (
                                  <button
                                    onClick={() => handleDeleteUser(u.id, u.username)}
                                    className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                                    title="Delete user"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Supplier Column Settings Card - Only for Internal/Admin users */}
        {isInternal && (
          <div className="card p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5" />
                  Supplier Column Visibility
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Configure which columns suppliers can see and edit in the orders table
                </p>
              </div>
              <button
                onClick={handleSaveColumnSettings}
                disabled={savingColumns}
                className="btn-primary flex items-center gap-2"
              >
                {savingColumns ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Save Changes
                  </>
                )}
              </button>
            </div>

            {loadingColumns ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden max-h-[500px] overflow-y-auto">
                <table className="w-full">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="border-b border-gray-200">
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Column</th>
                      <th className="px-4 py-3 text-center text-sm font-medium text-gray-600 w-32">Visible</th>
                      <th className="px-4 py-3 text-center text-sm font-medium text-gray-600 w-32">Editable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getDisplayColumns().map((col) => {
                      const isGroup = 'isGroup' in col && col.isGroup;
                      const columnDef = !isGroup ? COLUMNS.find((c) => c.key === col.column_key) : null;
                      return (
                        <tr key={col.column_key} className={cn(
                          "border-b border-gray-100 hover:bg-gray-50",
                          isGroup && "bg-blue-50"
                        )}>
                          <td className="px-4 py-2">
                            <div>
                              <span className={cn("font-medium", isGroup ? "text-blue-700" : "text-gray-900")}>
                                {isGroup ? 'Sizes (2XS - 5XL)' : (columnDef?.label || col.column_key)}
                              </span>
                              {!isGroup && (
                                <span className="text-xs text-gray-400 ml-2">
                                  ({col.column_key})
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={col.is_visible}
                              onChange={(e) => handleColumnVisibilityChange(col.column_key, e.target.checked)}
                              className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                            />
                          </td>
                          <td className="px-4 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={col.is_editable}
                              onChange={(e) => handleColumnEditableChange(col.column_key, e.target.checked)}
                              disabled={!col.is_visible}
                              className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500 disabled:opacity-50"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  );
}

function PermissionItem({
  label,
  allowed,
  description,
}: {
  label: string;
  allowed: boolean;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className={cn(
          'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
          allowed ? 'bg-green-100' : 'bg-gray-100'
        )}
      >
        {allowed ? (
          <CheckCircle className="w-3.5 h-3.5 text-green-600" />
        ) : (
          <AlertCircle className="w-3.5 h-3.5 text-gray-400" />
        )}
      </div>
      <div>
        <p className="font-medium text-gray-900">{label}</p>
        <p className="text-sm text-gray-500">{description}</p>
      </div>
    </div>
  );
}
