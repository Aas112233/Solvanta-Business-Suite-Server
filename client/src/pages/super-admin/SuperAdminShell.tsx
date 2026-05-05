import { Outlet } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import AppLoader from '../../components/ui/AppLoader';
import { PageHeader, PageLayout, Card, CardContent } from '../../components/ui';

export default function SuperAdminShell() {
    const token = useAuthStore((state) => state.token);
    const user = useAuthStore((state) => state.user);
    const canAccess = useAuthStore((state) => Boolean(state.user?.isSuperAdmin));

    if (token && !user) {
        return <AppLoader />;
    }

    if (!canAccess) {
        return (
            <PageLayout className="py-8">
                <Card className="border-danger-200 bg-danger-50" padding="none">
                    <CardContent className="p-6">
                        <div className="flex items-start gap-3">
                            <Lock size={20} className="text-danger-600 mt-0.5" />
                            <div>
                                <h1 className="text-lg font-semibold text-danger-800">Super Admin Access Required</h1>
                                <p className="text-sm text-danger-700 mt-1">
                                    Your account does not have super admin access. Contact a platform administrator if this is unexpected.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </PageLayout>
        );
    }

    return (
        <PageLayout className="animate-in fade-in duration-500 py-6 space-y-6">
            <PageHeader 
                title="Super Admin Controls" 
                subtitle="Platform-level operations and tenant management." 
            />
            <Outlet />
        </PageLayout>
    );
}
