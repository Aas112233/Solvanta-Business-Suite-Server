import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { Calculator, DollarSign, CheckCircle, AlertTriangle } from 'lucide-react';
import { toDateInputValue } from '../../lib/companySettings';
import { useAuthStore } from '../../stores/authStore';
import {
    PageTemplate,
    Section,
    KpiCard,
} from '../../components/ui';

interface TrialBalanceLine {
    id: string;
    code: string;
    name: string;
    type: string;
    debit: number;
    credit: number;
    balance: number;
}

export default function TrialBalance() {
    const company = useAuthStore((s) => s.user?.company);
    const [asOfDate, setAsOfDate] = useState(() => toDateInputValue(undefined, company));

    const { data: tbLines = [], isLoading } = useQuery<TrialBalanceLine[]>({
        queryKey: ['trialBalance', asOfDate],
        queryFn: async () => {
            const res = await api.get('/accounting/reports/trial-balance', {
                params: { asOfDate }
            });
            return res.data.data || [];
        }
    });

    const totalDebit = tbLines.reduce((sum, l) => sum + (l.debit || 0), 0);
    const totalCredit = tbLines.reduce((sum, l) => sum + (l.credit || 0), 0);
    const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

    return (
        <PageTemplate
            title="Trial Balance"
            subtitle="Real-time ledger extract"
            breadcrumb={[
                { label: 'Home', href: '/' },
                { label: 'Accounting', href: '/accounting' },
                { label: 'Trial Balance' },
            ]}
            action={
                <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-text-tertiary">As Of:</label>
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
                    label="Total Debits"
                    value={totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    icon={<DollarSign className="w-6 h-6 text-text-primary" />}
                />
                <KpiCard
                    label="Total Credits"
                    value={totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    icon={<DollarSign className="w-6 h-6 text-text-primary" />}
                />
                <KpiCard
                    label="Status"
                    value={isBalanced ? 'Balanced' : 'Out of Balance'}
                    icon={isBalanced ? <CheckCircle className="w-6 h-6 text-success" /> : <AlertTriangle className="w-6 h-6 text-danger" />}
                />
            </div>

            {/* Table */}
            <Section variant="card" headerBorder={false}>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-background-subtle border-b border-border">
                            <tr>
                                <th className="px-6 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Account</th>
                                <th className="px-6 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Type</th>
                                <th className="px-6 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider text-right">Debit</th>
                                <th className="px-6 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider text-right">Credit</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {tbLines.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-8 text-center text-text-tertiary">
                                        <Calculator className="w-12 h-12 mx-auto text-text-tertiary mb-3" />
                                        <p>No activity recorded yet.</p>
                                    </td>
                                </tr>
                            ) : (
                                tbLines.map((line) => (
                                    <tr key={line.id} className="hover:bg-background-subtle transition-colors">
                                        <td className="px-6 py-4 text-sm font-medium text-text-primary">{line.code} - {line.name}</td>
                                        <td className="px-6 py-4 text-sm text-text-tertiary">{line.type}</td>
                                        <td className="px-6 py-4 text-sm font-mono text-right text-text-secondary">
                                            {line.debit > 0 ? line.debit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}
                                        </td>
                                        <td className="px-6 py-4 text-sm font-mono text-right text-text-secondary">
                                            {line.credit > 0 ? line.credit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                        <tfoot className="bg-background-subtle border-t-2 border-border font-semibold">
                            <tr>
                                <td colSpan={2} className="px-6 py-4 text-right text-text-primary">Grand Total</td>
                                <td className={`px-6 py-4 text-right font-mono ${!isBalanced ? 'text-danger' : 'text-text-primary'}`}>
                                    {totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </td>
                                <td className={`px-6 py-4 text-right font-mono ${!isBalanced ? 'text-danger' : 'text-text-primary'}`}>
                                    {totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </td>
                            </tr>
                            {!isBalanced && (
                                <tr>
                                    <td colSpan={4} className="px-6 py-2 text-danger text-sm font-bold text-center bg-danger-soft">
                                        Warning: Trial Balance is out of balance. Imbalance: {Math.abs(totalDebit - totalCredit).toLocaleString()}
                                    </td>
                                </tr>
                            )}
                        </tfoot>
                    </table>
                </div>
            </Section>
        </PageTemplate>
    );
}
