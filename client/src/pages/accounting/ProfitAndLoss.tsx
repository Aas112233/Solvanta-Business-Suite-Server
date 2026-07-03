import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import {
    PageTemplate,
    Section,
    KpiCard,
} from '../../components/ui';

interface PLAccount {
    id: string;
    code: string;
    name: string;
    type: 'REVENUE' | 'EXPENSE';
    balance: number;
}

export default function ProfitAndLoss() {
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const { data: plData, isLoading } = useQuery({
        queryKey: ['profitAndLoss', startDate, endDate],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (startDate) params.append('startDate', startDate);
            if (endDate) params.append('endDate', endDate);

            const res = await api.get(`/accounting/reports/pl?${params.toString()}`);
            return res.data.data;
        }
    });

    const details: PLAccount[] = plData?.details || [];
    const summary = plData?.summary || { totalRevenue: 0, totalExpense: 0, netIncome: 0 };

    const revenues = details.filter(d => d.type === 'REVENUE');
    const expenses = details.filter(d => d.type === 'EXPENSE');

    return (
        <PageTemplate
            title="Profit & Loss Statement"
            subtitle="Income statement analysis"
            breadcrumb={[
                { label: 'Home', href: '/' },
                { label: 'Accounting', href: '/accounting' },
                { label: 'Profit & Loss' },
            ]}
            action={
                <div className="flex items-center gap-2">
                    <input
                        type="date"
                        className="h-10 rounded-lg border border-border bg-background-card px-3 text-sm text-text-primary"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                    />
                    <span className="text-text-tertiary">to</span>
                    <input
                        type="date"
                        className="h-10 rounded-lg border border-border bg-background-card px-3 text-sm text-text-primary"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                    />
                </div>
            }
            loading={isLoading}
        >
            {/* Summary KpiCards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <KpiCard
                    label="Total Revenue"
                    value={summary.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    icon={<TrendingUp className="w-6 h-6 text-success" />}
                />
                <KpiCard
                    label="Total Expenses"
                    value={summary.totalExpense.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    icon={<TrendingDown className="w-6 h-6 text-danger" />}
                />
                <KpiCard
                    label="Net Income"
                    value={summary.netIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    icon={<DollarSign className="w-6 h-6 text-text-primary" />}
                    trend={summary.netIncome >= 0 ? 'up' : 'down'}
                />
            </div>

            {/* Table */}
            <Section variant="card" headerBorder={false}>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <tbody className="divide-y divide-border">
                            {/* Revenues Section */}
                            <tr className="bg-background-subtle">
                                <td colSpan={2} className="px-6 py-3 font-semibold text-text-primary uppercase">Operating Revenue</td>
                            </tr>
                            {revenues.length === 0 ? (
                                <tr><td colSpan={2} className="px-6 py-3 text-text-tertiary italic">No revenue recorded</td></tr>
                            ) : revenues.map(rev => (
                                <tr key={rev.id} className="hover:bg-background-subtle transition-colors">
                                    <td className="px-6 pl-10 py-3 text-sm text-text-secondary">{rev.code} - {rev.name}</td>
                                    <td className="px-6 py-3 text-sm text-right font-mono text-text-primary">
                                        {rev.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                </tr>
                            ))}
                            <tr className="bg-accent-soft/50">
                                <td className="px-6 py-4 font-medium text-text-primary text-right">Total Revenue</td>
                                <td className="px-6 py-4 font-mono font-bold text-right text-success">
                                    {summary.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </td>
                            </tr>

                            {/* Expenses Section */}
                            <tr className="bg-background-subtle">
                                <td colSpan={2} className="px-6 py-3 font-semibold text-text-primary uppercase">Operating Expenses</td>
                            </tr>
                            {expenses.length === 0 ? (
                                <tr><td colSpan={2} className="px-6 py-3 text-text-tertiary italic">No expenses recorded</td></tr>
                            ) : expenses.map(exp => (
                                <tr key={exp.id} className="hover:bg-background-subtle transition-colors">
                                    <td className="px-6 pl-10 py-3 text-sm text-text-secondary">{exp.code} - {exp.name}</td>
                                    <td className="px-6 py-3 text-sm text-right font-mono text-text-primary">
                                        {exp.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                </tr>
                            ))}
                            <tr className="bg-danger-soft/50">
                                <td className="px-6 py-4 font-medium text-text-primary text-right">Total Expenses</td>
                                <td className="px-6 py-4 font-mono font-bold text-right text-danger">
                                    {summary.totalExpense.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </td>
                            </tr>
                        </tbody>
                        <tfoot className="border-t-4 border-border bg-background-subtle">
                            <tr>
                                <td className="px-6 py-6 text-lg font-bold text-text-primary text-right">Net Income</td>
                                <td className={`px-6 py-6 text-lg font-mono font-bold text-right ${summary.netIncome >= 0 ? 'text-success' : 'text-danger'}`}>
                                    {summary.netIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </Section>
        </PageTemplate>
    );
}
