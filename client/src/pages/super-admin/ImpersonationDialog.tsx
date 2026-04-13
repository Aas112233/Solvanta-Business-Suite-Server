interface ImpersonationDialogProps {
    userName: string;
    userEmail: string;
    reason: string;
    ticket: string;
    onReasonChange: (value: string) => void;
    onTicketChange: (value: string) => void;
    onClose: () => void;
    onConfirm: () => void;
    isSubmitting?: boolean;
}

export default function ImpersonationDialog({
    userName,
    userEmail,
    reason,
    ticket,
    onReasonChange,
    onTicketChange,
    onClose,
    onConfirm,
    isSubmitting = false,
}: ImpersonationDialogProps) {
    const trimmedReason = reason.trim();

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
                <h3 className="text-lg font-bold text-slate-900">Start Support Session</h3>
                <p className="mt-1 text-sm text-slate-500">
                    You are about to impersonate <span className="font-semibold text-slate-700">{userName}</span> ({userEmail}).
                </p>
                <div className="mt-4 space-y-3">
                    <textarea
                        rows={4}
                        value={reason}
                        onChange={(e) => onReasonChange(e.target.value)}
                        placeholder="Why are you starting this session? Be specific."
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                    />
                    <input
                        value={ticket}
                        onChange={(e) => onTicketChange(e.target.value)}
                        placeholder="Support ticket or reference number (optional)"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                    />
                    <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        This session will be audit logged, and an impersonation banner will remain visible until you exit.
                    </div>
                </div>
                <div className="mt-5 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={isSubmitting || trimmedReason.length < 6}
                        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                        {isSubmitting ? 'Starting...' : 'Start Impersonation'}
                    </button>
                </div>
            </div>
        </div>
    );
}
