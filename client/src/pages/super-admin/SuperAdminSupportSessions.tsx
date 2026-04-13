import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Download, ExternalLink } from 'lucide-react';
import AppDropdown from '../../components/ui/AppDropdown';
import { useAuthStore } from '../../stores/authStore';
import { SUPER_ADMIN_PERMISSIONS } from '../../lib/superAdminPermissions';
import SuperAdminAccessCard from './SuperAdminAccessCard';
import {
    exportSupportSessionTranscriptCsv,
    fetchSupportSessionTranscript,
    fetchSupportSessions,
    fetchSuperAdminTenants,
} from './api';

export default function SuperAdminSupportSessions() {
    const canReadAudit = useAuthStore((state) =>
        state.hasSuperAdminPermission(SUPER_ADMIN_PERMISSIONS.AUDIT_READ),
    );
    const canReadTenants = useAuthStore((state) =>
        state.hasSuperAdminPermission(SUPER_ADMIN_PERMISSIONS.TENANTS_READ),
    );
    const [search, setSearch] = useState('');
    const [actor, setActor] = useState('');
    const [companyId, setCompanyId] = useState('');
    const [status, setStatus] = useState<'All' | 'Active' | 'Ended'>('All');
    const [selectedSessionId, setSelectedSessionId] = useState('');

    const { data: tenants = [] } = useQuery({
        queryKey: ['super-admin', 'tenants'],
        queryFn: () => fetchSuperAdminTenants(),
        enabled: canReadAudit && canReadTenants,
    });

    const { data: sessions = [], isLoading } = useQuery({
        queryKey: ['super-admin', 'support-sessions', { search, actor, companyId, status }],
        queryFn: () => fetchSupportSessions({
            search: search.trim() || undefined,
            actor: actor.trim() || undefined,
            companyId: companyId || undefined,
            status,
        }),
        enabled: canReadAudit,
    });

    const { data: transcriptData, isLoading: transcriptLoading } = useQuery({
        queryKey: ['super-admin', 'support-session-transcript', selectedSessionId],
        queryFn: () => fetchSupportSessionTranscript(selectedSessionId),
        enabled: canReadAudit && Boolean(selectedSessionId),
    });

    const exportMutation = useMutation({
        mutationFn: () => exportSupportSessionTranscriptCsv(selectedSessionId),
        onSuccess: (blob) => {
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `support-session-${selectedSessionId}.csv`;
            link.click();
            window.URL.revokeObjectURL(url);
        },
    });

    if (!canReadAudit) {
        return (
            <SuperAdminAccessCard message="Your super admin role does not include support session access." />
        );
    }

    return (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="text-lg font-semibold text-slate-900">Support Sessions</h2>
                <p className="text-xs text-slate-500">Review historical impersonation sessions, filter by actor or tenant, and open any transcript.</p>

                <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search actor, tenant, reason..."
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                    />
                    <input
                        value={actor}
                        onChange={(e) => setActor(e.target.value)}
                        placeholder="Filter by actor email"
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                    />
                    <AppDropdown
                        value={companyId}
                        onChange={(value) => setCompanyId(value)}
                        options={[{ value: '', label: 'All companies' }, ...tenants.map((tenant) => ({ value: tenant.id, label: tenant.name }))]}
                        placeholder="All companies"
                        searchable
                    />
                    <AppDropdown
                        value={status}
                        onChange={(value) => setStatus((value as 'All' | 'Active' | 'Ended') || 'All')}
                        options={[
                            { value: 'All', label: 'All statuses' },
                            { value: 'Active', label: 'Active' },
                            { value: 'Ended', label: 'Ended' },
                        ]}
                        placeholder="All statuses"
                    />
                </div>

                <div className="mt-4 space-y-3">
                    {isLoading && <p className="text-sm text-slate-500">Loading sessions...</p>}
                    {!isLoading && sessions.length === 0 && <p className="text-sm text-slate-500">No support sessions matched your filters.</p>}
                    {!isLoading && sessions.map((session) => (
                        <button
                            key={session.sessionId}
                            type="button"
                            onClick={() => setSelectedSessionId(session.sessionId)}
                            className={`w-full rounded-2xl border p-4 text-left transition ${
                                selectedSessionId === session.sessionId
                                    ? 'border-slate-900 bg-slate-50'
                                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                            }`}
                        >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <p className="text-sm font-semibold text-slate-900">{session.actor}</p>
                                    <p className="mt-1 text-xs text-slate-500">{session.company} • {session.targetUserEmail || 'Target user not captured'}</p>
                                </div>
                                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
                                    session.status === 'Active'
                                        ? 'bg-emerald-50 text-emerald-700'
                                        : 'bg-slate-100 text-slate-700'
                                }`}>
                                    {session.status}
                                </span>
                            </div>
                            <p className="mt-3 text-sm text-slate-700">{session.reason || 'No reason recorded'}</p>
                            <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
                                <span>Session: {session.sessionId}</span>
                                <span>Started: {new Date(session.startedAt).toLocaleString()}</span>
                                <span>Last activity: {new Date(session.lastActivityAt).toLocaleString()}</span>
                                <span>{session.noteCount} notes</span>
                                <span>{session.activityCount} actions</span>
                            </div>
                        </button>
                    ))}
                </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="text-lg font-semibold text-slate-900">Transcript</h3>
                <p className="text-xs text-slate-500">Open a session to inspect its full support trail.</p>

                {!selectedSessionId && (
                    <p className="mt-4 text-sm text-slate-500">Select a support session from the left to inspect its transcript.</p>
                )}

                {selectedSessionId && transcriptLoading && (
                    <p className="mt-4 text-sm text-slate-500">Loading transcript...</p>
                )}

                {selectedSessionId && !transcriptLoading && transcriptData && (
                    <div className="mt-4 space-y-3">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Session</p>
                                    <p className="mt-2 text-sm text-slate-900">{transcriptData.sessionId}</p>
                                    <p className="mt-1 text-xs text-slate-500">{transcriptData.company}</p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    {transcriptData.companyId && (
                                        <Link
                                            to={`/super-admin/companies/${transcriptData.companyId}`}
                                            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-white"
                                        >
                                            <ExternalLink size={14} />
                                            Open Tenant
                                        </Link>
                                    )}
                                    {transcriptData.companyId && transcriptData.targetUserId && (
                                        <Link
                                            to={`/super-admin/companies/${transcriptData.companyId}?userId=${encodeURIComponent(transcriptData.targetUserId)}`}
                                            className="inline-flex items-center gap-1 rounded-lg border border-amber-300 px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-50"
                                        >
                                            <ExternalLink size={14} />
                                            Open User
                                        </Link>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => exportMutation.mutate()}
                                        disabled={exportMutation.isPending}
                                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-white disabled:opacity-50"
                                    >
                                        <Download size={14} />
                                        {exportMutation.isPending ? 'Exporting...' : 'Export CSV'}
                                    </button>
                                </div>
                            </div>
                            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                                <MetaChip label="Actor" value={transcriptData.actorEmail || transcriptData.actor} />
                                <MetaChip label="Target User" value={transcriptData.targetUserEmail || 'Not captured'} />
                                <MetaChip label="Started" value={new Date(transcriptData.startedAt).toLocaleString()} />
                                <MetaChip
                                    label="Ended"
                                    value={transcriptData.endedAt ? new Date(transcriptData.endedAt).toLocaleString() : 'Still active'}
                                />
                            </div>
                            {transcriptData.reason && (
                                <p className="mt-3 rounded-lg bg-white px-3 py-2 text-sm text-slate-700">
                                    {transcriptData.reason}
                                </p>
                            )}
                        </div>
                        <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
                            {transcriptData.transcript.map((item) => (
                                <TranscriptCard
                                    key={item.id}
                                    item={item}
                                    sessionCompanyId={transcriptData.companyId}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
}

function TranscriptCard({
    item,
    sessionCompanyId,
}: {
    item: Awaited<ReturnType<typeof fetchSupportSessionTranscript>>['transcript'][number];
    sessionCompanyId: string;
}) {
    const companyLink = item.companyId || sessionCompanyId;
    const userLink = item.entity === 'User' && companyLink && item.entityId
        ? `/super-admin/companies/${companyLink}?userId=${encodeURIComponent(item.entityId)}`
        : '';
    const tenantLink = item.entity === 'Company' && item.entityId
        ? `/super-admin/companies/${item.entityId}`
        : companyLink
            ? `/super-admin/companies/${companyLink}`
            : '';

    return (
        <div className="rounded-xl border border-slate-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <p className="text-sm font-semibold text-slate-900">{formatAction(item.action)}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.actor} • {new Date(item.createdAt).toLocaleString()}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {userLink && (
                        <Link
                            to={userLink}
                            className="inline-flex items-center gap-1 rounded-full border border-amber-300 px-2 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-50"
                        >
                            <ExternalLink size={12} />
                            Open User
                        </Link>
                    )}
                    {!userLink && tenantLink && (
                        <Link
                            to={tenantLink}
                            className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            <ExternalLink size={12} />
                            Open Tenant
                        </Link>
                    )}
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        item.kind === 'note'
                            ? 'bg-sky-50 text-sky-700'
                            : item.kind === 'session'
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-slate-100 text-slate-700'
                    }`}>
                        {item.kind}
                    </span>
                </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                <span className="rounded-full bg-slate-100 px-2 py-1">{item.entity}</span>
                {item.entityId && <span className="rounded-full bg-slate-100 px-2 py-1">{item.entityId}</span>}
            </div>
            {typeof item.after?.note === 'string' && item.after.note && (
                <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{item.after.note}</p>
            )}
            {item.kind !== 'note' && (
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    {JSON.stringify(item.after, null, 2)}
                </pre>
            )}
        </div>
    );
}

function formatAction(action: string) {
    if (action === 'TENANT_USER_IMPERSONATION_STARTED') return 'Session Started';
    if (action === 'TENANT_USER_IMPERSONATION_ENDED') return 'Session Ended';
    if (action === 'TENANT_USER_IMPERSONATION_NOTE') return 'Session Note';
    return action.split('_').join(' ');
}

function MetaChip({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg bg-white px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 text-sm text-slate-800">{value}</p>
        </div>
    );
}
