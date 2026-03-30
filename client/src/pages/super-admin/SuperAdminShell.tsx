import { Outlet } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { isCurrentUserSuperAdmin } from '../../lib/superAdmin';

export default function SuperAdminShell() {
    const canAccess = isCurrentUserSuperAdmin();

    if (!canAccess) {
        return (
            <div className="max-w-5xl mx-auto rounded-2xl border border-red-200 bg-red-50 p-6">
                <div className="flex items-start gap-3">
                    <Lock size={20} className="text-red-600 mt-0.5" />
                    <div>
                        <h1 className="text-lg font-semibold text-red-800">Super Admin Access Required</h1>
                        <p className="text-sm text-red-700 mt-1">
                            Your account is not listed in `VITE_SUPER_ADMIN_EMAILS` and `SUPER_ADMIN_EMAILS`.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <h1 className="text-xl font-bold text-slate-900">Super Admin</h1>
                <p className="text-sm text-slate-600 mt-1">Platform-level controls and operations.</p>
            </div>
            <Outlet />
        </div>
    );
}
