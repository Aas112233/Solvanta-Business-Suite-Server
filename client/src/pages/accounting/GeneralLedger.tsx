import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { Calculator, Download } from 'lucide-react';
import { exportExcel } from '../../lib/fileExport';
import { formatCompanyDate, toDateInputValue } from '../../lib/companySettings';
import { useAuthStore } from '../../stores/authStore';
import { PageTemplate, Section, Button, Select, KpiCard } from '../../components/ui';

interface Account {
    id: string;
    code: string;
    name: string;
    type: string;
}

interface GLTransaction {
    id: string;
    date: string;
    entryNo: string;
    memo: string;
    sourceType: string;
    debit: number;
    credit: number;
    balance: number;
}

interface GLData {
    account: Account;
    openingBalance: number;
    transactions: GLTransaction[];
    summary: {
        totalDebits: number;
        totalCredits: number;
        closingBalance: number;
    };
}

export default function GeneralLedger() {
    const company = useAuthStore((s) => s.user?.company);
    // Default to current month
    const today = new Date();
    const firstDay = toDateInputValue(new Date(today.getFullYear(), today.getMonth(), 1), company);
    const lastDay = toDateInputValue(new Date(today.getFullYear(), today.getMonth() + 1, 0), company);

    const [startDate, setStartDate] = useState(firstDay);
    const [endDate, setEndDate] = useState(lastDay);
    const [accountId, setAccountId] = useState('');

    const { data: accounts = [] } = useQuery<Account[]>({
        queryKey: ['accounts-lite'],
        queryFn: async () => {
            const res = await api.get('/accounting/accounts');
            return res.data.data || [];
        }
    });

    const { data: glData, isLoading, isError } = useQuery<GLData>({
        queryKey: ['generalLedger', accountId, startDate, endDate],
        queryFn: async () => {
            if (!accountId) return null;
            const res = await api.get('/accounting/reports/general-ledger', {
                params: {
                    accountId,
                    ...(startDate ? { startDate } : {}),
                    ...(endDate ? { endDate } : {})
                }
            });
            return res.data.data;
        },
        enabled: !!accountId
    });

    const handleExportExcel = async () => {
        if (!glData) return;

        const dateStr = `${startDate || 'Start'} to ${endDate || 'End'}`;
        await exportExcel({
            fileName: `General_Ledger_${glData.account.code}_${new Date().getTime()}`,
            sheetName: 'General Ledger',
            title: 'General Ledger Account Statement',
            customMeta: {
                'Account': `${glData.account.code} - ${glData.account.name}`,
                'Period': dateStr
            },
            columns: [
                { header: 'Date', key: 'date', width: 15 },
                { header: 'Entry No', key: 'entryNo', width: 25 },
                { header: 'Memo / Source', key: 'memo', width: 35 },
                { header: 'Debit', key: 'debit', type: 'currency', width: 15 },
                { header: 'Credit', key: 'credit', type: 'currency', width: 15 },
                { header: 'Balance', key: 'balance', type: 'currency', width: 15 },
            ],
            rows: [
                {
                    date: startDate || '',
                    entryNo: 'Opening Balance',
                    memo: '',
                    debit: 0,
                    credit: 0,
                    balance: glData.openingBalance
                },
                ...glData.transactions.map((tx) => ({
                    date: formatCompanyDate(tx.date, company),
                    entryNo: tx.entryNo,
                    memo: `${tx.memo || '-'} ${tx.sourceType ? `(${tx.sourceType})` : ''}`,
                    debit: tx.debit,
                    credit: tx.credit,
                    balance: tx.balance
                })),
                {
                    date: '',
                    entryNo: 'Period Totals',
                    memo: '',
                    debit: glData.summary.totalDebits,
                    credit: glData.summary.totalCredits,
                    balance: glData.summary.closingBalance
                }
            ]
        });
    };

    return (
        <PageTemplate
            title="General Ledger"
            subtitle="Detailed account transaction history"
            breadcrumb={[
                { label: 'Home', href: '/' },
                { label: 'Accounting', href: '/accounting' },
                { label: 'General Ledger' }
            ]}
            action={
                glData ? (
                    <Button
                        variant="secondary"
                        icon={<Download size={18} />}
                        onClick={handleExportExcel}
                    >
                        Export Excel
                    </Button>
                ) : undefined
            }
            loading={isLoading}
            maxWidth="full"
        >
            <div className="space-y-6">
                {/* Filter Section */}
                <div className="bg-background-card p-4 border border-border rounded-lg flex flex-wrap gap-4 items-end">
                    <div className="flex-1 min-w-[250px]">
                        <label className="block text-sm font-medium text-text-secondary mb-1">Account</label>
                        <Select
                            value={accountId}
                            onChange={(e) => setAccountId(e.target.value)}
                            options={[
                                { value: '', label: '-- Select an Account --' },
                                ...accounts.map((a) => ({ value: a.id, label: `${a.code} - ${a.name}` }))
                            ]}
                            placeholder="-- Select an Account --"
                            fullWidth
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-text-secondary mb-1">Start Date</label>
                        <input
                            type="date"
                            className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-brand outline-none bg-background-card text-text-primary"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-text-secondary mb-1">End Date</label>
                        <input
                            type="date"
                            className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-brand outline-none bg-background-card text-text-primary"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                        />
                    </div>
                </div>

                {!accountId ? (
                    <div className="bg-background-card rounded-xl border border-border p-12 flex flex-col items-center justify-center text-text-tertiary">
                        <Calculator className="w-16 h-16 text-text-tertiary mb-4" />
                        <p className="text-lg font-medium text-text-primary">Select an account</p>
                        <p className="text-sm mt-1">Choose an account above to view its general ledger.</p>
                    </div>
                ) : isError ? (
                    <div className="bg-background-card rounded-xl border border-border p-12 text-center text-danger">
                        Failed to load ledger data.
                    </div>
                ) : glData ? (
                    <>
                        {/* KPI Summary */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <KpiCard
                                label="Opening Balance"
                                value={glData.openingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            />
                            <KpiCard
                                label="Total Debits"
                                value={glData.summary.totalDebits.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            />
                            <KpiCard
                                label="Total Credits"
                                value={glData.summary.totalCredits.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            />
                            <KpiCard
                                label="Closing Balance"
                                value={glData.summary.closingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            />
                        </div>

                        {/* Ledger Section */}
                        <Section variant="card" headerBorder>
                            <div className="px-6 py-4 bg-brand-50 border-b border-border flex justify-between items-center -mx-6 -mt-6 mb-0 rounded-t-lg">
                                <div>
                                    <h2 className="text-lg font-bold text-text-primary">{glData.account.code} - {glData.account.name}</h2>
                                    <span className="text-xs font-semibold text-text-brand uppercase">{glData.account.type} Account</span>
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="bg-background-subtle text-xs uppercase tracking-wider text-text-tertiary">
                                        <tr className="border-b border-border">
                                            <th className="px-6 py-3 font-semibold">Date</th>
                                            <th className="px-6 py-3 font-semibold">Entry No.</th>
                                            <th className="px-6 py-3 font-semibold">Memo / Source</th>
                                            <th className="px-6 py-3 font-semibold text-right">Debit</th>
                                            <th className="px-6 py-3 font-semibold text-right">Credit</th>
                                            <th className="px-6 py-3 font-semibold text-right">Balance</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        <tr className="bg-warning-soft">
                                            <td colSpan={5} className="px-6 py-3 text-sm font-semibold text-text-secondary italic text-right">
                                                Opening Balance (As of {formatCompanyDate(startDate, company)})
                                            </td>
                                            <td className="px-6 py-3 text-sm font-mono font-bold text-text-primary text-right">
                                                {glData.openingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                        </tr>

                                        {glData.transactions.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="px-6 py-8 text-center text-text-tertiary">
                                                    No transactions found for this period.
                                                </td>
                                            </tr>
                                        ) : (
                                            glData.transactions.map((tx) => (
                                                <tr key={tx.id} className="hover:bg-background-subtle">
                                                    <td className="px-6 py-3 text-sm text-text-primary whitespace-nowrap">
                                                        {formatCompanyDate(tx.date, company)}
                                                    </td>
                                                    <td className="px-6 py-3 text-sm font-mono text-text-secondary">
                                                        {tx.entryNo}
                                                    </td>
                                                    <td className="px-6 py-3 text-sm text-text-secondary">
                                                        {tx.memo || '-'}
                                                        {tx.sourceType && <span className="ml-2 text-xs bg-background-subtle text-text-tertiary px-2 py-0.5 rounded">{tx.sourceType}</span>}
                                                    </td>
                                                    <td className="px-6 py-3 text-sm font-mono text-right text-text-secondary">
                                                        {tx.debit > 0 ? tx.debit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : ''}
                                                    </td>
                                                    <td className="px-6 py-3 text-sm font-mono text-right text-text-secondary">
                                                        {tx.credit > 0 ? tx.credit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : ''}
                                                    </td>
                                                    <td className="px-6 py-3 text-sm font-mono font-medium text-right text-text-primary">
                                                        {tx.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                    <tfoot className="bg-background-subtle border-t-2 border-border">
                                        <tr className="font-bold">
                                            <td className="px-6 py-4 text-sm text-text-primary" colSpan={3}>TOTALS</td>
                                            <td className="px-6 py-4 text-sm font-mono font-bold text-text-primary text-right">
                                                {glData.summary.totalDebits.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-6 py-4 text-sm font-mono font-bold text-text-primary text-right">
                                                {glData.summary.totalCredits.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-6 py-4 text-sm font-mono font-bold text-text-primary text-right bg-brand-50">
                                                {glData.summary.closingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </Section>
                    </>
                ) : null}
            </div>
        </PageTemplate>
    );
}
