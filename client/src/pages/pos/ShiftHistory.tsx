import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import ShiftCloseDialog from '../../components/pos/ShiftCloseDialog';
import { useAuthStore } from '../../stores/authStore';
import AppDropdown from '../../components/ui/AppDropdown';
import {
    Calendar,
    ChevronDown,
    ChevronUp,
    Clock,
    DollarSign,
    Loader2,
    Receipt,
    RefreshCw,
    Search,
} from 'lucide-react';

type Shift = {
    id: string;
    terminalId: string;
    userId: string;
    openedAt: string;
    closedAt?: string | null;
    openingCash: number;
    expectedCash?: number | null;
    actualCash?: number | null;
    variance?: number | null;
    totalSales?: number | null;
    totalRefunds?: number | null;
    totalTransactions?: number | null;
    denominations?: Record<string, number> | null;
    notes?: string | null;
    status: 'OPEN' | 'CLOSED';
    terminal?: { id: string; code: string; name: string };
    user?: { id: string; name: string };
};

type ShiftDetail = Shift & {
    invoices: Array<{
        id: string;
        invoiceNo: string;
        grandTotal: number;
        paymentMethod: string;
        cashReceived: number;
        changeGiven: number;
        status: string;
        createdAt: string;
        customer?: { id: string; name: string } | null;
    }>;
    paymentBreakdown: Record<string, { count: number; total: number }>;
    summary?: {
        grossSales?: number;
        postedSales?: number;
        unpostedSales?: number;
        totalInvoices?: number;
        totalReturns?: number;
        cash?: {
            openingCash?: number;
            expectedCash?: number;
            actualCash?: number;
            variance?: number;
        };
    };
};

type ShiftResponse = {
    data: Shift[];
    meta?: {
        totalPages?: number;
        total?: number;
        page?: number;
    };
};

const SAR_DENOMINATIONS = [500, 200, 100, 50, 20, 10, 5, 1, 0.5, 0.25];
type DatePreset = 'TODAY' | 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'CUSTOM';

