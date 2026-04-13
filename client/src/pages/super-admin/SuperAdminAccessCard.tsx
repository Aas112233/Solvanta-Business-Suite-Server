import { Lock } from 'lucide-react';

export default function SuperAdminAccessCard({
    title = 'Restricted Super Admin Area',
    message,
}: {
    title?: string;
    message: string;
}) {
    return (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <div className="flex items-start gap-3">
                <Lock size={20} className="mt-0.5 text-amber-700" />
                <div>
                    <h2 className="text-lg font-semibold text-amber-900">{title}</h2>
                    <p className="mt-1 text-sm text-amber-800">{message}</p>
                </div>
            </div>
        </div>
    );
}
