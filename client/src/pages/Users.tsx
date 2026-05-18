import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import toast from '@/lib/toast';
import { Search, Plus, Edit2, Trash2, X, Loader2, Shield } from 'lucide-react';
import ModuleRefreshButton from '../components/ModuleRefreshButton';
import Pagination from '../components/ui/Pagination';
import { useAuthStore } from '../stores/authStore';
import AppDropdown from '../components/ui/AppDropdown';

interface UserFormData {
    id?: string;
    name: string;
    email: string;
    phone: string;
    roleId: string;
    password: string;
    isActive: boolean;
    branchIds: string[];
}

type UserFormField = 'name' | 'email' | 'phone' | 'roleId' | 'password' | 'branchIds';
type UserFormErrors = Partial<Record<UserFormField, string>>;

const ADMIN_LIKE_PERMISSIONS = new Set([
    'admin.manageUsers',
    'admin.manageBranches',
]);

function mapErrorField(field?: string): UserFormField | null {
    switch (field) {
        case 'name':
        case 'email':
        case 'phone':
        case 'password':
        case 'roleId':
        case 'branchIds':
            return field;
        case 'role':
            return 'roleId';
        case 'branch':
        case 'branchId':
        case 'branches':
            return 'branchIds';
        default:
            return null;
    }
}

function extractUserFormErrors(error: any): UserFormErrors {
    const nextErrors: UserFormErrors = {};
    const details = error?.response?.data?.error?.details;

    if (Array.isArray(details)) {
        for (const detail of details) {
            const field = mapErrorField(detail?.field);
            if (!field || nextErrors[field]) continue;
            nextErrors[field] = detail?.message || 'Invalid value';
        }
    } else if (details && typeof details === 'object') {
        for (const [key, value] of Object.entries(details)) {
            const field = mapErrorField(key);
            if (!field || nextErrors[field]) continue;
            if (typeof value === 'string') {
                nextErrors[field] = value;
            } else if (value && typeof value === 'object' && 'message' in value && typeof value.message === 'string') {
                nextErrors[field] = value.message;
            }
        }
    }

    if (Object.keys(nextErrors).length > 0) {
        return nextErrors;
    }

    const message = error?.response?.data?.error?.message;
    if (typeof message !== 'string' || !message.trim()) {
        return nextErrors;
    }

    const normalizedMessage = message.toLowerCase();
    if (normalizedMessage.includes('email')) nextErrors.email = message;
    else if (normalizedMessage.includes('password')) nextErrors.password = message;
    else if (normalizedMessage.includes('role')) nextErrors.roleId = message;
    else if (normalizedMessage.includes('branch')) nextErrors.branchIds = message;
    else if (normalizedMessage.includes('phone')) nextErrors.phone = message;
    else if (normalizedMessage.includes('name')) nextErrors.name = message;

    return nextErrors;
}

