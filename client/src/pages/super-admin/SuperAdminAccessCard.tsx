import { Lock } from 'lucide-react';
import { Card, CardContent } from '../../components/ui';

export default function SuperAdminAccessCard({
    title = 'Restricted Super Admin Area',
    message,
}: {
    title?: string;
    message: string;
}) {
    return (
        <Card className="border-warning-200 bg-warning-50" padding="none">
            <CardContent className="p-5 flex items-start gap-3">
                <Lock size={20} className="mt-0.5 text-warning-700" />
                <div>
                    <h2 className="text-lg font-semibold text-warning-900">{title}</h2>
                    <p className="mt-1 text-sm text-warning-800">{message}</p>
                </div>
            </CardContent>
        </Card>
    );
}
