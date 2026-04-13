import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';

interface SupportSessionPanelProps {
    onClose: () => void;
}

interface TranscriptItem {
    id: string;
    action: string;
    actor: string;
    createdAt: string;
    kind: 'session' | 'note' | 'activity';
    before: unknown;
    after: any;
}

export default function SupportSessionPanel({ onClose }: SupportSessionPanelProps) {
    const queryClient = useQueryClient();
    const [note, setNote] = useState('');

    const { data, isLoading } = useQuery({
        queryKey: ['auth', 'impersonation-session'],
        queryFn: async () => {
            const res = await api.get('/auth/impersonation/session');
            return res.data.data as {
                sessionId: string;
                reason: string;
                startedAt: string;
                transcript: TranscriptItem[];
            };
        },
    });

    const noteMutation = useMutation({
        mutationFn: async () => {
            await api.post('/auth/impersonation/session/notes', { note: note.trim() });
        },
        onSuccess: () => {
            setNote('');
            queryClient.invalidateQueries({ queryKey: ['auth', 'impersonation-session'] });
        },
    });

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="flex h-[80vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900">Support Session Transcript</h3>
                        <p className="mt-1 text-xs text-slate-500">
                            {data?.sessionId ? `Session ${data.sessionId}` : 'Loading session...'}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                    >
                        Close
                    </button>
                </div>

                <div className="grid flex-1 grid-cols-1 gap-0 lg:grid-cols-[1.6fr_1fr]">
                    <div className="overflow-y-auto border-r border-slate-200 px-5 py-4">
                        {isLoading && <p className="text-sm text-slate-500">Loading transcript...</p>}
                        {!isLoading && (data?.transcript.length ?? 0) === 0 && (
                            <p className="text-sm text-slate-500">No support-session events recorded yet.</p>
                        )}
                        <div className="space-y-3">
                            {(data?.transcript ?? []).map((item) => (
                                <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                            <p className="text-sm font-semibold text-slate-900">{formatAction(item.action)}</p>
                                            <p className="mt-1 text-xs text-slate-500">
                                                {item.actor} • {new Date(item.createdAt).toLocaleString()}
                                            </p>
                                        </div>
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
                                    {typeof item.after?.note === 'string' && item.after.note && (
                                        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{item.after.note}</p>
                                    )}
                                    {item.kind === 'activity' && (
                                        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                                            {JSON.stringify(item.after, null, 2)}
                                        </pre>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-col px-5 py-4">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Session Context</p>
                            <p className="mt-2 text-sm text-slate-700">{data?.reason || 'Loading reason...'}</p>
                            {data?.startedAt && (
                                <p className="mt-2 text-xs text-slate-500">Started {new Date(data.startedAt).toLocaleString()}</p>
                            )}
                        </div>
                        <div className="mt-4 flex-1">
                            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Add Note</label>
                            <textarea
                                rows={8}
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder="Add a support note about what you investigated or changed."
                                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                            />
                            <button
                                type="button"
                                onClick={() => noteMutation.mutate()}
                                disabled={noteMutation.isPending || note.trim().length < 3}
                                className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                            >
                                {noteMutation.isPending ? 'Saving...' : 'Save Session Note'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function formatAction(action: string) {
    if (action === 'TENANT_USER_IMPERSONATION_STARTED') return 'Session Started';
    if (action === 'TENANT_USER_IMPERSONATION_ENDED') return 'Session Ended';
    if (action === 'TENANT_USER_IMPERSONATION_NOTE') return 'Session Note';
    return action.split('_').join(' ');
}
