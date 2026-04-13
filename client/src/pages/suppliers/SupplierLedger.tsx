import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    Search,
    Printer,
    Download,
    Calendar as CalendarIcon,
    ArrowUpRight,
    ArrowDownLeft,
    Wallet,
    Loader2,
    RefreshCw,
    TrendingUp,
    TrendingDown,
    Building2
} from 'lucide-react';
import api from '../../lib/api';
import DateRangeFilter from '../../components/ui/DateRangeFilter';
import { format } from 'date-fns';
import { exportExcel, printPdfFromComponent } from '../../lib/fileExport';
import { SupplierStatementPdf } from '../../components/suppliers/SupplierStatementPdf';
import { useAuthStore } from '../../stores/authStore';
import AppDropdown from '../../components/ui/AppDropdown';

export default function SupplierLedger() {
    const user = useAuthStore((s: any) => s.user);
    const currency = user?.company?.currency || 'SAR';
    const [selectedSupplierId, setSelectedSupplierId] = useState('');
    const [supplierSearch, setSupplierSearch] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Fetch suppliers for dropdown/lookup
    const { data: suppliersData, isLoading: suppliersLoading, refetch: refetchSuppliers, isFetching: isFetchingSuppliers } = useQuery({
        queryKey: ['suppliers-lookup', supplierSearch],
        queryFn: () => api.get('/suppliers', { params: { search: supplierSearch || undefined, limit: 100 } }).then(r => r.data.data),
    });

    // Fetch ledger for selected supplier
    const { data: ledgerData, isLoading: ledgerLoading, refetch: refetchLedger, isFetching: ledgerFetching } = useQuery({
        queryKey: ['supplier-ledger', selectedSupplierId, startDate, endDate],
        queryFn: () => api.get(`/suppliers/${selectedSupplierId}/ledger`, {
            params: {
                dateFrom: startDate || undefined,
                dateTo: endDate || undefined
            }
        }).then(r => r.data.data),
        enabled: !!selectedSupplierId
    });

    const ledger = ledgerData?.ledger || [];
    const supplierInfo = ledgerData?.supplier;
    const finalBalance = ledgerData?.finalBalance || 0;
    const openingBalance = ledgerData?.openingBalance || 0;

    const totalDebit = useMemo(() => ledger.reduce((sum: number, t: any) => sum + t.debit, 0), [ledger]);
    const totalCredit = useMemo(() => ledger.reduce((sum: number, t: any) => sum + t.credit, 0), [ledger]);

    const handlePrint = async () => {
        if (!ledgerData || !supplierInfo) return;

        await printPdfFromComponent(
            <SupplierStatementPdf
                supplier={supplierInfo}
                ledger={ledger}
                openingBalance={openingBalance}
                finalBalance={finalBalance}
                totalDebit={totalDebit}
                totalCredit={totalCredit}
                startDate={startDate}
                endDate={endDate}
                companyName={user?.company?.name || 'SOLVANTA ERP'}
                currency={currency}
            />
        );
    };

    const handleExportExcel = async () => {
        if (!ledgerData || !supplierInfo) return;

        const dateStr = `${startDate || 'Start'} to ${endDate || 'End'}`;
        await exportExcel({
            fileName: `Supplier_Ledger_${supplierInfo.supplierCode}_${new Date().getTime()}`,
            sheetName: 'Supplier Ledger',
            title: 'Supplier Statement of Account',
            customMeta: {
                'Supplier': `${supplierInfo.supplierCode} - ${supplierInfo.name}`,
                'Period': dateStr
            },
            columns: [
                { header: 'Date', key: 'date', width: 15 },
                { header: 'Type', key: 'type', width: 15 },
                { header: 'Reference', key: 'reference', width: 25 },
                { header: 'Supp. Inv', key: 'supplierInvoiceNo', width: 20 },
                { header: 'Description', key: 'description', width: 35 },
                { header: 'Debit (Payment)', key: 'debit', type: 'currency', width: 18 },
                { header: 'Credit (Invoice)', key: 'credit', type: 'currency', width: 18 },
                { header: 'Balance', key: 'balance', type: 'currency', width: 18 },
            ],
            rows: [
                {
                    date: startDate || '',
                    type: '',
                    reference: 'Opening Balance',
                    description: '',
                    debit: 0,
                    credit: 0,
                    balance: openingBalance
                },
                ...ledger.map((row: any) => ({
                    date: format(new Date(row.date), 'dd/MM/yyyy'),
                    type: row.type,
                    reference: row.reference,
                    supplierInvoiceNo: row.supplierInvoiceNo || '-',
                    description: row.description,
                    debit: row.debit,
                    credit: row.credit,
                    balance: row.balance
                })),
                {
                    date: '',
                    type: '',
                    reference: 'TOTALS',
                    supplierInvoiceNo: '',
                    description: '',
                    debit: totalDebit,
                    credit: totalCredit,
                    balance: finalBalance
                }
            ]
        });
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Supplier Ledger</h1>
                    <p className="text-sm text-gray-500">Statement of accounts and transaction history</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleExportExcel}
                        disabled={!selectedSupplierId || ledger.length === 0}
                        className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors disabled:opacity-50"
                        title="Export to Excel"
                    >
                        <Download size={20} />
                    </button>
                    <button
                        onClick={handlePrint}
                        disabled={!selectedSupplierId}
                        className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors disabled:opacity-50"
                        title="Print Statement"
                    >
                        <Printer size={20} />
                    </button>
                    <button
                        onClick={() => refetchLedger()}
                        disabled={!selectedSupplierId || ledgerFetching}
                        className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors disabled:opacity-50"
                        title="Refresh"
                    >
                        <RefreshCw size={20} className={ledgerFetching ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* Selection & Filters */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
                                Select Supplier
                            </label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                <AppDropdown
                                    value={selectedSupplierId}
                                    onChange={(v) => setSelectedSupplierId(v)}
                                    options={[{ value: '', label: 'Choose a supplier...' }, ...(suppliersData || []).map((s: any) => ({ value: s.id, label: `${s.supplierCode} - ${s.name}` }))]}
                                    placeholder='Choose a supplier...'
                                    searchable
                                    onRefresh={refetchSuppliers}
                                    refreshing={isFetchingSuppliers}
                                    refreshLabel="Refresh suppliers"
                                    onRefresh={refetchSuppliers}
                                    refreshing={isFetchingSuppliers}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block text-right">
                                Filter by Period
                            </label>
                            <div className="flex justify-end">
                                <DateRangeFilter
                                    startDate={startDate}
                                    endDate={endDate}
                                    onChange={(start: string, end: string) => {
                                        setStartDate(start);
                                        setEndDate(end); }}
                                    onClear={() => {
                                        setStartDate('');
                                        setEndDate('');
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Summary Card */}
                <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-5 text-white shadow-lg relative overflow-hidden">
                    <div className="relative z-10">
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Outstanding Balance</p>
                        <h2 className="text-3xl font-bold mb-4 tracking-tight">
                            {finalBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })} <span className="text-sm font-normal text-slate-400">{currency}</span>
                        </h2>
                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
                            <div>
                                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Total Purchases</p>
                                <p className="text-sm font-semibold text-red-300">+{totalCredit.toLocaleString()}</p>
                            </div>
                            <div>
                                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Total Payments</p>
                                <p className="text-sm font-semibold text-emerald-300">-{totalDebit.toLocaleString()}</p>
                            </div>
                        </div>
                    </div>
                    <Wallet size={80} className="absolute -right-4 -bottom-4 text-white/5 rotate-12" />
                </div>
            </div>

            {/* Ledger Table */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {!selectedSupplierId ? (
                    <div className="py-20 flex flex-col items-center justify-center text-gray-400 bg-gray-50/50">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                            <Building2 size={32} />
                        </div>
                        <p className="text-lg font-medium text-gray-600">No Supplier Selected</p>
                        <p className="text-sm">Please select a supplier above to view their statement</p>
                    </div>
                ) : ledgerLoading ? (
                    <div className="py-20 flex flex-col items-center justify-center text-gray-500">
                        <Loader2 className="animate-spin mb-4" size={32} />
                        <p>Loading transaction history...</p>
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                                        <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Type</th>
                                        <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Reference</th>
                                        <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Supp. Inv</th>
                                        <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Description</th>
                                        <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Debit (Payment)</th>
                                        <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Credit (Invoice)</th>
                                        <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right bg-slate-50">Balance</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {/* Opening Balance Row */}
                                    <tr className="bg-gray-50/50">
                                        <td className="px-6 py-4 text-sm text-gray-400 italic" colSpan={5}>Opening Balance</td>
                                        <td className="px-6 py-4 text-sm text-right text-gray-400 font-medium">-</td>
                                        <td className="px-6 py-4 text-sm text-right text-gray-400 font-medium">-</td>
                                        <td className="px-6 py-4 text-sm text-right font-bold text-gray-900 bg-slate-50/50">
                                            {openingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                    </tr>

                                    {ledger.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="px-6 py-12 text-center text-gray-400">
                                                No transactions found for this period
                                            </td>
                                        </tr>
                                    ) : (
                                        ledger.map((row: any, idx: number) => (
                                            <tr key={idx} className="hover:bg-gray-50 transition-colors group">
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                                    {format(new Date(row.date), 'dd/MM/yyyy')}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${row.type === 'PURCHASE' ? 'bg-amber-100 text-amber-700' :
                                                        row.type === 'PAYMENT' ? 'bg-emerald-100 text-emerald-700' :
                                                            'bg-red-100 text-red-700'
                                                        }`}>
                                                        {row.type}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                    {row.reference}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                    {row.supplierInvoiceNo || '-'}
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-600 flex items-center gap-2">
                                                    {row.type === 'PURCHASE' ? (
                                                        <div className="w-6 h-6 rounded-full bg-amber-50 flex items-center justify-center text-amber-600">
                                                            <TrendingUp size={14} />
                                                        </div>
                                                    ) : (
                                                        <div className="w-6 h-6 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                                                            <TrendingDown size={14} />
                                                        </div>
                                                    )}
                                                    {row.description}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-emerald-600 font-semibold italic">
                                                    {row.debit > 0 ? `-${row.debit.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-red-600 font-semibold italic">
                                                    {row.credit > 0 ? `+${row.credit.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-gray-900 bg-slate-50 group-hover:bg-slate-100 transition-colors">
                                                    {row.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                                <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                                    <tr className="font-bold">
                                        <td className="px-6 py-4 text-sm text-gray-900" colSpan={5}>TOTALS</td>

                                        <td className="px-6 py-4 text-sm text-right text-emerald-700">
                                            {totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-right text-red-700">
                                            {totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-right bg-slate-100 text-gray-900">
                                            {finalBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        <div className="p-6 bg-slate-50 flex items-start gap-3 border-t border-gray-100">
                            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg shrink-0">
                                <TrendingUp size={18} />
                            </div>
                            <div className="text-sm">
                                <h4 className="font-semibold text-gray-900">Accounting Note</h4>
                                <p className="text-gray-600">
                                    This statement shows all posted purchase invoices, returns, and payments.
                                    A <span className="text-red-600 font-medium">Credit</span> entry increases the amount you owe to the supplier,
                                    while a <span className="text-emerald-600 font-medium">Debit</span> entry (Payment or Return) decreases it.
                                </p>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Print Styles */}
            <style dangerouslySetInnerHTML={{
                __html: `
                @media print {
                    nav, header, aside, .no-print, button, select, label, .relative {
                        display: none !important;
                    }
                    .h-screen {
                        height: auto !important;
                        overflow: visible !important;
                    }
                    body {
                        background-color: white !important;
                    }
                    .pt-20 { padding-top: 0 !important; }
                    .space-y-6 > :not(.bg-white) { display: none; }
                    .bg-white { 
                        box-shadow: none !important; 
                        border: none !important;
                        width: 100% !important;
                    }
                    table {
                        border: 1px solid #eee !important;
                    }
                    th {
                        background-color: #f9fafb !important;
                        color: black !important;
                    }
                }
            ` }} />
        </div>
    );
}
