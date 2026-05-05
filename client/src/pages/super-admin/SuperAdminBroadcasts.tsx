import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Megaphone, Pencil, Trash2 } from 'lucide-react';
import {
    broadcastAnnouncement,
    deleteSuperAdminAnnouncement,
    fetchSuperAdminAnnouncements,
    SuperAdminAnnouncement,
    updateSuperAdminAnnouncement,
} from './api';
import { SYSTEM_ANNOUNCEMENT_QUERY_KEY } from '../../lib/systemAnnouncements';
import AppDropdown from '../../components/ui/AppDropdown';
import { useAuthStore } from '../../stores/authStore';
import { SUPER_ADMIN_PERMISSIONS } from '../../lib/superAdminPermissions';
import SuperAdminAccessCard from './SuperAdminAccessCard';

function toLocalInputValue(iso: string | null) {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
}

function toIsoFromLocalInput(value: string) {
    if (!value) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return undefined;
    return date.toISOString();
}

const levelClassMap: Record<SuperAdminAnnouncement['level'], string> = {
    info: 'bg-blue-50 text-blue-700',
    warning: 'bg-amber-50 text-amber-700',
    critical: 'bg-red-50 text-red-700',
};

export default function SuperAdminBroadcasts() {
    const queryClient = useQueryClient();
    const canReadAnnouncements = useAuthStore((state) =>
        state.hasSuperAdminPermission(SUPER_ADMIN_PERMISSIONS.ANNOUNCEMENTS_READ),
    );
    const canManageAnnouncements = useAuthStore((state) =>
        state.hasSuperAdminPermission(SUPER_ADMIN_PERMISSIONS.ANNOUNCEMENTS_MANAGE),
    );
    const [editingId, setEditingId] = useState<string | null>(null);
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [level, setLevel] = useState<'info' | 'warning' | 'critical'>('info');
    const [expiresAt, setExpiresAt] = useState('');

    const { data: announcements = [], isLoading } = useQuery({
        queryKey: ['super-admin', 'announcements'],
        queryFn: fetchSuperAdminAnnouncements,
        enabled: canReadAnnouncements,
    });

    const sortedAnnouncements = useMemo(
        () =>
            [...announcements].sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
            ),
        [announcements],
    );

    const resetForm = () => {
        setEditingId(null);
        setTitle('');
        setMessage('');
        setLevel('info');
        setExpiresAt('');
    };

    const invalidateAll = () => {
        queryClient.invalidateQueries({ queryKey: ['super-admin', 'announcements'] });
        queryClient.invalidateQueries({ queryKey: ['super-admin', 'audit'] });
        queryClient.invalidateQueries({ queryKey: SYSTEM_ANNOUNCEMENT_QUERY_KEY });
    };

    const submitMutation = useMutation({
        mutationFn: async () => {
            const payload = {
                title: title.trim(),
                message: message.trim(),
                level,
                ...(expiresAt ? { expiresAt: toIsoFromLocalInput(expiresAt) } : {}),
            };

            if (editingId) {
                await updateSuperAdminAnnouncement(editingId, {
                    ...payload,
                    expiresAt: expiresAt ? toIsoFromLocalInput(expiresAt) : null,
                });
                return;
            }

            await broadcastAnnouncement(payload);
        },
        onSuccess: () => {
            toast.success(editingId ? 'Announcement updated' : 'Announcement sent to all tenants');
            resetForm();
            invalidateAll();
        },
        onError: (error: unknown) => {
            const messageText = (error as any)?.response?.data?.message || 'Failed to save announcement';
            toast.error(messageText);
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (announcementId: string) => deleteSuperAdminAnnouncement(announcementId),
        onSuccess: () => {
            toast.success('Announcement deleted');
            if (editingId) resetForm();
            invalidateAll();
        },
        onError: () => toast.error('Failed to delete announcement'),
    });

    const toggleActiveMutation = useMutation({
        mutationFn: ({ announcementId, isActive }: { announcementId: string; isActive: boolean }) =>
            updateSuperAdminAnnouncement(announcementId, { isActive }),
        onSuccess: () => {
            toast.success('Announcement status updated');
            invalidateAll();
        },
        onError: () => toast.error('Failed to update announcement status'),
    });

    if (!canReadAnnouncements) {
        return (
            <SuperAdminAccessCard message="Your super admin role does not include announcement visibility." />
        );
    }

    return (
        <section className="rounded-2xl border border-border bg-background-card p-5">
            <h2 className="text-lg font-semibold text-text-primary">Announcements</h2>
            <p className="text-xs text-text-tertiary">
                {canManageAnnouncements
                    ? 'Create, edit, delete and control validity period of tenant announcements.'
                    : 'Review active and historical tenant announcements.'}
            </p>

            {canManageAnnouncements && (
                <div className="mt-4 space-y-3 rounded-xl border border-border bg-background-subtle p-4">
                <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-text-primary">
                        {editingId ? 'Edit Announcement' : 'New Broadcast'}
                    </p>
                    {editingId && (
                        <button
                            type="button"
                            onClick={resetForm}
                            className="text-xs font-medium text-text-secondary hover:text-text-primary"
                        >
                            Cancel Edit
                        </button>
                    )}
                </div>
                <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Title"
                    className="w-full rounded-lg border border-border bg-background-card px-3 py-2 text-sm outline-none focus:border-border-strong"
                />
                <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={4}
                    placeholder="Message"
                    className="w-full rounded-lg border border-border bg-background-card px-3 py-2 text-sm outline-none focus:border-border-strong"
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <AppDropdown
                        value={level}
    onChange={(v) => setLevel(v as 'info' | 'warning' | 'critical')}
                        options={[{ value: 'info', label: 'Info' }, { value: 'warning', label: 'Warning' }, { value: 'critical', label: 'Critical' }]}
                        placeholder='Info'
                    />
                    <input
                        type="datetime-local"
                        value={expiresAt}
                        onChange={(e) => setExpiresAt(e.target.value)}
                        className="w-full rounded-lg border border-border bg-background-card px-3 py-2 text-sm outline-none focus:border-border-strong"
                    />
                </div>
                <p className="text-xs text-text-tertiary">Valid till: leave empty for no expiry.</p>
                <button
                    type="button"
                    onClick={() => submitMutation.mutate()}
                    disabled={submitMutation.isPending || !title.trim() || !message.trim()}
                    className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                    <Megaphone size={16} />
                    {editingId ? 'Save Announcement' : 'Send Broadcast'}
                </button>
                </div>
            )}

            <div className="mt-5">
                <h3 className="text-sm font-semibold text-text-primary">Current Announcements</h3>
                <div className="mt-3 space-y-3">
                    {isLoading && <p className="text-sm text-text-tertiary">Loading announcements...</p>}
                    {!isLoading && sortedAnnouncements.length === 0 && (
                        <p className="text-sm text-text-tertiary">No announcements found.</p>
                    )}
                    {sortedAnnouncements.map((item) => (
                        <div key={item.id} className="rounded-xl border border-border p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-sm font-semibold text-text-primary">{item.title}</p>
                                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${levelClassMap[item.level]}`}>
                                            {item.level}
                                        </span>
                                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${item.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-background-subtle text-text-secondary'}`}>
                                            {item.isActive ? 'Active' : 'Inactive'}
                                        </span>
                                        {item.isExpired && (
                                            <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">Expired</span>
                                        )}
                                    </div>
                                    <p className="mt-1 text-sm text-text-secondary">{item.message}</p>
                                    <p className="mt-2 text-xs text-text-tertiary">
                                        Audience: {item.audience === 'single-tenant' ? `Tenant (${item.targetCompanyName || item.targetCompanyId})` : 'All tenants'} | Tenants: {item.tenantCount}
                                    </p>
                                    <p className="text-xs text-text-tertiary">
                                        Created: {new Date(item.createdAt).toLocaleString()} | Valid till: {item.expiresAt ? new Date(item.expiresAt).toLocaleString() : 'No expiry'}
                                    </p>
                                </div>
                                {canManageAnnouncements && (
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setEditingId(item.id);
                                                setTitle(item.title);
                                                setMessage(item.message);
                                                setLevel(item.level);
                                                setExpiresAt(toLocalInputValue(item.expiresAt));
                                            }}
                                            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-text-secondary hover:bg-background-subtle"
                                        >
                                            <Pencil size={13} />
                                            Edit
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => toggleActiveMutation.mutate({ announcementId: item.id, isActive: !item.isActive })}
                                            className="rounded-md border border-border px-2 py-1 text-xs text-text-secondary hover:bg-background-subtle"
                                        >
                                            {item.isActive ? 'Deactivate' : 'Activate'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => deleteMutation.mutate(item.id)}
                                            className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700"
                                        >
                                            <Trash2 size={13} />
                                            Delete
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
