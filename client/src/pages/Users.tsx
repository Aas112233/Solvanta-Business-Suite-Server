import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import toast from 'react-hot-toast';
import { Search, Plus, Edit2, Trash2, X, Loader2, Shield, Key } from 'lucide-react';
import ModuleRefreshButton from '../components/ModuleRefreshButton';
import Pagination from '../components/ui/Pagination';
import { useAuthStore } from '../stores/authStore';
import AppDropdown from '../components/ui/AppDropdown';

export default function Users() {
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const [editing, setEditing] = useState<any>(null);
    const [showForm, setShowForm] = useState(false);
    const [formRoleId, setFormRoleId] = useState('');
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
        onSuccess: () => { toast.success('User deleted'); qc.invalidateQueries({ queryKey: ['users'] }); },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Cannot delete'),
    });

    const saveMut = useMutation({
        mutationFn: (u: any) => u.id ? api.patch(`/users/${u.id}`, u) : api.post('/users', u),
        onSuccess: () => { toast.success('Saved'); qc.invalidateQueries({ queryKey: ['users'] }); qc.invalidateQueries({ queryKey: ['roles'] }); setShowForm(false); },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed'),
    });
    const pagination = data?.meta?.pagination;

    const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const branchIds = Array.from(fd.getAll('branchIds'));
        const payload: any = {
            ...(editing?.id && { id: editing.id }),
            name: fd.get('name'),
            email: fd.get('email'),
            phone: fd.get('phone'),
            roleId: fd.get('roleId'),
            isActive: fd.get('isActive') === 'on',
            branchIds,
        };
        const pwd = fd.get('password') as string;
        if (pwd) payload.password = pwd;
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
                    onClick={() => { setEditing(null); setFormRoleId(''); setShowForm(true); }}
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
                <div className="relative min-h-[300px]">
                    {(isLoading || isFetching) && (
                        <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-10 flex flex-col items-center justify-center text-blue-600">
                            <Loader2 size={30} className="animate-spin mb-2" />
                            <span className="text-xs font-bold animate-pulse">Loading...</span>
                        </div>
                    )}
                    <table className="w-full">
                        <thead>
                            <tr style={{ background: 'var(--color-bg-tertiary)' }}>
                                {['Name', 'Email', 'Phone', 'Role', 'Branches', 'Status', 'Actions'].map(h => (
                                    <th key={h} className={`${h === 'Actions' ? 'text-right' : 'text-left'} px-5 py-3.5 text-xs font-semibold uppercase tracking-wider`} style={{ color: 'var(--color-text-muted)' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading && !isFetching ? (
                                <tr><td colSpan={7} className="py-12" /></tr>
                            ) : (data?.data || []).length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-5 py-12 text-center">
                                        <p className="text-sm mb-3" style={{ color: 'var(--color-text-muted)' }}>No users found.</p>
                                        <button
                                            onClick={() => { setEditing(null); setShowForm(true); }}
                                            disabled={!canManageUsers}
                                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <Plus size={14} />
                                            Create User
                                        </button>
                                    </td>
                                </tr>
                            ) : (data?.data || []).map((u: any) => (
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
                                        <button disabled={!canManageUsers} onClick={() => { setEditing(u); setFormRoleId(u.roleId || u.role?.id || ''); setShowForm(true); }} className="p-1.5 rounded-md disabled:opacity-50 disabled:cursor-not-allowed" style={{ color: 'var(--color-accent)' }}><Edit2 size={15} /></button>
                                        <button disabled={!canManageUsers} onClick={() => deleteMut.mutate(u.id)} className="p-1.5 rounded-md ml-1 disabled:opacity-50 disabled:cursor-not-allowed" style={{ color: 'var(--color-danger)' }}><Trash2 size={15} /></button>
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
                            <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-gray-700"><X size={20} /></button>
                        </div>
                        <form key={editing ? editing.id : 'new'} onSubmit={handleSave} className="space-y-5" autoComplete="off">
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>Name</label><input name="name" defaultValue={editing?.name} required className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20" autoComplete="off" /></div>
                                <div><label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>Email</label><input name="email" type="email" defaultValue={editing?.email} required className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20" autoComplete="off" /></div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>Phone</label><input name="phone" defaultValue={editing?.phone} className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20" autoComplete="off" /></div>
                                <div>
                                    <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>Role</label>
                                    <input type="hidden" name="roleId" value={formRoleId} />
                                    <AppDropdown
                                        value={formRoleId}
                                        onChange={(v) => setFormRoleId(v)}
                                        options={[{ value: '', label: 'Select role' }, ...(roles || []).map((r: any) => ({ value: r.id, label: r.name }))]}
                                        placeholder="Select role"
                                        searchable
                                        onRefresh={refetchRoles}
                                        refreshing={isFetchingRoles}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>Password {editing?.id && '(leave blank to keep)'}</label>
                                <input name="password" type="password" {...(!editing?.id && { required: true })} className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20" autoComplete="new-password" />
                            </div>
                            <div>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" name="isActive" defaultChecked={editing ? editing.isActive : true} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                                    <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>Active Account</span>
                                </label>
                            </div>
                            <div>
                                <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>Branches</label>
                                <div className="flex flex-wrap gap-2">
                                    {(branches || []).map((b: any) => (
                                        <label key={b.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm cursor-pointer" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}>
                                            <input type="checkbox" name="branchIds" value={b.id} defaultChecked={editing?.branches?.some((eb: any) => eb.id === b.id)} style={{ accentColor: 'var(--color-accent)' }} />
                                            {b.name}
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-lg text-sm font-medium" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}>Cancel</button>
                                <button type="submit" disabled={saveMut.isPending} className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-colors disabled:opacity-50">{saveMut.isPending ? 'Saving...' : 'Save'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
