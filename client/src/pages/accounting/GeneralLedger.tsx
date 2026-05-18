import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { Calculator, Download } from 'lucide-react';
import { exportExcel } from '../../lib/fileExport';
import { formatCompanyDate, toDateInputValue } from '../../lib/companySettings';
import { useAuthStore } from '../../stores/authStore';
import AppDropdown from '../../components/ui/AppDropdown';

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

    const { data: accounts = [], refetch: refetchAccounts, isFetching: isFetchingAccounts } = useQuery<Account[]>({
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
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">General Ledger</h1>
                    <p className="text-gray-500 mt-1">Detailed account transaction history</p>
                </div>
                {glData && (
                    <button
                        onClick={handleExportExcel}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium shadow-sm"
                    >
                        <Download size={18} />
                        Export Excel
                    </button>
                )}
            </div>

            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-[250px]">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Account</label>
                    <AppDropdown
                        value={accountId}
                        onChange={(v) => setAccountId(v)}
                        options={[
                            { value: '', label: '-- Select an Account --' },
                            ...accounts.map((a) => ({ value: a.id, label: `${a.code} - ${a.name}` }))
                        ]}
                        placeholder='-- Select an Account --'
                        searchable
                        onRefresh={refetchAccounts}
                        refreshing={isFetchingAccounts}
                        refreshLabel="Refresh accounts"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                    <input
                        type="date"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                    <input
                        type="date"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                    />
                </div>
            </div>

            {!accountId ? (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 flex flex-col items-center justify-center text-gray-500">
                    <Calculator className="w-16 h-16 text-gray-300 mb-4" />
                    <p className="text-lg font-medium">Select an account</p>
                    <p className="text-sm mt-1">Choose an account above to view its general ledger.</p>
                </div>
            ) : isLoading ? (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-500">
                    Loading ledger data...
                </div>
            ) : isError ? (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-red-500">
                    Failed to load ledger data.
                </div>
            ) : glData ? (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center bg-blue-50">
                        <div>
                            <h2 className="text-lg font-bold text-blue-900">{glData.account.code} - {glData.account.name}</h2>
                            <span className="text-xs font-semibold text-blue-700 uppercase">{glData.account.type} Account</span>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                    <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Entry No.</th>
                                    <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Memo / Source</th>
                                    <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Debit</th>
                                    <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Credit</th>
                                    <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Balance</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                <tr className="bg-yellow-50/50">
                                    <td colSpan={5} className="px-6 py-3 text-sm font-semibold text-gray-700 italic text-right">
                                        Opening Balance (As of {formatCompanyDate(startDate, company)})
                                    </td>
                                    <td className="px-6 py-3 text-sm font-mono font-bold text-gray-900 text-right">
                                        {glData.openingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                </tr>

                                {glData.transactions.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                                            No transactions found for this period.
                                        </td>
                                    </tr>
                                ) : (
                                    glData.transactions.map((tx) => (
                                        <tr key={tx.id} className="hover:bg-gray-50">
                                            <td className="px-6 py-3 text-sm text-gray-900 whitespace-nowrap">
                                                {formatCompanyDate(tx.date, company)}
                                            </td>
                                            <td className="px-6 py-3 text-sm font-mono text-gray-600">
                                                {tx.entryNo}
                                            </td>
                                            <td className="px-6 py-3 text-sm text-gray-700">
                                                {tx.memo || '-'}
                                                {tx.sourceType && <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">{tx.sourceType}</span>}
                                            </td>
                                            <td className="px-6 py-3 text-sm font-mono text-right text-gray-700">
                                                {tx.debit > 0 ? tx.debit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : ''}
                                            </td>
                                            <td className="px-6 py-3 text-sm font-mono text-right text-gray-700">
                                                {tx.credit > 0 ? tx.credit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : ''}
                                            </td>
                                            <td className="px-6 py-3 text-sm font-mono font-medium text-right text-gray-900">
                                                {tx.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                            <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                                <tr className="font-bold">
                                    <td className="px-6 py-4 text-sm text-gray-900" colSpan={3}>TOTALS</td>
                                    <td className="px-6 py-4 text-sm font-mono font-bold text-gray-900 text-right">
                                        {glData.summary.totalDebits.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="px-6 py-4 text-sm font-mono font-bold text-gray-900 text-right">
                                        {glData.summary.totalCredits.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="px-6 py-4 text-sm font-mono font-bold text-gray-900 text-right bg-blue-50/50">
                                        {glData.summary.closingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
