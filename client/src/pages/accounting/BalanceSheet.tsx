import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import AppLoader from '../../components/ui/AppLoader';

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

    if (isLoading) return <AppLoader />;

    const { assets, liabilities, equity, summary } = bsData || {
        assets: { items: [], total: 0 },
        liabilities: { items: [], total: 0 },
        equity: { items: [], total: 0, retainedEarnings: 0, totalIncludingRE: 0 },
        summary: { totalAssets: 0, totalEquityAndLiabilities: 0, isBalanced: true }
    };

    return (
        <div className="p-6 max-w-5xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Balance Sheet</h1>
                    <p className="text-gray-500 mt-1">Snapshot of financial position</p>
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-gray-700 font-medium">As of:</span>
                    <input
                        type="date"
                        value={asOfDate}
                        onChange={(e) => setAsOfDate(e.target.value)}
                        className="px-3 py-2 border rounded-md"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Assets Column */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden h-fit">
                    <div className="bg-green-50 px-6 py-4 border-b border-green-100">
                        <h2 className="text-lg font-bold text-green-900">Assets</h2>
                    </div>
                    <table className="w-full text-left">
                        <tbody className="divide-y divide-gray-100">
                            {assets.items.map((item: any) => (
                                <tr key={item.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-3 text-sm text-gray-700">{item.name}</td>
                                    <td className="px-6 py-3 text-sm text-right font-mono">{item.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="border-t-2 border-green-200">
                            <tr className="bg-green-50/50">
                                <td className="px-6 py-4 font-bold text-gray-900">Total Assets</td>
                                <td className="px-6 py-4 font-bold font-mono text-right text-gray-900">
                                    {summary.totalAssets.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                {/* Liabilities & Equity Column */}
                <div className="space-y-8">
                    {/* Liabilities */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="bg-orange-50 px-6 py-4 border-b border-orange-100">
                            <h2 className="text-lg font-bold text-orange-900">Liabilities</h2>
                        </div>
                        <table className="w-full text-left">
                            <tbody className="divide-y divide-gray-100">
                                {liabilities.items.map((item: any) => (
                                    <tr key={item.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-3 text-sm text-gray-700">{item.name}</td>
                                        <td className="px-6 py-3 text-sm text-right font-mono">{item.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="border-t border-gray-200">
                                <tr className="bg-gray-50">
                                    <td className="px-6 py-3 font-semibold text-gray-900">Total Liabilities</td>
                                    <td className="px-6 py-3 font-semibold font-mono text-right text-gray-900">
                                        {liabilities.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    {/* Equity */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="bg-blue-50 px-6 py-4 border-b border-blue-100">
                            <h2 className="text-lg font-bold text-blue-900">Equity</h2>
                        </div>
                        <table className="w-full text-left">
                            <tbody className="divide-y divide-gray-100">
                                {equity.items.map((item: any) => (
                                    <tr key={item.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-3 text-sm text-gray-700">{item.name}</td>
                                        <td className="px-6 py-3 text-sm text-right font-mono">{item.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    </tr>
                                ))}
                                <tr className="bg-blue-50/30">
                                    <td className="px-6 py-3 text-sm font-medium text-blue-900">Current Year Retained Earnings</td>
                                    <td className="px-6 py-3 text-sm font-medium text-right font-mono text-blue-900">
                                        {equity.retainedEarnings.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                </tr>
                            </tbody>
                            <tfoot className="border-t border-gray-200">
                                <tr className="bg-gray-50">
                                    <td className="px-6 py-3 font-semibold text-gray-900">Total Equity</td>
                                    <td className="px-6 py-3 font-semibold font-mono text-right text-gray-900">
                                        {equity.totalIncludingRE.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    {/* Final Grand Total */}
                    <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6 flex justify-between items-center text-white">
                        <h2 className="text-lg font-bold">Total Liabilities & Equity</h2>
                        <span className="text-xl font-mono font-bold">
                            {summary.totalEquityAndLiabilities.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                    </div>

                    {!summary.isBalanced && (
                        <div className="p-4 bg-red-100 text-red-800 rounded-lg font-medium border border-red-200">
                            Warning: Balance Sheet does not balance! Discrepancy: {Math.abs(summary.totalAssets - summary.totalEquityAndLiabilities).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
