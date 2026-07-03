import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { Banknote, Scale, AlertTriangle, CheckCircle } from 'lucide-react';
import {
    PageTemplate,
    Section,
    KpiCard,
} from '../../components/ui';

export default function BalanceSheet() {
    const [asOfDate, setAsOfDate] = useState('');

    const { data: bsData, isLoading } = useQuery({
        queryKey: ['balanceSheet', asOfDate],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (asOfDate) params.append('asOfDate', asOfDate);

            const res = await api.get(`/accounting/reports/balance-sheet?${params.toString()}`);
            return res.data.data;
        }
    });

    const { assets, liabilities, equity, summary } = bsData || {
        assets: { items: [], total: 0 },
        liabilities: { items: [], total: 0 },
        equity: { items: [], total: 0, retainedEarnings: 0, totalIncludingRE: 0 },
        summary: { totalAssets: 0, totalEquityAndLiabilities: 0, isBalanced: true }
    };

    return (
        <PageTemplate
            title="Balance Sheet"
            subtitle="Snapshot of financial position"
            breadcrumb={[
                { label: 'Home', href: '/' },
                { label: 'Accounting', href: '/accounting' },
                { label: 'Balance Sheet' },
            ]}
            action={
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-tertiary">As of:</span>
                    <input
                        type="date"
                        className="h-10 rounded-lg border border-border bg-background-card px-3 text-sm text-text-primary"
                        value={asOfDate}
                        onChange={(e) => setAsOfDate(e.target.value)}
                    />
                </div>
            }
            loading={isLoading}
        >
            {/* Summary KpiCards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <KpiCard
                    label="Total Assets"
                    value={summary.totalAssets.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    icon={<Banknote className="w-6 h-6 text-success" />}
                />
                <KpiCard
                    label="Total Liabilities & Equity"
                    value={summary.totalEquityAndLiabilities.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    icon={<Scale className="w-6 h-6 text-text-primary" />}
                />
                <KpiCard
                    label="Status"
                    value={summary.isBalanced ? 'Balanced' : 'Out of Balance'}
                    icon={summary.isBalanced ? <CheckCircle className="w-6 h-6 text-success" /> : <AlertTriangle className="w-6 h-6 text-danger" />}
                />
            </div>

            {/* 2-Column Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Assets Column */}
                <div className="space-y-8">
                    <Section variant="card" headerBorder={false} className="p-0 overflow-hidden">
                        <div className="bg-success-soft px-6 py-4 border-b border-border">
                            <h2 className="text-lg font-bold text-text-primary">Assets</h2>
                        </div>
                        <table className="w-full text-left">
                            <tbody className="divide-y divide-border">
                                {assets.items.map((item: any) => (
                                    <tr key={item.id} className="hover:bg-background-subtle transition-colors">
                                        <td className="px-6 py-3 text-sm text-text-secondary">{item.name}</td>
                                        <td className="px-6 py-3 text-sm text-right font-mono text-text-secondary">
                                            {item.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="border-t-2 border-border">
                                <tr className="bg-background-subtle">
                                    <td className="px-6 py-4 font-bold text-text-primary">Total Assets</td>
                                    <td className="px-6 py-4 font-bold font-mono text-right text-text-primary">
                                        {summary.totalAssets.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </Section>
                </div>

                {/* Liabilities & Equity Column */}
                <div className="space-y-8">
                    {/* Liabilities */}
                    <Section variant="card" headerBorder={false} className="p-0 overflow-hidden">
                        <div className="bg-warning-soft px-6 py-4 border-b border-border">
                            <h2 className="text-lg font-bold text-text-primary">Liabilities</h2>
                        </div>
                        <table className="w-full text-left">
                            <tbody className="divide-y divide-border">
                                {liabilities.items.map((item: any) => (
                                    <tr key={item.id} className="hover:bg-background-subtle transition-colors">
                                        <td className="px-6 py-3 text-sm text-text-secondary">{item.name}</td>
                                        <td className="px-6 py-3 text-sm text-right font-mono text-text-secondary">
                                            {item.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="border-t border-border">
                                <tr className="bg-background-subtle">
                                    <td className="px-6 py-3 font-semibold text-text-primary">Total Liabilities</td>
                                    <td className="px-6 py-3 font-semibold font-mono text-right text-text-primary">
                                        {liabilities.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </Section>

                    {/* Equity */}
                    <Section variant="card" headerBorder={false} className="p-0 overflow-hidden">
                        <div className="bg-accent-soft px-6 py-4 border-b border-border">
                            <h2 className="text-lg font-bold text-text-primary">Equity</h2>
                        </div>
                        <table className="w-full text-left">
                            <tbody className="divide-y divide-border">
                                {equity.items.map((item: any) => (
                                    <tr key={item.id} className="hover:bg-background-subtle transition-colors">
                                        <td className="px-6 py-3 text-sm text-text-secondary">{item.name}</td>
                                        <td className="px-6 py-3 text-sm text-right font-mono text-text-secondary">
                                            {item.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                    </tr>
                                ))}
                                <tr className="bg-accent-soft/30">
                                    <td className="px-6 py-3 text-sm font-medium text-text-primary">Current Year Retained Earnings</td>
                                    <td className="px-6 py-3 text-sm font-medium text-right font-mono text-text-primary">
                                        {equity.retainedEarnings.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                </tr>
                            </tbody>
                            <tfoot className="border-t border-border">
                                <tr className="bg-background-subtle">
                                    <td className="px-6 py-3 font-semibold text-text-primary">Total Equity</td>
                                    <td className="px-6 py-3 font-semibold font-mono text-right text-text-primary">
                                        {equity.totalIncludingRE.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </Section>

                    {/* Balanced Warning */}
                    {!summary.isBalanced && (
                        <div className="p-4 bg-danger-soft text-danger rounded-lg font-medium border border-border">
                            Warning: Balance Sheet does not balance! Discrepancy: {Math.abs(summary.totalAssets - summary.totalEquityAndLiabilities).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>
                    )}
                </div>
            </div>
        </PageTemplate>
    );
}
