import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { Calculator } from 'lucide-react';

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
        <div className="p-6 max-w-5xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Profit & Loss Statement</h1>
                    <p className="text-gray-500 mt-1">Income statement analysis</p>
                </div>
                <div className="flex items-center gap-4">
                    <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="px-3 py-2 border rounded-md"
                    />
                    <span className="text-gray-500">to</span>
                    <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="px-3 py-2 border rounded-md"
                    />
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {isLoading ? (
                    <div className="p-8 text-center text-gray-500">Calculating report...</div>
                ) : (
                    <table className="w-full text-left">
                        <tbody className="divide-y divide-gray-100">
                            {/* Revenues Section */}
                            <tr className="bg-gray-50">
                                <td colSpan={2} className="px-6 py-3 font-semibold text-gray-900 uppercase">Operating Revenue</td>
                            </tr>
                            {revenues.length === 0 ? (
                                <tr><td colSpan={2} className="px-6 py-3 text-gray-500 italic">No revenue recorded</td></tr>
                            ) : revenues.map(rev => (
                                <tr key={rev.id} className="hover:bg-gray-50">
                                    <td className="px-6 pl-10 py-3 text-sm text-gray-700">{rev.code} - {rev.name}</td>
                                    <td className="px-6 py-3 text-sm text-right font-mono text-gray-900">
                                        {rev.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                </tr>
                            ))}
                            <tr className="bg-blue-50/50">
                                <td className="px-6 py-4 font-medium text-gray-900 text-right">Total Revenue</td>
                                <td className="px-6 py-4 font-mono font-bold text-right text-gray-900">
                                    {summary.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </td>
                            </tr>

                            {/* Expenses Section */}
                            <tr className="bg-gray-50">
                                <td colSpan={2} className="px-6 py-3 font-semibold text-gray-900 uppercase">Operating Expenses</td>
                            </tr>
                            {expenses.length === 0 ? (
                                <tr><td colSpan={2} className="px-6 py-3 text-gray-500 italic">No expenses recorded</td></tr>
                            ) : expenses.map(exp => (
                                <tr key={exp.id} className="hover:bg-gray-50">
                                    <td className="px-6 pl-10 py-3 text-sm text-gray-700">{exp.code} - {exp.name}</td>
                                    <td className="px-6 py-3 text-sm text-right font-mono text-gray-900">
                                        {exp.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                </tr>
                            ))}
                            <tr className="bg-red-50/50">
                                <td className="px-6 py-4 font-medium text-gray-900 text-right">Total Expenses</td>
                                <td className="px-6 py-4 font-mono font-bold text-right text-gray-900">
                                    {summary.totalExpense.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </td>
                            </tr>
                        </tbody>
                        <tfoot className="border-t-4 border-gray-900 bg-gray-50">
                            <tr>
                                <td className="px-6 py-6 text-lg font-bold text-gray-900 text-right">Net Income</td>
                                <td className={`px-6 py-6 text-lg font-mono font-bold text-right ${summary.netIncome >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {summary.netIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                )}
            </div>
        </div>
    );
}