export default function Users() {
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const [editing, setEditing] = useState<any>(null);
    const [showForm, setShowForm] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
    const [formErrors, setFormErrors] = useState<UserFormErrors>({});
    const [formData, setFormData] = useState<UserFormData>({
        name: '',
        email: '',
        phone: '',
        roleId: '',
        password: '',
        isActive: true,
        branchIds: [],
    });
    const qc = useQueryClient();
    const hasPermission = useAuthStore((s) => s.hasPermission);
    const canManageUsers = hasPermission('admin.manageUsers');

    const { data, isLoading, isFetching } = useQuery({
        queryKey: ['users', search, page, limit, roleFilter],
        queryFn: () => api.get('/users', { params: { search, page, limit, ...(roleFilter ? { roleId: roleFilter } : {}) } }).then((r) => r.data),
    });

    const { data: roles, refetch: refetchRoles, isFetching: isFetchingRoles } = useQuery({
        queryKey: ['roles'],
        queryFn: () => api.get('/roles').then((r) => r.data.data),
    });

    const { data: branches } = useQuery({
        queryKey: ['branches'],
        queryFn: () => api.get('/branches').then((r) => r.data.data),
    });

    const deleteMut = useMutation({
        mutationFn: (id: string) => api.delete(`/users/${id}`),
        onSuccess: () => {
            toast.success('User deleted');
            setShowDeleteConfirm(null);
            qc.invalidateQueries({ queryKey: ['users'] });
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Cannot delete'),
    });

    const saveMut = useMutation({
        mutationFn: (u: UserFormData) => u.id ? api.patch(`/users/${u.id}`, u) : api.post('/users', u),
        onSuccess: () => {
            toast.success('Saved');
            qc.invalidateQueries({ queryKey: ['users'] });
            qc.invalidateQueries({ queryKey: ['roles'] });
            setFormErrors({});
            setShowForm(false);
        },
        onError: (err: any) => {
            const nextErrors = extractUserFormErrors(err);
            setFormErrors(nextErrors);

            if (Object.keys(nextErrors).length > 0) {
                toast.error('Please check the highlighted fields');
                return;
            }

            toast.error(err.response?.data?.error?.message || 'Failed');
        },
    });
    const pagination = data?.meta?.pagination;

    const selectedRole = useMemo(
        () => (roles || []).find((role: any) => role.id === formData.roleId),
        [roles, formData.roleId],
    );

    const requiresManualBranchSelection = useMemo(() => {
        if (!selectedRole || !Array.isArray(selectedRole.permissions)) return false;
        return !selectedRole.permissions.some((permission: string) => ADMIN_LIKE_PERMISSIONS.has(permission));
    }, [selectedRole]);

    const clearFormError = (field: UserFormField) => {
        setFormErrors((current) => {
            if (!current[field]) return current;
            const next = { ...current };
            delete next[field];
            return next;
        });
    };

    const validateForm = (): UserFormErrors => {
        const nextErrors: UserFormErrors = {};
        const trimmedName = formData.name.trim();
        const trimmedEmail = formData.email.trim();
        const password = formData.password;

        if (!trimmedName) {
            nextErrors.name = 'Name is required';
        } else if (trimmedName.length > 100) {
            nextErrors.name = 'Name must be 100 characters or less';
        }

        if (!trimmedEmail) {
            nextErrors.email = 'Email is required';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
            nextErrors.email = 'Enter a valid email address';
        }

        if (!formData.roleId) {
            nextErrors.roleId = 'Role is required';
        }

        if (!editing?.id || password) {
            if (!password) {
                nextErrors.password = 'Password is required';
            } else if (password.length < 8) {
                nextErrors.password = 'Password must be at least 8 characters';
            } else if (password.length > 128) {
                nextErrors.password = 'Password must be less than 128 characters';
            } else if (!/[A-Z]/.test(password)) {
                nextErrors.password = 'Password must contain at least one uppercase letter';
            } else if (!/[a-z]/.test(password)) {
                nextErrors.password = 'Password must contain at least one lowercase letter';
            } else if (!/[0-9]/.test(password)) {
                nextErrors.password = 'Password must contain at least one number';
            }
        }

        if (formData.roleId && requiresManualBranchSelection && formData.branchIds.length === 0) {
            nextErrors.branchIds = 'Select at least one branch';
        }

        return nextErrors;
    };

    const openCreateForm = () => {
        setEditing(null);
        setFormErrors({});
        setFormData({
            name: '',
            email: '',
            phone: '',
            roleId: '',
            password: '',
            isActive: true,
            branchIds: [],
        });
        setShowForm(true);
    };

    const openEditForm = (user: any) => {
        setEditing(user);
        setFormErrors({});
        setFormData({
            id: user.id,
            name: user.name || '',
            email: user.email || '',
            phone: user.phone || '',
            roleId: user.roleId || user.role?.id || '',
            password: '',
            isActive: user.isActive,
            branchIds: (user.branches || []).map((b: any) => b.id),
        });
        setShowForm(true);
    };

    const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const nextErrors = validateForm();
        setFormErrors(nextErrors);

        if (Object.keys(nextErrors).length > 0) {
            toast.error('Please check the highlighted fields');
            return;
        }

        const payload: any = {
            ...(formData.id && { id: formData.id }),
            name: formData.name.trim(),
            email: formData.email.trim(),
            phone: formData.phone.trim(),
            roleId: formData.roleId,
            isActive: formData.isActive,
            branchIds: formData.branchIds,
        };
        if (formData.password) {
            payload.password = formData.password;
        }
        saveMut.mutate(payload);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Users</h1>
                        <ModuleRefreshButton queryKeys={[['users'], ['roles'], ['branches']]} />
                    </div>
                    <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{data?.meta?.pagination?.total || 0} total</p>
                </div>
                <button
                    onClick={() => { openCreateForm(); }}
                    disabled={!canManageUsers}
                    title={!canManageUsers ? 'Missing permission: admin.manageUsers' : 'Create new user'}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Plus size={18} /> Create User
                </button>
            </div>

            <div className="relative max-w-md">
                <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
                <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search users..." className="pl-11" />
            </div>
            <div className="max-w-xs">
                <AppDropdown
                    value={roleFilter}
                    onChange={(v) => { setRoleFilter(v); setPage(1); }}
                    options={[{ value: '', label: 'All roles' }, ...(roles || []).map((r: any) => ({ value: r.id, label: r.name }))]}
                    placeholder='All roles'
                    searchable
                    onRefresh={refetchRoles}
                    refreshing={isFetchingRoles}
                />
            </div>

            <div className="rounded-xl overflow-hidden" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                <div className="relative">
                    <table className="w-full">
                        <thead>
                            <tr style={{ background: 'var(--color-bg-tertiary)' }}>
                                {['Name', 'Email', 'Phone', 'Role', 'Branches', 'Status', 'Actions'].map(h => (
                                    <th key={h} className={`${h === 'Actions' ? 'text-right' : 'text-left'} px-5 py-3.5 text-xs font-semibold uppercase tracking-wider`} style={{ color: 'var(--color-text-muted)' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {(isLoading || isFetching) && (
                                <tr>
                                    <td colSpan={7} className="py-12">
                                        <div className="flex flex-col items-center justify-center text-blue-600">
                                            <Loader2 size={30} className="animate-spin mb-2" />
                                            <span className="text-xs font-bold animate-pulse">Loading...</span>
                                        </div>
                                    </td>
                                </tr>
                            )}
                            {!isLoading && !isFetching && (data?.data || []).length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-5 py-12 text-center">
                                        <p className="text-sm mb-3" style={{ color: 'var(--color-text-muted)' }}>No users found.</p>
                                        <button
                                            onClick={() => { openCreateForm(); }}
                                            disabled={!canManageUsers}
                                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <Plus size={14} />
                                            Create User
                                        </button>
                                    </td>
                                </tr>
                            ) : !isLoading && !isFetching && (data?.data || []).map((u: any) => (
                                <tr key={u.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                                    <td className="px-5 py-3.5">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full gradient-accent flex items-center justify-center text-white text-xs font-bold">{u.name?.charAt(0)}</div>
                                            <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{u.name}</span>
                                        </div>
                                    </td>
                                    <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{u.email}</td>
                                    <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{u.phone || '-'}</td>
                                    <td className="px-5 py-3.5"><span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}><Shield size={10} className="inline mr-1" />{u.role?.name}</span></td>
                                    <td className="px-5 py-3.5">
                                        <div className="flex gap-1 flex-wrap">
                                            {(u.branches || []).map((b: any) => (
                                                <span key={b.id} className="px-2 py-0.5 rounded-full text-xs" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}>{b.name}</span>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="px-5 py-3.5">
                                        <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: u.isActive ? 'var(--color-success-soft)' : 'var(--color-danger-soft)', color: u.isActive ? 'var(--color-success)' : 'var(--color-danger)' }}>
                                            {u.isActive ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3.5 text-right">
                                        <button disabled={!canManageUsers} onClick={() => { openEditForm(u); }} className="p-1.5 rounded-md disabled:opacity-50 disabled:cursor-not-allowed" style={{ color: 'var(--color-accent)' }}><Edit2 size={15} /></button>
                                        <button disabled={!canManageUsers} onClick={() => setShowDeleteConfirm(u.id)} className="p-1.5 rounded-md ml-1 disabled:opacity-50 disabled:cursor-not-allowed" style={{ color: 'var(--color-danger)' }}><Trash2 size={15} /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {pagination && (
                    <Pagination
                        currentPage={page}
                        totalPages={pagination.totalPages}
                        totalItems={pagination.totalItems || pagination.total}
                        itemsPerPage={limit}
                        onPageChange={setPage}
                        onItemsPerPageChange={setLimit}
                        isLoading={isFetching}
                    />
                )}
            </div>

            {showForm && canManageUsers && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="w-full max-w-2xl rounded-2xl p-6 animate-scale-in bg-white shadow-2xl border border-gray-200">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>{editing?.id ? 'Edit' : 'New'} User</h2>
                            <button onClick={() => { setShowForm(false); setFormErrors({}); }} className="text-gray-500 hover:text-gray-700"><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSave} className="space-y-5" autoComplete="off" noValidate>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>Name</label>
                                    <input
                                        name="name"
                                        value={formData.name}
                                        onChange={(e) => {
                                            clearFormError('name');
                                            setFormData((current) => ({ ...current, name: e.target.value }));
                                        }}
                                        required
                                        aria-invalid={Boolean(formErrors.name)}
                                        className={`w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${formErrors.name ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                                        autoComplete="off"
                                    />
                                    {formErrors.name && <p className="mt-1 text-xs text-red-600">{formErrors.name}</p>}
                                </div>
                                <div>
                                    <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>Email</label>
                                    <input
                                        name="email"
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) => {
                                            clearFormError('email');
                                            setFormData((current) => ({ ...current, email: e.target.value }));
                                        }}
                                        required
                                        aria-invalid={Boolean(formErrors.email)}
                                        className={`w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${formErrors.email ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                                        autoComplete="off"
                                    />
                                    {formErrors.email && <p className="mt-1 text-xs text-red-600">{formErrors.email}</p>}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>Phone</label>
                                    <input
                                        name="phone"
                                        value={formData.phone}
                                        onChange={(e) => {
                                            clearFormError('phone');
                                            setFormData((current) => ({ ...current, phone: e.target.value }));
                                        }}
                                        aria-invalid={Boolean(formErrors.phone)}
                                        className={`w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${formErrors.phone ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                                        autoComplete="off"
                                    />
                                    {formErrors.phone && <p className="mt-1 text-xs text-red-600">{formErrors.phone}</p>}
                                </div>
                                <div>
                                    <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>Role</label>
                                    <AppDropdown
                                        value={formData.roleId}
                                        onChange={(v) => {
                                            clearFormError('roleId');
                                            clearFormError('branchIds');
                                            setFormData((current) => ({ ...current, roleId: v }));
                                        }}
                                        options={[{ value: '', label: 'Select role' }, ...(roles || []).map((r: any) => ({ value: r.id, label: r.name }))]}
                                        placeholder="Select role"
                                        searchable
                                        onRefresh={refetchRoles}
                                        refreshing={isFetchingRoles}
                                        className={formErrors.roleId ? 'border-red-300 bg-red-50' : ''}
                                    />
                                    {formErrors.roleId && <p className="mt-1 text-xs text-red-600">{formErrors.roleId}</p>}
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>Password {editing?.id && '(leave blank to keep)'}</label>
                                <input
                                    name="password"
                                    type="password"
                                    value={formData.password}
                                    onChange={(e) => {
                                        clearFormError('password');
                                        setFormData((current) => ({ ...current, password: e.target.value }));
                                    }}
                                    required={!editing?.id}
                                    aria-invalid={Boolean(formErrors.password)}
                                    className={`w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${formErrors.password ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                                    autoComplete="new-password"
                                />
                                <p className="mt-1 text-xs" style={{ color: formErrors.password ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>
                                    {formErrors.password || 'Use 8+ characters with uppercase, lowercase, and a number.'}
                                </p>
                            </div>
                            <div>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.isActive}
                                        onChange={(e) => setFormData((current) => ({ ...current, isActive: e.target.checked }))}
                                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>Active Account</span>
                                </label>
                            </div>
                            <div>
                                <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>Branches</label>
                                <div className={`rounded-lg border p-3 ${formErrors.branchIds ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'}`}>
                                    <div className="flex flex-wrap gap-2">
                                        {(branches || []).map((b: any) => (
                                            <label key={b.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm cursor-pointer" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={formData.branchIds.includes(b.id)}
                                                    onChange={(e) => {
                                                        clearFormError('branchIds');
                                                        setFormData((current) => ({
                                                            ...current,
                                                            branchIds: e.target.checked
                                                                ? [...current.branchIds, b.id]
                                                                : current.branchIds.filter((id) => id !== b.id),
                                                        }));
                                                    }}
                                                    style={{ accentColor: 'var(--color-accent)' }}
                                                />
                                                {b.name}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                <p className="mt-1 text-xs" style={{ color: formErrors.branchIds ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>
                                    {formErrors.branchIds || (formData.roleId && !requiresManualBranchSelection
                                        ? 'Admin-style roles will automatically get access to all company branches.'
                                        : 'Select the branches this user can access.')}
                                </p>
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => { setShowForm(false); setFormErrors({}); }} className="flex-1 py-2.5 rounded-lg text-sm font-medium" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}>Cancel</button>
                                <button type="submit" disabled={saveMut.isPending} className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-colors disabled:opacity-50">{saveMut.isPending ? 'Saving...' : 'Save'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Dialog */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-2xl p-6 bg-white shadow-2xl border border-gray-200">
                        <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 rounded-full bg-red-100">
                            <Trash2 size={24} className="text-red-600" />
                        </div>
                        <h3 className="text-lg font-semibold text-center mb-2" style={{ color: 'var(--color-text-primary)' }}>Delete User</h3>
                        <p className="text-sm text-center mb-6" style={{ color: 'var(--color-text-secondary)' }}>
                            Are you sure you want to delete this user? This action will deactivate the user and cannot be undone.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowDeleteConfirm(null)}
                                className="flex-1 py-2.5 rounded-lg text-sm font-medium"
                                style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => deleteMut.mutate(showDeleteConfirm)}
                                disabled={deleteMut.isPending}
                                className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 shadow-sm transition-colors disabled:opacity-50"
                            >
                                {deleteMut.isPending ? 'Deleting...' : 'Delete User'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
