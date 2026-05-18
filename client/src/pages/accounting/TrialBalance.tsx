import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { Calculator } from 'lucide-react';
import { toDateInputValue } from '../../lib/companySettings';
import { useAuthStore } from '../../stores/authStore';

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
                params: {
                    asOfDate
                }
            });
            return res.data.data || [];
        }
    });

    const totalDebit = tbLines.reduce((sum, l) => sum + (l.debit || 0), 0);
    const totalCredit = tbLines.reduce((sum, l) => sum + (l.credit || 0), 0);
    const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Trial Balance</h1>
                    <p className="text-gray-500 mt-1">Real-time ledger extract</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <label className="text-sm font-medium text-gray-600">As Of:</label>
                        <input
                            type="date"
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            value={asOfDate}
                            onChange={(e) => setAsOfDate(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Account</th>
                                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Debit</th>
                                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Credit</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {isLoading ? (
                                <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-500">Calculating trial balance...</td></tr>
                            ) : tbLines.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                                        <Calculator className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                                        <p>No activity recorded yet.</p>
                                    </td>
                                </tr>
                            ) : (
                                tbLines.map((line) => (
                                    <tr key={line.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 text-sm font-medium text-gray-900">{line.code} - {line.name}</td>
                                        <td className="px-6 py-4 text-sm text-gray-500">{line.type}</td>
                                        <td className="px-6 py-4 text-sm font-mono text-right">{line.debit > 0 ? line.debit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}</td>
                                        <td className="px-6 py-4 text-sm font-mono text-right">{line.credit > 0 ? line.credit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                        <tfoot className="bg-gray-50 border-t-2 border-gray-300 font-semibold">
                            <tr>
                                <td colSpan={2} className="px-6 py-4 text-right">Grand Total</td>
                                <td className={`px-6 py-4 text-right font-mono ${!isBalanced && 'text-red-600'}`}>{totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td className={`px-6 py-4 text-right font-mono ${!isBalanced && 'text-red-600'}`}>{totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            </tr>
                            {!isBalanced && (
                                <tr>
                                    <td colSpan={4} className="px-6 py-2 text-red-600 text-sm font-bold text-center bg-red-50">
                                        Warning: Trial Balance is out of balance. Imbalance: {Math.abs(totalDebit - totalCredit).toLocaleString()}
                                    </td>
                                </tr>
                            )}
                        </tfoot>
                    </table>
                </div>
            </div>
        </div>
    );
}
