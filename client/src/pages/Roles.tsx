import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import toast from '@/lib/toast';
import { Plus, Edit2, Trash2, X, Loader2, Shield, Check, Info, Users as UsersIcon, Search } from 'lucide-react';
import ModuleRefreshButton from '../components/ModuleRefreshButton';
import AppDropdown from '../components/ui/AppDropdown';

export default function Roles() {
    const [editing, setEditing] = useState<any>(null);
    const [showForm, setShowForm] = useState(false);
    const [viewingUsersRole, setViewingUsersRole] = useState<any>(null); // Role ID to view users
    const [activeTab, setActiveTab] = useState('pos');
    const [selectedPerms, setSelectedPerms] = useState<string[]>([]);
    const [roleName, setRoleName] = useState('');
    const [roleNamePreset, setRoleNamePreset] = useState('');
    const qc = useQueryClient();

    const { data: roles, isLoading, refetch: refetchRoles, isFetching: isFetchingRoles } = useQuery({
        queryKey: ['roles'],
        queryFn: () => api.get('/roles').then((r) => r.data.data),
    });

    const { data: availablePermissions, refetch: refetchPermissions, isFetching: isFetchingPermissions } = useQuery({
        queryKey: ['available-permissions'],
        queryFn: () => api.get('/roles/permissions').then((r) => r.data.data),
    });

    // Fetch users for specific role when viewing
    const { data: roleUsers, isLoading: isLoadingUsers } = useQuery({
        queryKey: ['users', 'role', viewingUsersRole?.id],
        queryFn: () => api.get(`/users?roleId=${viewingUsersRole?.id}&limit=100`).then(r => r.data.data),
        enabled: !!viewingUsersRole,
    });

    // Group permissions by module
    const groupedPermissions = (availablePermissions || []).reduce((acc: any, perm: string) => {
        const [module] = perm.split('.');
        if (!acc[module]) acc[module] = [];
        acc[module].push(perm);
        return acc;
    }, {});

    const modules = Object.keys(groupedPermissions).sort();

    const deleteMut = useMutation({
        mutationFn: (id: string) => api.delete(`/roles/${id}`),
        onSuccess: () => { toast.success('Role deleted'); qc.invalidateQueries({ queryKey: ['roles'] }); },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Cannot delete'),
    });

    const saveMut = useMutation({
        mutationFn: (r: any) => r.id ? api.patch(`/roles/${r.id}`, r) : api.post('/roles', r),
        onSuccess: () => {
            toast.success('Role saved');
            qc.invalidateQueries({ queryKey: ['roles'] });
            setShowForm(false);
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed'),
    });

    const handleOpenForm = (role: any = null) => {
        setEditing(role);
        setRoleName(role?.name || '');
        setRoleNamePreset(role?.name || '');
        setSelectedPerms(role?.permissions || []);
        setShowForm(true);
        if (modules.length > 0) setActiveTab(modules.includes('pos') ? 'pos' : modules[0]);
    };

    const togglePermission = (perm: string) => {
        setSelectedPerms(prev =>
            prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm]
        );
    };

    const toggleModule = (module: string, checked: boolean) => {
        const modulePerms = groupedPermissions[module];
        if (checked) {
            setSelectedPerms(prev => Array.from(new Set([...prev, ...modulePerms])));
        } else {
            setSelectedPerms(prev => prev.filter(p => !modulePerms.includes(p)));
        }
    };

    const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const trimmedName = roleName.trim();
        if (!trimmedName) {
            toast.error('Role name is required');
            return;
        }
        const payload: any = {
            name: trimmedName,
            permissions: selectedPerms,
        };
        if (editing?.id) payload.id = editing.id;
        saveMut.mutate(payload);
    };

    const isSystemRole = (role?: any) => Boolean(role?.isSystem);
    const isAdminRole = (role?: any) => role?.name?.toLowerCase() === 'admin';
    const canDelete = (role: any) => !isAdminRole(role) && role.userCount === 0;

    const roleNameOptions = useMemo(() => {
        return Array.from(new Set((roles || []).map((r: any) => String(r.name)))) as string[];
    }, [roles]);

    return (
        <div className="space-y-8 max-w-7xl mx-auto pb-10">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-3xl font-black text-gray-900 tracking-tight">Roles & Permissions</h1>
                        <ModuleRefreshButton queryKeys={[['roles'], ['available-permissions']]} />
                    </div>
                    <p className="text-gray-500 font-medium mt-1">Manage access levels and user responsibilities</p>
                </div>
                <button
                    onClick={() => handleOpenForm()}
                    className="flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20 active:scale-95 transition-all text-sm uppercase tracking-wide"
                >
                    <Plus size={18} strokeWidth={3} />
                    Create Role
                </button>
            </div>

            {/* Roles Grid */}
            {isLoading ? (
                <div className="py-20 flex flex-col items-center justify-center">
                    <Loader2 size={40} className="animate-spin text-blue-500 mb-4" />
                    <p className="text-gray-400 font-medium animate-pulse">Loading roles...</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {(roles || []).map((role: any) => (
                        <div
                            key={role.id}
                            className="group relative bg-white rounded-[24px] border border-gray-100 p-6 shadow-sm hover:shadow-xl hover:shadow-gray-200/50 transition-all duration-300 flex flex-col justify-between overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 p-6 flex gap-2 z-10">
                                <button
                                    onClick={() => handleOpenForm(role)}
                                    className="p-2 bg-white hover:bg-blue-50 text-gray-400 hover:text-blue-600 rounded-xl shadow-sm border border-gray-100 transition-all"
                                    title="Edit Role"
                                >
                                    <Edit2 size={16} />
                                </button>
                                <button
                                    onClick={() => { if (canDelete(role)) { if (confirm(`Are you sure you want to delete the "${role.name}" role? This cannot be undone.`)) deleteMut.mutate(role.id); } }}
                                    disabled={!canDelete(role)}
                                    className={`p-2 rounded-xl shadow-sm border border-gray-100 transition-all ${canDelete(role)
                                        ? 'bg-white hover:bg-red-50 text-gray-400 hover:text-red-600 cursor-pointer'
                                        : 'bg-gray-50 text-gray-300 cursor-not-allowed border-transparent shadow-none'
                                        }`}
                                    title={
                                        isAdminRole(role)
                                            ? 'The Admin role cannot be deleted'
                                            : role.userCount > 0
                                                ? `Cannot delete: ${role.userCount} users currently assigned`
                                                : 'Delete Role'
                                    }
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>

                            <div className="mb-6">
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl mb-4 shadow-inner ${isAdminRole(role)
                                    ? 'bg-blue-600 text-white shadow-blue-500/30'
                                    : isSystemRole(role)
                                        ? 'bg-amber-100 text-amber-600'
                                        : 'bg-gray-100 text-gray-600'
                                    }`}>
                                    <Shield size={24} strokeWidth={2.5} />
                                </div>

                                <div className="flex items-center gap-2 mb-2">
                                    <h3 className="text-xl font-bold text-gray-900 leading-tight">{role.name}</h3>
                                    {isSystemRole(role) && (
                                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider ${isAdminRole(role) ? 'bg-blue-100 text-blue-700' : 'bg-amber-50 text-amber-700 border border-amber-100'
                                            }`}>
                                            System
                                        </span>
                                    )}
                                </div>

                                <p className="text-sm font-medium text-gray-500 mb-4 line-clamp-2">
                                    {role.permissions.length} active permissions configured
                                </p>

                                <div className="flex flex-wrap gap-1.5 h-16 overflow-hidden relative mask-b-transparent">
                                    {role.permissions.slice(0, 6).map((p: string) => (
                                        <span key={p} className="px-2 py-1 rounded-lg bg-gray-50 text-[10px] font-bold text-gray-500 border border-gray-100 lowercase">
                                            {p.split('.')[1] || p}
                                        </span>
                                    ))}
                                    {role.permissions.length > 6 && (
                                        <span className="px-2 py-1 rounded-lg bg-gray-50 text-[10px] font-bold text-gray-400 border border-gray-100">
                                            +{role.permissions.length - 6} more
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                                <button
                                    onClick={() => setViewingUsersRole(role)}
                                    className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-blue-600 transition-colors group/users"
                                >
                                    <div className="p-1.5 rounded-lg bg-gray-50 group-hover/users:bg-blue-50 transition-colors">
                                        <UsersIcon size={16} />
                                    </div>
                                    <span>{role.userCount || 0} Assigned Users</span>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Users Modal */}
            {viewingUsersRole && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm" onClick={() => setViewingUsersRole(null)}>
                    <div className="w-full max-w-lg bg-white rounded-3xl p-6 shadow-2xl flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900">{viewingUsersRole.name}</h3>
                                <p className="text-sm text-gray-500">Assigned Users</p>
                            </div>
                            <button onClick={() => setViewingUsersRole(null)} className="p-2 hover:bg-gray-100 rounded-full text-gray-400">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar min-h-[200px]">
                            {isLoadingUsers ? (
                                <div className="flex justify-center py-10">
                                    <Loader2 size={24} className="animate-spin text-blue-500" />
                                </div>
                            ) : (roleUsers || []).length === 0 ? (
                                <div className="text-center py-10 text-gray-400">
                                    <UsersIcon size={40} className="mx-auto mb-3 opacity-20" />
                                    <p>No users assigned to this role yet.</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {(roleUsers || []).map((u: any) => (
                                        <div key={u.id} className="flex items-center gap-3 p-3 rounded-2xl hover:bg-gray-50 border border-transparent hover:border-gray-100 transition-all">
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-100 to-indigo-50 flex items-center justify-center text-blue-600 font-black text-sm">
                                                {u.name.charAt(0)}
                                            </div>
                                            <div className="overflow-hidden">
                                                <p className="font-bold text-gray-900 truncate">{u.name}</p>
                                                <p className="text-xs text-gray-500 truncate">{u.email}</p>
                                            </div>
                                            {u.isActive ? (
                                                <span className="ml-auto px-2 py-1 rounded-lg bg-green-100 text-green-700 text-[10px] font-bold">Active</span>
                                            ) : (
                                                <span className="ml-auto px-2 py-1 rounded-lg bg-gray-100 text-gray-500 text-[10px] font-bold">Inactive</span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Role Form (Edit/Create) */}
            {showForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-md">
                    <div className="w-full max-w-5xl rounded-[32px] p-8 animate-scale-in shadow-2xl bg-white flex flex-col h-[90vh] max-h-[90vh] overflow-hidden">
                        <div className="flex items-center justify-between mb-8 pb-6 border-b border-gray-100">
                            <div>
                                <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight">{editing?.id ? 'Edit' : 'New'} Role</h2>
                                <p className="text-sm text-gray-500 font-medium mt-1">Configure module permissions and access control</p>
                            </div>
                            <button onClick={() => setShowForm(false)} className="p-3 hover:bg-gray-100 rounded-full text-gray-400 transition-colors">
                                <X size={28} />
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="flex-1 overflow-hidden flex flex-col min-h-0">
                            <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-8 h-full min-h-0">
                                {/* Left: Config */}
                                <div className="flex flex-col gap-6 overflow-y-auto pr-2 custom-scrollbar">
                                    <div>
                                        <label className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3 block">Role Definition</label>
                                <AppDropdown
                                    value={roleNamePreset}
                                    onChange={(value) => {
                                        setRoleNamePreset(value);
                                        if (value !== '__custom__') setRoleName(value); }}
                                    options={[
                                        ...roleNameOptions.map((name) => ({ value: name, label: name })),
                                        { value: '__custom__', label: 'Custom Role Name...' },
                                    ]}
                                    placeholder="Select Role Type"
                                    searchable
                                    disabled={isSystemRole(editing)}
                                    className="w-full mb-3"
                                    onRefresh={() => refetchRoles()}
                                    refreshing={isFetchingRoles}
                                    refreshLabel="Refresh roles"
                                />
                                        {roleNamePreset === '__custom__' && !isSystemRole(editing) && (
                                            <input
                                                name="name"
                                                value={roleName}
                                                onChange={(e) => setRoleName(e.target.value)}
                                                required
                                                placeholder="e.g. Senior Sales Manager"
                                                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all font-bold text-gray-900 placeholder:font-normal"
                                            />
                                        )}
                                        {isSystemRole(editing) && (
                                            <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 text-xs text-amber-800 font-medium flex gap-2">
                                                <Shield size={14} className="shrink-0 mt-0.5" />
                                                <p>System role names are locked to ensure system compatibility.</p>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex-1 flex flex-col min-h-0 bg-gray-50/50 rounded-3xl p-4">
                                        <div className="flex items-center justify-between mb-4 px-2">
                                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Operations</label>
                                            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{modules.length} Modules</span>
                                        </div>
                                        <div className="flex flex-col gap-1.5 flex-1 min-h-[200px] overflow-y-auto custom-scrollbar pr-1">
                                            {modules.map((mod) => {
                                                const count = (groupedPermissions[mod] || []).filter((p: string) => selectedPerms.includes(p)).length;
                                                const total = (groupedPermissions[mod] || []).length;
                                                const isActive = activeTab === mod;

                                                return (
                                                    <button
                                                        key={mod}
                                                        type="button"
                                                        onClick={() => setActiveTab(mod)}
                                                        className={`group flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-black transition-all ${isActive
                                                            ? 'bg-blue-600 text-white shadow-xl shadow-blue-500/20 active:scale-[0.98]'
                                                            : 'bg-white text-gray-500 hover:bg-white hover:text-blue-600 border border-transparent hover:border-blue-100 hover:shadow-md'
                                                            }`}
                                                    >
                                                        <div className={`p-1.5 rounded-lg transition-colors ${isActive ? 'bg-white/20' : 'bg-gray-100 group-hover:bg-blue-50'}`}>
                                                            <Shield size={14} />
                                                        </div>
                                                        <span className="uppercase tracking-tight text-[11px] flex-1 text-left">{mod}</span>
                                                        <div className="flex flex-col items-end gap-1">
                                                            <span className={`text-[10px] tabular-nums font-black ${isActive ? 'text-white' : 'text-gray-900'}`}>
                                                                {count}
                                                            </span>
                                                            <div className={`w-8 h-1 rounded-full overflow-hidden ${isActive ? 'bg-white/20' : 'bg-gray-100'}`}>
                                                                <div
                                                                    className={`h-full transition-all duration-500 ${isActive ? 'bg-white' : 'bg-blue-500'}`}
                                                                    style={{ width: `${(count / total) * 100}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>

                                {/* Right: Permissions */}
                                <div className="flex flex-col gap-4 min-h-0">
                                    <div className="bg-white rounded-2xl border border-gray-200 px-4 py-3">
                                        <div className="flex items-center justify-between gap-3 mb-2">
                                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Quick Toggles</label>
                                            <span className="text-[10px] font-bold text-gray-500">Global actions across modules</span>
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                                            {['view', 'create', 'edit', 'delete'].map(action => (
                                                <button
                                                    key={action}
                                                    type="button"
                                                    onClick={() => {
                                                        const permsToAdd = (availablePermissions || []).filter((p: string) => p.endsWith(`.${action}`));
                                                        setSelectedPerms(prev => {
                                                            const allPresent = permsToAdd.every((p: string) => prev.includes(p));
                                                            if (allPresent) return prev.filter((p: string) => !permsToAdd.includes(p));
                                                            return Array.from(new Set([...prev, ...permsToAdd]));
                                                        });
                                                    }}
                                                    className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-[10px] font-black uppercase tracking-tight text-gray-700 transition-all"
                                                >
                                                    <Check size={11} />
                                                    All {action}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="flex flex-col bg-gray-50/50 rounded-3xl border border-gray-100 overflow-hidden min-h-0">
                                        <div className="p-6 border-b border-gray-100 bg-white flex items-center justify-between sticky top-0 z-10">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-blue-100 rounded-lg text-blue-700">
                                                    <Shield size={20} />
                                                </div>
                                                <div>
                                                    <h3 className="text-lg font-black uppercase text-gray-900 tracking-tight">{activeTab} Access</h3>
                                                    <p className="text-xs text-gray-500 font-medium">Manage permissions for this module</p>
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleModule(activeTab, true)}
                                                    className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-bold hover:bg-blue-100 transition-colors"
                                                >
                                                    Allow All
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => toggleModule(activeTab, false)}
                                                    className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-bold hover:bg-gray-200 transition-colors"
                                                >
                                                    Clear
                                                </button>
                                            </div>
                                        </div>
                                        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-white/50 backdrop-blur-sm">
                                            <div className="space-y-10">
                                                {/* Standard CRUD Permissions */}
                                                {(() => {
                                                    const modulePerms = groupedPermissions[activeTab] || [];
                                                    const crudActions = ['view', 'create', 'edit', 'delete'];
                                                    const standardPerms = modulePerms.filter((p: string) => crudActions.includes(p.split('.')[1]));
                                                    const specialPerms = modulePerms.filter((p: string) => !crudActions.includes(p.split('.')[1]));

                                                    return (
                                                        <>
                                                            <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
                                                                <div className="flex items-center gap-2 mb-6">
                                                                    <div className="w-1.5 h-6 bg-blue-600 rounded-full" />
                                                                    <h4 className="text-sm font-black uppercase tracking-widest text-gray-400">Core Access</h4>
                                                                </div>
                                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                                    {crudActions.map(action => {
                                                                        const perm = `${activeTab}.${action}`;
                                                                        const exists = modulePerms.includes(perm);
                                                                        if (!exists) return null;

                                                                        const isChecked = selectedPerms.includes(perm);
                                                                        return (
                                                                            <button
                                                                                key={perm}
                                                                                type="button"
                                                                                onClick={() => togglePermission(perm)}
                                                                                className={`flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all duration-200 group ${isChecked
                                                                                    ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/20 active:scale-[0.97]'
                                                                                    : 'bg-white border-gray-100 text-gray-400 hover:border-blue-200 hover:bg-blue-50/30'
                                                                                    }`}
                                                                            >
                                                                                <div className={`mb-3 p-2.5 rounded-xl transition-colors ${isChecked ? 'bg-white/20' : 'bg-gray-50 group-hover:bg-blue-100 group-hover:text-blue-600'}`}>
                                                                                    {isChecked ? <Check size={20} strokeWidth={3} /> : <Shield size={20} />}
                                                                                </div>
                                                                                <span className={`text-xs font-black uppercase tracking-wider ${isChecked ? 'text-white' : 'text-gray-600'}`}>
                                                                                    {action}
                                                                                </span>
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>

                                                            {specialPerms.length > 0 && (
                                                                <div>
                                                                    <div className="flex items-center gap-2 mb-6">
                                                                        <div className="w-1.5 h-6 bg-amber-500 rounded-full" />
                                                                        <h4 className="text-sm font-black uppercase tracking-widest text-gray-400">Special Tasks</h4>
                                                                    </div>
                                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                        {specialPerms.map((perm: string) => {
                                                                            const action = perm.split('.')[1];
                                                                            const isChecked = selectedPerms.includes(perm);
                                                                            return (
                                                                                <label
                                                                                    key={perm}
                                                                                    className={`group relative flex items-start gap-4 p-5 rounded-3xl border-2 cursor-pointer transition-all duration-200 ${isChecked
                                                                                        ? 'bg-white border-blue-600 shadow-xl shadow-blue-500/5 ring-1 ring-blue-600'
                                                                                        : 'bg-white border-gray-100 hover:border-blue-200 hover:shadow-lg hover:shadow-gray-200/50'
                                                                                        }`}
                                                                                >
                                                                                    <div className="relative flex items-center justify-center h-6 w-6 mt-0.5">
                                                                                        <input
                                                                                            type="checkbox"
                                                                                            checked={isChecked}
                                                                                            onChange={() => togglePermission(perm)}
                                                                                            className="peer hidden"
                                                                                        />
                                                                                        <div className={`h-6 w-6 rounded-lg border-2 transition-all flex items-center justify-center ${isChecked
                                                                                            ? 'bg-blue-600 border-blue-600 scale-110'
                                                                                            : 'bg-white border-gray-200 group-hover:border-blue-400'
                                                                                            }`}>
                                                                                            {isChecked && <Check size={14} strokeWidth={4} className="text-white" />}
                                                                                        </div>
                                                                                    </div>
                                                                                    <div className="flex-1">
                                                                                        <div className="flex items-center gap-2 mb-1">
                                                                                            <span className={`text-sm font-black uppercase tracking-tight ${isChecked ? 'text-gray-900' : 'text-gray-500'}`}>
                                                                                                {action?.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()) || action}
                                                                                            </span>
                                                                                        </div>
                                                                                        <p className={`text-xs leading-relaxed font-medium ${isChecked ? 'text-gray-600' : 'text-gray-400'}`}>
                                                                                            Detailed access for {action.toLowerCase()} operations within {activeTab}.
                                                                                        </p>
                                                                                    </div>
                                                                                </label>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                                </div>
                                                            )}
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-8 pt-6 border-t border-gray-100 flex items-center justify-between bg-white shrink-0">
                                <p className="text-xs text-gray-400 font-medium">
                                    <span className="font-bold text-gray-900">{selectedPerms.length}</span> permissions selected across modules.
                                </p>
                                <div className="flex gap-4">
                                    <button
                                        type="button"
                                        onClick={() => setShowForm(false)}
                                        className="px-8 py-3.5 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-50 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={saveMut.isPending}
                                        className="px-10 py-3.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:bg-blue-600"
                                    >
                                        {saveMut.isPending ? 'Saving...' : 'Save Configuration'}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
