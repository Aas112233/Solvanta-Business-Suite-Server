type TenantStatusAction = 'Active' | 'Suspended';

export default function TenantStatusDialog({
    tenantName,
    nextStatus,
    reason,
    onReasonChange,
    onClose,
    onConfirm,
    isSubmitting,
    affectedUsers,
}: {
    tenantName: string;
    nextStatus: TenantStatusAction;
    reason: string;
    onReasonChange: (value: string) => void;
    onClose: () => void;
    onConfirm: () => void;
    isSubmitting: boolean;
    affectedUsers: number;
}) {
    const isSuspending = nextStatus === 'Suspended';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-lg rounded-2xl bg-background-card p-5 shadow-xl">
                <h3 className="text-lg font-bold text-text-primary">
                    {isSuspending ? 'Suspend Tenant' : 'Reactivate Tenant'}
                </h3>
                <p className="mt-2 text-sm text-text-secondary">
                    <span className="font-semibold">{tenantName}</span>{' '}
                    {isSuspending
                        ? 'will be blocked from logging in and using the platform.'
                        : 'will regain platform access.'}
                </p>
                <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
                    isSuspending
                        ? 'border-red-200 bg-red-50 text-red-800'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                }`}>
                    {isSuspending
                        ? `${affectedUsers} active user${affectedUsers === 1 ? '' : 's'} will be paused and tracked for safe reactivation.`
                        : `${affectedUsers} user${affectedUsers === 1 ? '' : 's'} auto-disabled by the last suspension will be restored.`}
                </div>

                {isSuspending && (
                    <div className="mt-4">
                        <label className="text-xs font-medium uppercase tracking-wide text-text-tertiary">
                            Suspension Reason
                        </label>
                        <textarea
                            rows={4}
                            value={reason}
                            onChange={(e) => onReasonChange(e.target.value)}
                            placeholder="Explain why this tenant is being suspended"
                            className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-border-strong"
                        />
                    </div>
                )}

                <div className="mt-5 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg px-4 py-2 text-sm font-medium text-text-secondary hover:bg-background-subtle"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        disabled={isSubmitting || (isSuspending && !reason.trim())}
                        onClick={onConfirm}
                        className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
                            isSuspending ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'
                        }`}
                    >
                        {isSubmitting
                            ? (isSuspending ? 'Suspending...' : 'Reactivating...')
                            : (isSuspending ? 'Confirm Suspension' : 'Confirm Reactivation')}
                    </button>
                </div>
            </div>
        </div>
    );
}