function toLocalDateInput(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function parseDateInputToStartIso(input: string) {
    if (!input) return undefined;
    const d = new Date(`${input}T00:00:00`);
    if (Number.isNaN(d.getTime())) return undefined;
    return d.toISOString();
}

function parseDateInputToEndIso(input: string) {
    if (!input) return undefined;
    const d = new Date(`${input}T23:59:59.999`);
    if (Number.isNaN(d.getTime())) return undefined;
    return d.toISOString();
}

export default function ShiftHistory() {
    const qc = useQueryClient();
    const hasPermission = useAuthStore((s) => s.hasPermission);
    const currentUserEmail = useAuthStore((s) => s.user?.email || '');
    const canCloseShift = hasPermission('pos.closeShift');
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 6);

    const [page, setPage] = useState(1);
    const [terminalFilter, setTerminalFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [userFilter, setUserFilter] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [datePreset, setDatePreset] = useState<DatePreset>('LAST_7_DAYS');
    const [dateFrom, setDateFrom] = useState(toLocalDateInput(sevenDaysAgo));
    const [dateTo, setDateTo] = useState(toLocalDateInput(now));
    const [invoiceSearch, setInvoiceSearch] = useState('');
    const [invoiceMethodFilter, setInvoiceMethodFilter] = useState('');
    const [invoiceStatusFilter, setInvoiceStatusFilter] = useState('');
    const [closeShiftTarget, setCloseShiftTarget] = useState<{ shiftId: string; terminalCode: string; openingCash: number } | null>(null);

    const { data: terminalsData } = useQuery({
        queryKey: ['pos-terminals'],
        queryFn: () => api.get('/pos-terminals').then((r) => r.data.data),
    });
    const terminals = terminalsData || [];

    const filterDateFromIso = parseDateInputToStartIso(dateFrom);
    const filterDateToIso = parseDateInputToEndIso(dateTo);

    const listParams = {
        page,
        limit: 20,
        terminalId: terminalFilter || undefined,
        status: statusFilter || undefined,
        userId: userFilter || undefined,
        dateFrom: filterDateFromIso,
        dateTo: filterDateToIso,
    };

    const analyticsParams = {
        page: 1,
        limit: 500,
        terminalId: terminalFilter || undefined,
        status: statusFilter || undefined,
        userId: userFilter || undefined,
        dateFrom: filterDateFromIso,
        dateTo: filterDateToIso,
    };

    const { data: shiftsResp, isLoading: listLoading } = useQuery({
        queryKey: ['pos-shifts', listParams],
        queryFn: () => api.get('/pos-terminals/shifts/list', { params: listParams }).then((r) => r.data as ShiftResponse),
    });
    const shifts: Shift[] = shiftsResp?.data || [];
    const totalPages = shiftsResp?.meta?.totalPages || 1;
    const totalShifts = shiftsResp?.meta?.total || 0;

    const { data: analyticsResp, isLoading: analyticsLoading } = useQuery({
        queryKey: ['pos-shifts-analytics', analyticsParams],
        queryFn: () => api.get('/pos-terminals/shifts/list', { params: analyticsParams }).then((r) => r.data as ShiftResponse),
    });
    const analyticsShifts = analyticsResp?.data || [];

    const { data: detailData, isLoading: detailLoading } = useQuery<ShiftDetail>({
        queryKey: ['pos-shift-detail', expandedId],
        queryFn: () => api.get(`/pos-terminals/shifts/${expandedId}`).then((r) => r.data.data),
        enabled: !!expandedId,
    });

    const availableCashiers = useMemo(() => {
        const map = new Map<string, { id: string; name: string }>();
        for (const s of analyticsShifts) {
            if (s.user?.id && s.user?.name) map.set(s.user.id, { id: s.user.id, name: s.user.name });
        }
        return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    }, [analyticsShifts]);

    const kpis = useMemo(() => {
        let grossSales = 0;
        let refunds = 0;
        let txCount = 0;
        let openCount = 0;
        let closedCount = 0;
        let varianceTotal = 0;
        for (const s of analyticsShifts) {
            grossSales += Number(s.totalSales || 0);
            refunds += Number(s.totalRefunds || 0);
            txCount += Number(s.totalTransactions || 0);
            varianceTotal += Number(s.variance || 0);
            if (s.status === 'OPEN') openCount += 1;
            if (s.status === 'CLOSED') closedCount += 1;
        }
        return {
            grossSales,
            refunds,
            txCount,
            openCount,
            closedCount,
            varianceTotal,
            netSales: grossSales - refunds,
        };
    }, [analyticsShifts]);

    const filteredInvoices = useMemo(() => {
        if (!detailData?.invoices) return [];
        const q = invoiceSearch.trim().toLowerCase();
        return detailData.invoices.filter((inv) => {
            const byMethod = invoiceMethodFilter ? String(inv.paymentMethod).toUpperCase() === invoiceMethodFilter : true;
            const byStatus = invoiceStatusFilter ? String(inv.status).toUpperCase() === invoiceStatusFilter : true;
            const byText = q
                ? String(inv.invoiceNo || '').toLowerCase().includes(q)
                || String(inv.customer?.name || '').toLowerCase().includes(q)
                || String(inv.paymentMethod || '').toLowerCase().includes(q)
                : true;
            return byMethod && byStatus && byText;
        });
    }, [detailData, invoiceSearch, invoiceMethodFilter, invoiceStatusFilter]);

    function applyDatePreset(preset: DatePreset) {
        const end = new Date();
        const start = new Date(end);
        if (preset === 'TODAY') {
            setDateFrom(toLocalDateInput(end));
            setDateTo(toLocalDateInput(end));
        } else if (preset === 'LAST_7_DAYS') {
            start.setDate(end.getDate() - 6);
            setDateFrom(toLocalDateInput(start));
            setDateTo(toLocalDateInput(end));
        } else if (preset === 'LAST_30_DAYS') {
            start.setDate(end.getDate() - 29);
            setDateFrom(toLocalDateInput(start));
            setDateTo(toLocalDateInput(end));
        }
        setDatePreset(preset);
        setPage(1);
    }

    function onCustomDateChange(nextFrom?: string, nextTo?: string) {
        if (typeof nextFrom === 'string') setDateFrom(nextFrom);
        if (typeof nextTo === 'string') setDateTo(nextTo);
        setDatePreset('CUSTOM');
        setPage(1);
    }

    function fmtDate(d: string) {
        return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    function fmtTime(d: string) {
        return new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    }

    function fmtMoney(n: number | null | undefined) {
        return Number(n || 0).toFixed(2);
    }

    function duration(open: string, close?: string | null) {
        const ms = (close ? new Date(close).getTime() : Date.now()) - new Date(open).getTime();
        const hrs = Math.floor(ms / 3600000);
        const mins = Math.floor((ms % 3600000) / 60000);
        return `${hrs}h ${mins}m`;
    }

    function refreshAll() {
        qc.invalidateQueries({ queryKey: ['pos-shifts'] });
        qc.invalidateQueries({ queryKey: ['pos-shifts-analytics'] });
        qc.invalidateQueries({ queryKey: ['pos-shift-detail'] });
        qc.invalidateQueries({ queryKey: ['pos-terminals'] });
    }

    function openCloseShiftDialog(shift: { id: string; terminal?: { code?: string }; openingCash?: number | null }) {
        setCloseShiftTarget({
            shiftId: shift.id,
            terminalCode: shift.terminal?.code || 'N/A',
            openingCash: Number(shift.openingCash || 0),
        });
    }

    const paymentMethods = useMemo(() => {
        const set = new Set<string>();
        for (const inv of detailData?.invoices || []) {
            if (inv.paymentMethod) set.add(String(inv.paymentMethod).toUpperCase());
        }
        return Array.from(set).sort();
    }, [detailData]);

    const shiftVarianceColor = (variance: number | null | undefined) => {
        if (variance == null) return 'text-gray-400';
        if (variance === 0) return 'text-emerald-600';
        if (variance > 0) return 'text-amber-600';
        return 'text-red-600';
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <Clock size={24} className="text-blue-600" />
                        <h1 className="text-2xl font-bold text-gray-900">Shift History</h1>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">Analyze shifts, cash reconciliation and invoice activity by terminal and cashier</p>
                </div>
                <button
                    type="button"
                    onClick={refreshAll}
                    className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                >
                    <RefreshCw size={14} /> Refresh
                </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
                <div className="rounded-lg border border-gray-200 bg-white p-3 lg:col-span-2">
                    <p className="text-[11px] uppercase text-gray-500">Gross Sales</p>
                    <p className="text-lg font-bold text-gray-900 mt-1">{fmtMoney(kpis.grossSales)}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-3 lg:col-span-2">
                    <p className="text-[11px] uppercase text-gray-500">Net Sales</p>
                    <p className="text-lg font-bold text-gray-900 mt-1">{fmtMoney(kpis.netSales)}</p>
                </div>
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                    <p className="text-[11px] uppercase text-rose-700">Refunds</p>
                    <p className="text-lg font-bold text-rose-700 mt-1">{fmtMoney(kpis.refunds)}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-3">
                    <p className="text-[11px] uppercase text-gray-500">Transactions</p>
                    <p className="text-lg font-bold text-gray-900 mt-1">{kpis.txCount}</p>
                </div>
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                    <p className="text-[11px] uppercase text-blue-700">Open</p>
                    <p className="text-lg font-bold text-blue-700 mt-1">{kpis.openCount}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <p className="text-[11px] uppercase text-gray-600">Closed</p>
                    <p className="text-lg font-bold text-gray-700 mt-1">{kpis.closedCount}</p>
                </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => applyDatePreset('TODAY')}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium border ${datePreset === 'TODAY' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                    >
                        Today
                    </button>
                    <button
                        type="button"
                        onClick={() => applyDatePreset('LAST_7_DAYS')}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium border ${datePreset === 'LAST_7_DAYS' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                    >
                        Last 7 Days
                    </button>
                    <button
                        type="button"
                        onClick={() => applyDatePreset('LAST_30_DAYS')}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium border ${datePreset === 'LAST_30_DAYS' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                    >
                        Last 30 Days
                    </button>
                    <button
                        type="button"
                        onClick={() => setDatePreset('CUSTOM')}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium border ${datePreset === 'CUSTOM' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                    >
                        Custom
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
                    <div className="xl:col-span-2">
                        <label className="block text-xs text-gray-500 mb-1">Terminal</label>
                        <AppDropdown
                            value={terminalFilter}
                            onChange={(v) => { setTerminalFilter(v); setPage(1); }}
                            options={[{ value: '', label: 'All Terminals' }, ...terminals.map((t: any) => ({ value: t.id, label: `${t.code} — ${t.name}` }))]}
                            placeholder="All Terminals"
                            searchable
                        />
                    </div>

                    <div>
                        <label className="block text-xs text-gray-500 mb-1">Status</label>
                        <AppDropdown
                            value={statusFilter}
                            onChange={(v) => { setStatusFilter(v); setPage(1); }}
                            options={[{ value: '', label: 'All' }, { value: 'OPEN', label: 'Open' }, { value: 'CLOSED', label: 'Closed' }]}
                            placeholder="All"
                        />
                    </div>

                    <div>
                        <label className="block text-xs text-gray-500 mb-1">Cashier</label>
                        <AppDropdown
                            value={userFilter}
                            onChange={(v) => { setUserFilter(v); setPage(1); }}
                            options={[{ value: '', label: 'All Cashiers' }, ...availableCashiers.map((u) => ({ value: u.id, label: u.name }))]}
                            placeholder="All Cashiers"
                            searchable
                        />
                    </div>

                    <div>
                        <label className="block text-xs text-gray-500 mb-1">From</label>
                        <div className="relative">
                            <Calendar size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="date"
                                value={dateFrom}
                                onChange={(e) => onCustomDateChange(e.target.value, undefined)}
                                className="w-full pl-8 pr-2 py-2 border border-gray-200 rounded-lg text-sm"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs text-gray-500 mb-1">To</label>
                        <div className="relative">
                            <Calendar size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="date"
                                value={dateTo}
                                onChange={(e) => onCustomDateChange(undefined, e.target.value)}
                                className="w-full pl-8 pr-2 py-2 border border-gray-200 rounded-lg text-sm"
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                {listLoading ? (
                    <div className="py-20 text-center text-gray-500 text-sm">
                        <Loader2 className="animate-spin mx-auto mb-2" size={20} /> Loading shifts...
                    </div>
                ) : shifts.length === 0 ? (
                    <div className="py-20 text-center text-gray-500 text-sm">No shifts found for selected filters.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase w-8"></th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Terminal</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Cashier</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Opened</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Closed</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Duration</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Sales</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Variance</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {shifts.map((s) => {
                                    const isExpanded = expandedId === s.id;
                                    const varianceColor = shiftVarianceColor(s.variance);
                                    return (
                                        <tr
                                            key={s.id}
                                            className="hover:bg-gray-50 transition-colors cursor-pointer"
                                            onClick={() => {
                                                setExpandedId(isExpanded ? null : s.id);
                                                setInvoiceSearch('');
                                                setInvoiceMethodFilter('');
                                                setInvoiceStatusFilter('');
                                            }}
                                        >
                                            <td className="px-4 py-3">
                                                {isExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                                            </td>
                                            <td className="px-4 py-3 text-sm">
                                                <span className="font-mono font-semibold text-gray-900">{s.terminal?.code}</span>
                                                <span className="text-gray-400 ml-1 text-xs">{s.terminal?.name}</span>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-700">{s.user?.name || '—'}</td>
                                            <td className="px-4 py-3 text-sm text-gray-600">
                                                <div>{fmtDate(s.openedAt)}</div>
                                                <div className="text-xs text-gray-400">{fmtTime(s.openedAt)}</div>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-600">
                                                {s.closedAt ? (
                                                    <>
                                                        <div>{fmtDate(s.closedAt)}</div>
                                                        <div className="text-xs text-gray-400">{fmtTime(s.closedAt)}</div>
                                                    </>
                                                ) : (
                                                    <span className="text-xs text-blue-600">Still Open</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-600">{duration(s.openedAt, s.closedAt)}</td>
                                            <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">{fmtMoney(s.totalSales)}</td>
                                            <td className={`px-4 py-3 text-sm text-right font-semibold ${varianceColor}`}>
                                                {s.variance != null ? (s.variance >= 0 ? '+' : '') + fmtMoney(s.variance) : '—'}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.status === 'OPEN'
                                                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                                    : 'bg-gray-100 text-gray-600 border border-gray-200'
                                                    }`}>
                                                    {s.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {canCloseShift && s.status === 'OPEN' && (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            openCloseShiftDialog(s);
                                                        }}
                                                        className="px-2.5 py-1 text-xs rounded border border-red-300 text-red-700 hover:bg-red-50"
                                                    >
                                                        Close Shift
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {totalPages > 1 && (
                <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500">{totalShifts} total shifts</p>
                    <div className="flex justify-center gap-2">
                        <button
                            disabled={page <= 1}
                            onClick={() => setPage((p) => p - 1)}
                            className="px-3 py-1.5 border rounded text-sm disabled:opacity-40"
                        >
                            Previous
                        </button>
                        <span className="px-3 py-1.5 text-sm text-gray-600">
                            Page {page} of {totalPages}
                        </span>
                        <button
                            disabled={page >= totalPages}
                            onClick={() => setPage((p) => p + 1)}
                            className="px-3 py-1.5 border rounded text-sm disabled:opacity-40"
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}

            {expandedId && (
                <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-6">
                    {detailLoading ? (
                        <div className="py-20 text-center text-gray-500 text-sm">
                            <Loader2 className="animate-spin mx-auto mb-2" size={20} /> Loading shift detail...
                        </div>
                    ) : detailData ? (
                        <>
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                <div>
                                    <h2 className="text-lg font-semibold text-gray-900">
                                        Shift Detail — {detailData.terminal?.code} ({detailData.terminal?.name})
                                    </h2>
                                    <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-3">
                                        <span>Opened: {fmtDate(detailData.openedAt)} {fmtTime(detailData.openedAt)}</span>
                                        <span>Closed: {detailData.closedAt ? `${fmtDate(detailData.closedAt)} ${fmtTime(detailData.closedAt)}` : 'Still open'}</span>
                                        <span>Duration: {duration(detailData.openedAt, detailData.closedAt)}</span>
                                    </div>
                                </div>
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${detailData.status === 'OPEN' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                                    {detailData.status}
                                </span>
                            </div>
                            {canCloseShift && detailData.status === 'OPEN' && (
                                <div className="flex justify-end">
                                    <button
                                        type="button"
                                        onClick={() => openCloseShiftDialog(detailData)}
                                        className="px-3 py-1.5 text-xs rounded border border-red-300 text-red-700 hover:bg-red-50"
                                    >
                                        Close This Shift
                                    </button>
                                </div>
                            )}

                            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                                <div className="rounded-lg border border-gray-200 p-4">
                                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-1"><DollarSign size={12} /> Opening Cash</div>
                                    <div className="text-lg font-semibold text-gray-900">{fmtMoney(detailData.summary?.cash?.openingCash ?? detailData.openingCash)}</div>
                                </div>
                                <div className="rounded-lg border border-gray-200 p-4">
                                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-1"><Receipt size={12} /> Gross Sales</div>
                                    <div className="text-lg font-semibold text-gray-900">{fmtMoney(detailData.summary?.grossSales ?? detailData.totalSales)}</div>
                                </div>
                                <div className="rounded-lg border border-gray-200 p-4">
                                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-1"><Receipt size={12} /> Posted Sales</div>
                                    <div className="text-lg font-semibold text-gray-900">{fmtMoney(detailData.summary?.postedSales)}</div>
                                </div>
                                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                                    <div className="flex items-center gap-2 text-xs text-amber-700 mb-1"><Receipt size={12} /> Unposted Sales</div>
                                    <div className="text-lg font-semibold text-amber-700">{fmtMoney(detailData.summary?.unpostedSales)}</div>
                                </div>
                                <div className="rounded-lg border border-gray-200 p-4">
                                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-1"><DollarSign size={12} /> Expected Cash</div>
                                    <div className="text-lg font-semibold text-gray-900">{fmtMoney(detailData.summary?.cash?.expectedCash ?? detailData.expectedCash)}</div>
                                </div>
                                <div className="rounded-lg border border-gray-200 p-4">
                                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-1"><DollarSign size={12} /> Variance</div>
                                    <div className={`text-lg font-semibold ${shiftVarianceColor(detailData.variance ?? detailData.summary?.cash?.variance ?? null)}`}>
                                        {(detailData.variance ?? detailData.summary?.cash?.variance) != null
                                            ? `${(detailData.variance ?? detailData.summary?.cash?.variance)! >= 0 ? '+' : ''}${fmtMoney(detailData.variance ?? detailData.summary?.cash?.variance)}`
                                            : '—'}
                                    </div>
                                </div>
                            </div>

                            {detailData.denominations && Object.keys(detailData.denominations).length > 0 && (
                                <div>
                                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Denomination Breakdown</h3>
                                    <div className="grid grid-cols-4 md:grid-cols-6 xl:grid-cols-10 gap-2">
                                        {SAR_DENOMINATIONS.map((d) => {
                                            const count = detailData.denominations?.[String(d)] || 0;
                                            if (count === 0) return null;
                                            return (
                                                <div key={d} className="text-center rounded border border-gray-200 p-2">
                                                    <div className="text-xs text-gray-500">{d} SAR</div>
                                                    <div className="text-sm font-semibold text-gray-900">x{count}</div>
                                                    <div className="text-xs text-gray-400">{(d * count).toFixed(2)}</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {detailData.paymentBreakdown && Object.keys(detailData.paymentBreakdown).length > 0 && (
                                <div>
                                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Payment Method Breakdown</h3>
                                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                                        {Object.entries(detailData.paymentBreakdown)
                                            .sort((a, b) => b[1].total - a[1].total)
                                            .map(([method, data]) => (
                                                <div key={method} className="rounded-lg border border-gray-200 p-3 text-center">
                                                    <div className="text-xs text-gray-500 uppercase">{method}</div>
                                                    <div className="text-sm font-semibold text-gray-900">{fmtMoney(data.total)}</div>
                                                    <div className="text-xs text-gray-400">{data.count} txns</div>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            )}

                            <div className="space-y-3">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <h3 className="text-sm font-semibold text-gray-700">Invoices ({detailData.invoices.length})</h3>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <div className="relative">
                                            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                                            <input
                                                value={invoiceSearch}
                                                onChange={(e) => setInvoiceSearch(e.target.value)}
                                                placeholder="Search invoice/customer"
                                                className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs"
                                            />
                                        </div>
                                        <AppDropdown
                                            value={invoiceMethodFilter}
                                            onChange={(v) => setInvoiceMethodFilter(v)}
                                            options={[{ value: '', label: 'All Methods' }, ...paymentMethods.map((m) => ({ value: m, label: m }))]}
                                            placeholder="All Methods"
                                        />
                                        <AppDropdown
                                            value={invoiceStatusFilter}
                                            onChange={(v) => setInvoiceStatusFilter(v)}
                                            options={[{ value: '', label: 'All Statuses' }, { value: 'PAID', label: 'PAID' }, { value: 'CREDIT', label: 'CREDIT' }, { value: 'PARTIAL', label: 'PARTIAL' }, { value: 'UNPOSTED', label: 'UNPOSTED' }]}
                                            placeholder="All Statuses"
                                        />
                                    </div>
                                </div>
                                <div className="overflow-x-auto rounded-lg border border-gray-200">
                                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Invoice #</th>
                                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Customer</th>
                                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Method</th>
                                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Status</th>
                                                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">Total</th>
                                                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">Cash In</th>
                                                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">Change</th>
                                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Time</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {filteredInvoices.length === 0 ? (
                                                <tr>
                                                    <td colSpan={8} className="px-3 py-8 text-center text-xs text-gray-400">
                                                        No invoices match current filters.
                                                    </td>
                                                </tr>
                                            ) : filteredInvoices.map((inv) => (
                                                <tr key={inv.id} className="hover:bg-gray-50">
                                                    <td className="px-3 py-2 font-mono text-gray-900">{inv.invoiceNo}</td>
                                                    <td className="px-3 py-2 text-gray-600">{inv.customer?.name || 'Walk-in'}</td>
                                                    <td className="px-3 py-2 text-gray-600">{inv.paymentMethod}</td>
                                                    <td className="px-3 py-2">
                                                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${String(inv.status).toUpperCase() === 'UNPOSTED'
                                                            ? 'bg-amber-50 text-amber-700'
                                                            : String(inv.status).toUpperCase() === 'PAID'
                                                                ? 'bg-emerald-50 text-emerald-700'
                                                                : 'bg-gray-100 text-gray-600'
                                                            }`}>
                                                            {String(inv.status).toUpperCase()}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2 text-right font-medium text-gray-900">{fmtMoney(inv.grandTotal)}</td>
                                                    <td className="px-3 py-2 text-right text-gray-700">{fmtMoney(inv.cashReceived)}</td>
                                                    <td className="px-3 py-2 text-right text-gray-700">{fmtMoney(inv.changeGiven)}</td>
                                                    <td className="px-3 py-2 text-gray-400">{fmtTime(inv.createdAt)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {detailData.notes && (
                                <div>
                                    <h3 className="text-sm font-semibold text-gray-700 mb-1">Notes</h3>
                                    <p className="text-sm text-gray-600 bg-gray-50 rounded p-3">{detailData.notes}</p>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="py-20 text-center text-gray-500 text-sm">Shift detail not found.</div>
                    )}
                </div>
            )}

            {(listLoading || analyticsLoading) && (
                <div className="fixed bottom-4 right-4 bg-white border border-gray-200 rounded-lg px-3 py-2 shadow text-xs text-gray-500 flex items-center gap-2">
                    <Loader2 size={12} className="animate-spin" />
                    Syncing shifts...
                </div>
            )}

            {closeShiftTarget && (
                <ShiftCloseDialog
                    shiftId={closeShiftTarget.shiftId}
                    terminalCode={closeShiftTarget.terminalCode}
                    openingCash={closeShiftTarget.openingCash}
                    currentUserEmail={currentUserEmail}
                    onClose={() => setCloseShiftTarget(null)}
                    onClosed={(closedShift) => {
                        setCloseShiftTarget(null);
                        if (closedShift?.id) setExpandedId(String(closedShift.id));
                        refreshAll();
                    }}
                />
            )}
        </div>
    );
}
