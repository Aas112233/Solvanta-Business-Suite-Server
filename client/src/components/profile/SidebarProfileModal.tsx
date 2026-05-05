import { Building2, CalendarRange, Clock3, GitBranch, Mail, ShieldCheck } from 'lucide-react';
import Modal from '../ui/Modal';
import type { User } from '../../stores/authStore';
import { ProfileField, ProfileSection, ProfileUsageMeter, StorageStatusBadge } from './ProfileInfo';

interface SidebarProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: User | null;
}

function formatDate(value?: string | null) {
    if (!value) return 'Not available';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'Not available';
    return parsed.toLocaleString();
}

function formatDateOnly(value?: string | null) {
    if (!value) return 'Not available';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'Not available';
    return parsed.toLocaleDateString();
}

export default function SidebarProfileModal({ isOpen, onClose, user }: SidebarProfileModalProps) {
    if (!user) return null;

    const initials = user.name?.trim()?.charAt(0)?.toUpperCase() || 'U';
    const storageStatus = user.profileSummary?.storageStatus || 'ok';
    const usage = user.profileSummary?.usage || { users: 0, branches: 0, products: 0 };
    const limits = user.profileSummary?.limits || { maxUsers: null, maxBranches: null, maxProducts: null };

    return (
        <Modal isOpen={isOpen} onClose={onClose} maxWidth="5xl" title="Profile Overview">
            <div className="space-y-6">
                <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-6 text-white shadow-xl">
                    <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-center gap-4">
                            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-2xl font-bold shadow-lg ring-1 ring-white/15">
                                {initials}
                            </div>
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">Logged-In User</p>
                                <h2 className="mt-1 text-2xl font-bold">{user.name}</h2>
                                <p className="mt-1 text-sm text-slate-200">{user.email}</p>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">
                                {user.role?.name || 'No role'}
                            </span>
                            <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">
                                {user.company?.name || 'No company'}
                            </span>
                            {user.isSuperAdmin && (
                                <span className="inline-flex items-center rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-semibold text-emerald-100">
                                    Super Admin
                                </span>
                            )}
                        </div>
                    </div>
                </section>

                {user.impersonation?.isActive && (
                    <ProfileSection title="Impersonation Session" subtitle="Current support-session context for this login">
                        <div className="grid gap-3 md:grid-cols-3">
                            <ProfileField label="Started By" value={user.impersonation.actorName || user.impersonation.actorEmail} />
                            <ProfileField label="Started At" value={formatDate(user.impersonation.startedAt)} />
                            <ProfileField label="Reason" value={user.impersonation.reason || 'Not provided'} />
                        </div>
                    </ProfileSection>
                )}

                <div className="grid gap-4 xl:grid-cols-2">
                    <ProfileSection title="User Info" subtitle="Identity, access, and activity details">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <ProfileField label="User ID" value={user.id} />
                            <ProfileField label="Role" value={user.role?.name || 'Unassigned'} />
                            <ProfileField label="Email" value={<span className="inline-flex items-center gap-2"><Mail className="h-4 w-4 text-slate-400" />{user.email}</span>} />
                            <ProfileField label="Account Created" value={formatDate(user.createdAt)} />
                            <ProfileField label="Last Login" value={formatDate(user.lastLoginAt)} />
                            <ProfileField label="Access Level" value={<span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-slate-400" />{user.isSuperAdmin ? 'Super Admin' : 'Standard User'}</span>} />
                        </div>
                        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Branch Access</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {user.branches.length > 0 ? user.branches.map((branch) => (
                                    <span key={branch.id} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">
                                        <GitBranch className="h-3.5 w-3.5 text-slate-400" />
                                        {branch.name} ({branch.code})
                                    </span>
                                )) : (
                                    <span className="text-sm text-slate-500">No branch assignments found.</span>
                                )}
                            </div>
                        </div>
                    </ProfileSection>

                    <ProfileSection title="Company Info" subtitle="Workspace identity and lifecycle dates">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <ProfileField label="Company Name" value={<span className="inline-flex items-center gap-2"><Building2 className="h-4 w-4 text-slate-400" />{user.company?.name || 'Not available'}</span>} />
                            <ProfileField label="Company ID" value={user.company?.id || 'Not available'} />
                            <ProfileField label="Currency" value={user.company?.currency || 'Not available'} />
                            <ProfileField label="Setup Status" value={user.company?.setupCompleted ? 'Completed' : 'Pending'} />
                            <ProfileField label="Start Date" value={<span className="inline-flex items-center gap-2"><CalendarRange className="h-4 w-4 text-slate-400" />{formatDateOnly(user.profileSummary?.companyStartDate)}</span>} />
                            <ProfileField label={user.profileSummary?.companyEndDateLabel || 'End Date'} value={<span className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4 text-slate-400" />{formatDateOnly(user.profileSummary?.companyEndDate)}</span>} />
                        </div>
                    </ProfileSection>
                </div>

                <ProfileSection title="Storage Status" subtitle="Tracked tenant usage across users, branches, and products">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <div>
                            <p className="text-sm font-semibold text-slate-900">Current Usage Health</p>
                            <p className="text-xs text-slate-500">Usage is measured against your configured tenant limits.</p>
                        </div>
                        <StorageStatusBadge status={storageStatus} />
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                        <ProfileUsageMeter label="Users" count={usage.users} limit={limits.maxUsers} />
                        <ProfileUsageMeter label="Branches" count={usage.branches} limit={limits.maxBranches} />
                        <ProfileUsageMeter label="Products" count={usage.products} limit={limits.maxProducts} />
                    </div>
                </ProfileSection>
            </div>
        </Modal>
    );
}
