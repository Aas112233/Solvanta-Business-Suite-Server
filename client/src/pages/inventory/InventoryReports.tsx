import { Link } from 'react-router-dom';
import { BookOpen, ClipboardCheck, TrendingUp } from 'lucide-react';

const reportTypes = [
    {
        title: 'Running Stock Ledger',
        description: 'Item-wise movement timeline with running stock balance',
        to: '/reports/running-stock-ledger',
        icon: BookOpen,
    },
    {
        title: 'Stock Count and Adjust',
        description: 'Count sessions, variances, and stock adjustment history',
        to: '/inventory/stock-counts',
        icon: ClipboardCheck,
    },
    {
        title: 'Analytics & Trends',
        description: 'Valuation, top items, and movement insights',
        to: '/inventory/analytics',
        icon: TrendingUp,
    },
];

export default function InventoryReports() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Inventory Reports</h1>
                <p className="text-sm text-gray-600 mt-1">Choose a report type to continue.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {reportTypes.map((report) => (
                    <Link
                        key={report.to}
                        to={report.to}
                        className="rounded-xl border border-gray-200 bg-white p-5 hover:border-blue-300 hover:shadow-sm transition"
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <report.icon size={18} className="text-blue-600" />
                            <h2 className="text-base font-semibold text-gray-900">{report.title}</h2>
                        </div>
                        <p className="text-sm text-gray-600">{report.description}</p>
                    </Link>
                ))}
            </div>
        </div>
    );
}
