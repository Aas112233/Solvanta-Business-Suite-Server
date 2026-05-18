import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import toast from '@/lib/toast';
import { Edit2, Loader2, Monitor, Plus, Power, PowerOff, RefreshCw, Save, Trash2, UserRound, X } from 'lucide-react';
import AppDropdown from '../../components/ui/AppDropdown';
import { POS_PAYMENT_METHOD_KEYS } from '../../lib/globalStrings';

type TerminalPolicy = {
    allowedPaymentMethods?: string[];
    allowCreditSales?: boolean;
    allowPriceChange?: boolean;
    maxDiscountPct?: number;
    returnWindowDays?: number;
    allowPosReturns?: boolean;
    requireSameShiftForReturns?: boolean;
    pricePriority?: 'CUSTOMER_FIRST' | 'TERMINAL_FIRST';
    requireShiftForSale?: boolean;
};

type Terminal = {
    id: string;
    code: string;
    name: string;
    branchId: string;
    defaultUserId?: string | null;
    priceGroupId?: string | null;
    receiptHeader?: string | null;
    receiptFooter?: string | null;
    policy?: TerminalPolicy | null;
    isActive: boolean;
    branch?: { id: string; name: string; code: string };
    defaultUser?: { id: string; name: string } | null;
    priceGroup?: { id: string; name: string } | null;
    activeShift?: { id: string; userId: string; openedAt: string; user: { id: string; name: string } } | null;
};

type ShiftListRow = {
    id: string;
    openedAt: string;
    totalSales?: number | null;
    totalTransactions?: number | null;
    totalRefunds?: number | null;
};

type ShiftDetail = {
    id: string;
    openedAt: string;
    openingCash?: number;
    user?: { id: string; name: string };
    summary?: {
        grossSales?: number;
        totalInvoices?: number;
        cash?: {
            openingCash?: number;
            expectedCash?: number;
        };
    };
};

type TerminalForm = {
    code: string;
    name: string;
    branchId: string;
    defaultUserId: string;
    priceGroupId: string;
    receiptHeader: string;
    receiptFooter: string;
    allowedPaymentMethods: string[];
    allowCreditSales: boolean;
    allowPriceChange: boolean;
    maxDiscountPct: number;
    returnWindowDays: number;
    allowPosReturns: boolean;
    requireSameShiftForReturns: boolean;
    pricePriority: 'CUSTOMER_FIRST' | 'TERMINAL_FIRST';
    requireShiftForSale: boolean;
};

const emptyForm: TerminalForm = {
    code: '',
    name: '',
    branchId: '',
    defaultUserId: '',
    priceGroupId: '',
    receiptHeader: '',
    receiptFooter: '',
    allowedPaymentMethods: [...POS_PAYMENT_METHOD_KEYS],
    allowCreditSales: true,
    allowPriceChange: true,
    maxDiscountPct: 100,
    returnWindowDays: 30,
    allowPosReturns: true,
    requireSameShiftForReturns: true,
    pricePriority: 'CUSTOMER_FIRST',
    requireShiftForSale: true,
};

const money = (n: number | null | undefined) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function POSTerminals() {
    const qc = useQueryClient();
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<TerminalForm>(emptyForm);
    const [selectedTerminalId, setSelectedTerminalId] = useState<string>('');

    const { data: terminals = [], isLoading } = useQuery({
        queryKey: ['pos-terminals'],
        queryFn: () => api.get('/pos-terminals').then((r) => r.data.data as Terminal[]),
    });

    const { data: branches = [], refetch: refetchBranches, isFetching: isFetchingBranches } = useQuery({
        queryKey: ['branches-list'],
        queryFn: () => api.get('/branches').then((r) => r.data.data),
    });

    const { data: users = [], refetch: refetchUsers, isFetching: isFetchingUsers } = useQuery({
        queryKey: ['users-list'],
        queryFn: () => api.get('/users').then((r) => r.data.data),
    });

    const { data: priceGroups = [], refetch: refetchPriceGroups, isFetching: isFetchingPriceGroups } = useQuery({
        queryKey: ['priceChannels'],
        queryFn: () => api.get('/products/meta/price-groups').then((r) => r.data.data),
    });

    useEffect(() => {
        if (!selectedTerminalId && terminals.length > 0) setSelectedTerminalId(terminals[0].id);
        if (selectedTerminalId && terminals.every((t) => t.id !== selectedTerminalId)) setSelectedTerminalId(terminals[0]?.id || '');
    }, [terminals, selectedTerminalId]);

    const selectedTerminal = useMemo(() => terminals.find((t) => t.id === selectedTerminalId) || null, [terminals, selectedTerminalId]);

    const { data: terminalDetail } = useQuery({
        queryKey: ['pos-terminal-detail', selectedTerminalId],
        queryFn: () => api.get(`/pos-terminals/${selectedTerminalId}`).then((r) => r.data.data as Terminal),
        enabled: !!selectedTerminalId,
    });

    const { data: activeShift } = useQuery({
        queryKey: ['pos-terminal-active-shift', selectedTerminalId],
        queryFn: () => api.get(`/pos-terminals/${selectedTerminalId}/active-shift`).then((r) => r.data.data as ShiftDetail | null),
        enabled: !!selectedTerminalId,
        refetchInterval: 20000,
    });

    const { data: activeShiftDetail } = useQuery({
        queryKey: ['pos-terminal-active-shift-detail', activeShift?.id],
        queryFn: () => api.get(`/pos-terminals/shifts/${activeShift?.id}`).then((r) => r.data.data as ShiftDetail),
        enabled: !!activeShift?.id,
        refetchInterval: 20000,
    });

    const { data: shiftHistory = [] } = useQuery({
        queryKey: ['pos-terminal-shifts', selectedTerminalId],
        queryFn: () => api.get('/pos-terminals/shifts/list', { params: { terminalId: selectedTerminalId, page: 1, limit: 100 } }).then((r) => (r.data.data || []) as ShiftListRow[]),
        enabled: !!selectedTerminalId,
    });

    const { data: unposted = [] } = useQuery({
        queryKey: ['pos-terminal-unposted', selectedTerminalId, selectedTerminal?.branchId],
        queryFn: () => api.get('/pos/unposted', { params: { posTerminalId: selectedTerminalId, branchId: selectedTerminal?.branchId } }).then((r) => r.data.data || []),
        enabled: !!selectedTerminalId && !!selectedTerminal?.branchId,
    });

    const summary = useMemo(() => {
        const dayStart = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
        let todaySales = 0;
        let todayTx = 0;
        let totalSales = 0;
        let totalTx = 0;
        let refunds = 0;
        for (const row of shiftHistory) {
            const openedAt = new Date(row.openedAt).getTime();
            const sales = Number(row.totalSales || 0);
            const tx = Number(row.totalTransactions || 0);
            totalSales += sales;
            totalTx += tx;
            refunds += Number(row.totalRefunds || 0);
            if (openedAt >= dayStart) {
                todaySales += sales;
                todayTx += tx;
            }
        }
        const unpostedAmount = (unposted as any[]).reduce((sum, x: any) => sum + Number(x.grandTotal || 0), 0);
        return {
            todaySales,
            todayTx,
            totalSales,
            totalTx,
            refunds,
            unpostedCount: (unposted as any[]).length,
            unpostedAmount,
            activeGross: Number(activeShiftDetail?.summary?.grossSales || 0),
            activeTx: Number(activeShiftDetail?.summary?.totalInvoices || 0),
        };
    }, [shiftHistory, unposted, activeShiftDetail]);

    const saveMut = useMutation({
        mutationFn: (payload: any) => editingId ? api.patch(`/pos-terminals/${editingId}`, payload) : api.post('/pos-terminals', payload),
        onSuccess: () => {
            toast.success(editingId ? 'Terminal updated' : 'Terminal created');
            closeForm();
            qc.invalidateQueries({ queryKey: ['pos-terminals'] });
            qc.invalidateQueries({ queryKey: ['pos-terminal-detail'] });
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to save terminal'),
    });

    const deactivateMut = useMutation({
        mutationFn: (id: string) => api.delete(`/pos-terminals/${id}`),
        onSuccess: () => {
            toast.success('Terminal deactivated');
            qc.invalidateQueries({ queryKey: ['pos-terminals'] });
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to deactivate terminal'),
    });

    const activateMut = useMutation({
        mutationFn: (id: string) => api.patch(`/pos-terminals/${id}`, { isActive: true }),
        onSuccess: () => {
            toast.success('Terminal activated');
            qc.invalidateQueries({ queryKey: ['pos-terminals'] });
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to activate terminal'),
    });

    const quickPolicyMut = useMutation({
        mutationFn: (payload: { id: string; policy: TerminalPolicy }) => api.patch(`/pos-terminals/${payload.id}`, { policy: payload.policy }),
        onSuccess: () => {
            toast.success('Terminal policy updated');
            qc.invalidateQueries({ queryKey: ['pos-terminals'] });
            qc.invalidateQueries({ queryKey: ['pos-terminal-detail'] });
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to update policy'),
    });

    const totalActive = terminals.filter((t) => t.isActive).length;
    const totalOpenShifts = terminals.filter((t) => !!t.activeShift).length;

    function closeForm() {
        setShowForm(false);
        setEditingId(null);
        setForm(emptyForm);
    }

    function openEdit(t: Terminal) {
        setEditingId(t.id);
        setForm({
            code: t.code,
            name: t.name,
            branchId: t.branchId,
            defaultUserId: t.defaultUserId || '',
            priceGroupId: t.priceGroupId || '',
            receiptHeader: t.receiptHeader || '',
            receiptFooter: t.receiptFooter || '',
            allowedPaymentMethods: t.policy?.allowedPaymentMethods?.length ? t.policy.allowedPaymentMethods : [...POS_PAYMENT_METHOD_KEYS],
            allowCreditSales: t.policy?.allowCreditSales !== false,
            allowPriceChange: t.policy?.allowPriceChange !== false,
            maxDiscountPct: Number(t.policy?.maxDiscountPct ?? 100),
            returnWindowDays: Number(t.policy?.returnWindowDays ?? 30),
            allowPosReturns: t.policy?.allowPosReturns !== false,
            requireSameShiftForReturns: t.policy?.requireSameShiftForReturns !== false,
            pricePriority: t.policy?.pricePriority === 'TERMINAL_FIRST' ? 'TERMINAL_FIRST' : 'CUSTOMER_FIRST',
            requireShiftForSale: t.policy?.requireShiftForSale !== false,
        });
        setShowForm(true);
    }

    function patchQuickPolicy<K extends keyof TerminalPolicy>(key: K, value: NonNullable<TerminalPolicy[K]>) {
        if (!terminalDetail) return;
        quickPolicyMut.mutate({
            id: terminalDetail.id,
            policy: {
                ...(terminalDetail.policy || {}),
                [key]: value,
            },
        });
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!form.code.trim() || !form.name.trim() || !form.branchId) {
            toast.error('Code, name, and branch are required');
            return;
        }
        if (form.allowedPaymentMethods.length === 0) {
            toast.error('Choose at least one payment method');
            return;
        }

        saveMut.mutate({
            code: form.code.trim(),
            name: form.name.trim(),
            branchId: form.branchId,
            defaultUserId: form.defaultUserId || null,
            priceGroupId: form.priceGroupId || null,
            receiptHeader: form.receiptHeader || null,
            receiptFooter: form.receiptFooter || null,
            policy: {
                allowedPaymentMethods: form.allowedPaymentMethods,
                allowCreditSales: form.allowCreditSales,
                allowPriceChange: form.allowPriceChange,
                maxDiscountPct: Number(form.maxDiscountPct || 0),
                returnWindowDays: Number(form.returnWindowDays || 0),
                allowPosReturns: form.allowPosReturns,
                requireSameShiftForReturns: form.requireSameShiftForReturns,
                pricePriority: form.pricePriority,
                requireShiftForSale: form.requireShiftForSale,
            },
        });
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <Monitor size={24} className="text-blue-600" />
                        <h1 className="text-2xl font-bold text-gray-900">POS Terminal Manager</h1>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">Full control center for terminal status, shifts, configuration and sales visibility</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => {
                            qc.invalidateQueries({ queryKey: ['pos-terminals'] });
                            qc.invalidateQueries({ queryKey: ['pos-terminal-shifts'] });
                            qc.invalidateQueries({ queryKey: ['pos-terminal-unposted'] });
                        }}
                        className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                    >
                        <RefreshCw size={14} /> Refresh
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setForm(emptyForm);
                            setEditingId(null);
                            setShowForm(true);
                        }}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                    >
                        <Plus size={16} /> New Terminal
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Total Terminals</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{terminals.length}</p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <p className="text-xs text-emerald-700 uppercase tracking-wider">Active Terminals</p>
                    <p className="text-2xl font-bold text-emerald-800 mt-1">{totalActive}</p>
                </div>
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                    <p className="text-xs text-blue-700 uppercase tracking-wider">Open Shifts</p>
                    <p className="text-2xl font-bold text-blue-800 mt-1">{totalOpenShifts}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-4">
                <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                    {isLoading ? (
                        <div className="py-20 text-center text-gray-500 text-sm">
                            <Loader2 className="animate-spin mx-auto mb-2" size={20} /> Loading terminals...
                        </div>
                    ) : terminals.length === 0 ? (
                        <div className="py-20 text-center text-gray-500 text-sm">No terminals configured yet.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Terminal</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Branch</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">User</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Shift</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {terminals.map((t) => (
                                        <tr key={t.id} className={`transition-colors ${selectedTerminalId === t.id ? 'bg-blue-50/60' : 'hover:bg-gray-50'}`}>
                                            <td className="px-4 py-3 text-sm">
                                                <button type="button" className="text-left" onClick={() => setSelectedTerminalId(t.id)}>
                                                    <p className="font-mono font-semibold text-gray-900">{t.code}</p>
                                                    <p className="text-gray-600">{t.name}</p>
                                                </button>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-600">{t.branch?.name || '—'}</td>
                                            <td className="px-4 py-3 text-sm text-gray-600">{t.defaultUser?.name || '—'}</td>
                                            <td className="px-4 py-3 text-sm">
                                                {t.activeShift ? (
                                                    <div className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-2 py-1 inline-block">
                                                        <div className="font-semibold">{t.activeShift.user.name}</div>
                                                        <div>{new Date(t.activeShift.openedAt).toLocaleTimeString()}</div>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-gray-400">No open shift</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${t.isActive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}>
                                                    {t.isActive ? <Power size={10} /> : <PowerOff size={10} />}
                                                    {t.isActive ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="inline-flex items-center gap-1">
                                                    <button type="button" onClick={() => setSelectedTerminalId(t.id)} className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-700 hover:bg-gray-50">Manage</button>
                                                    <button type="button" onClick={() => openEdit(t)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700" title="Edit"><Edit2 size={14} /></button>
                                                    {t.isActive ? (
                                                        <button type="button" onClick={() => { if (confirm(`Deactivate terminal \"${t.code}\"?`)) deactivateMut.mutate(t.id); }} className="p-1.5 rounded hover:bg-red-50 text-red-400 hover:text-red-600" title="Deactivate"><Trash2 size={14} /></button>
                                                    ) : (
                                                        <button type="button" onClick={() => activateMut.mutate(t.id)} className="p-1.5 rounded hover:bg-emerald-50 text-emerald-500 hover:text-emerald-700" title="Activate"><Power size={14} /></button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
                    {!terminalDetail ? (
                        <div className="text-sm text-gray-500">Select a terminal to manage details.</div>
                    ) : (
                        <>
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-xs uppercase tracking-wider text-gray-500">Managing Terminal</p>
                                    <h3 className="text-lg font-bold text-gray-900">{terminalDetail.code} · {terminalDetail.name}</h3>
                                    <p className="text-xs text-gray-500 mt-1">{terminalDetail.branch?.name || 'No branch'} · {terminalDetail.priceGroup?.name || 'Default pricing'}</p>
                                </div>
                                <button type="button" onClick={() => openEdit(terminalDetail)} className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">Full Edit</button>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div className="rounded-lg border border-gray-200 p-2.5">
                                    <div className="text-[11px] text-gray-500 uppercase">Today Sales</div>
                                    <div className="text-sm font-bold text-gray-900 mt-1">{money(summary.todaySales)}</div>
                                    <div className="text-[11px] text-gray-500">{summary.todayTx} tx</div>
                                </div>
                                <div className="rounded-lg border border-gray-200 p-2.5">
                                    <div className="text-[11px] text-gray-500 uppercase">100 Shifts Sales</div>
                                    <div className="text-sm font-bold text-gray-900 mt-1">{money(summary.totalSales)}</div>
                                    <div className="text-[11px] text-gray-500">{summary.totalTx} tx</div>
                                </div>
                                <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                                    <div className="text-[11px] uppercase text-amber-700">Unposted</div>
                                    <div className="text-sm font-bold text-amber-800 mt-1">{summary.unpostedCount} invoices</div>
                                    <div className="text-[11px] text-amber-700">{money(summary.unpostedAmount)}</div>
                                </div>
                                <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5">
                                    <div className="text-[11px] uppercase text-rose-700">Returns (100 shifts)</div>
                                    <div className="text-sm font-bold text-rose-800 mt-1">{money(summary.refunds)}</div>
                                </div>
                            </div>

                            <div className="rounded-lg border border-gray-200 p-3 space-y-2">
                                <div className="text-xs uppercase tracking-wider text-gray-500">Active Shift Details</div>
                                {activeShift ? (
                                    <>
                                        <p className="text-sm text-gray-700"><span className="font-semibold">Cashier:</span> {activeShift.user?.name || 'Unknown'}</p>
                                        <p className="text-xs text-gray-500"><span className="font-medium">Opened:</span> {new Date(activeShift.openedAt).toLocaleString()}</p>
                                        <p className="text-xs text-gray-500"><span className="font-medium">Opening Cash:</span> {money(activeShiftDetail?.summary?.cash?.openingCash || activeShift.openingCash)}</p>
                                        <p className="text-xs text-gray-500"><span className="font-medium">Current Gross:</span> {money(summary.activeGross)} ({summary.activeTx} tx)</p>
                                        <p className="text-xs text-gray-500"><span className="font-medium">Expected Cash:</span> {money(activeShiftDetail?.summary?.cash?.expectedCash)}</p>
                                    </>
                                ) : (
                                    <p className="text-xs text-gray-500">No active shift on this terminal.</p>
                                )}
                            </div>

                            <div className="rounded-lg border border-gray-200 p-3 space-y-3">
                                <div className="text-xs uppercase tracking-wider text-gray-500">Quick Controls</div>
                                <div className="grid grid-cols-2 gap-2">
                                    <button type="button" disabled={quickPolicyMut.isPending} onClick={() => patchQuickPolicy('allowCreditSales', !(terminalDetail.policy?.allowCreditSales !== false))} className="px-3 py-2 text-xs rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50">{terminalDetail.policy?.allowCreditSales !== false ? 'Disable' : 'Enable'} Credit</button>
                                    <button type="button" disabled={quickPolicyMut.isPending} onClick={() => patchQuickPolicy('requireShiftForSale', !(terminalDetail.policy?.requireShiftForSale !== false))} className="px-3 py-2 text-xs rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50">{terminalDetail.policy?.requireShiftForSale !== false ? 'Allow' : 'Require'} Sale Without Shift</button>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <button type="button" disabled={quickPolicyMut.isPending} onClick={() => patchQuickPolicy('allowPosReturns', !(terminalDetail.policy?.allowPosReturns !== false))} className="px-3 py-2 text-xs rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50">{terminalDetail.policy?.allowPosReturns !== false ? 'Disable' : 'Enable'} Returns</button>
                                    <button type="button" disabled={quickPolicyMut.isPending} onClick={() => patchQuickPolicy('allowPriceChange', !(terminalDetail.policy?.allowPriceChange !== false))} className="px-3 py-2 text-xs rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50">{terminalDetail.policy?.allowPriceChange !== false ? 'Lock' : 'Allow'} Price Change</button>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <button type="button" disabled={quickPolicyMut.isPending} onClick={() => patchQuickPolicy('pricePriority', terminalDetail.policy?.pricePriority === 'TERMINAL_FIRST' ? 'CUSTOMER_FIRST' : 'TERMINAL_FIRST')} className="px-3 py-2 text-xs rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50">Price: {terminalDetail.policy?.pricePriority === 'TERMINAL_FIRST' ? 'Terminal First' : 'Customer First'}</button>
                                </div>
                            </div>

                            <div className="rounded-lg border border-gray-200 p-3 text-xs text-gray-500">
                                <div className="flex items-center gap-2"><UserRound size={12} /> Default user: {terminalDetail.defaultUser?.name || 'Not assigned'}</div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {showForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <form onSubmit={handleSubmit} className="w-full max-w-2xl rounded-xl bg-white p-6 space-y-4 shadow-xl max-h-[92vh] overflow-y-auto">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-gray-900">{editingId ? 'Edit Terminal' : 'New Terminal'}</h3>
                            <button type="button" onClick={closeForm} className="p-1 rounded hover:bg-gray-100"><X size={18} /></button>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="block text-xs font-medium text-gray-600 mb-1">Code *</label><input value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} placeholder="POS-01" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" required /></div>
                            <div><label className="block text-xs font-medium text-gray-600 mb-1">Name *</label><input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Main Counter" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" required /></div>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Branch *</label>
                            <AppDropdown
                                value={form.branchId}
                                onChange={(v) => setForm((p) => ({ ...p, branchId: v }))}
                                options={[{ value: '', label: 'Select branch...' }, ...branches.map((b: any) => ({ value: b.id, label: `${b.name} (${b.code})` }))]}
                                placeholder="Select branch..."
                                searchable
                                onRefresh={refetchBranches}
                                refreshing={isFetchingBranches}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Default User</label>
                                <AppDropdown
                                    value={form.defaultUserId}
                                    onChange={(v) => setForm((p) => ({ ...p, defaultUserId: v }))}
                                    options={[{ value: '', label: 'None' }, ...users.map((u: any) => ({ value: u.id, label: u.name }))]}
                                    placeholder="None"
                                    searchable
                                    onRefresh={refetchUsers}
                                    refreshing={isFetchingUsers}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Price Group</label>
                                <AppDropdown
                                    value={form.priceGroupId}
                                    onChange={(v) => setForm((p) => ({ ...p, priceGroupId: v }))}
                                    options={[{ value: '', label: 'Default pricing' }, ...priceGroups.map((g: any) => ({ value: g.id, label: g.name }))]}
                                    placeholder="Default pricing"
                                    searchable
                                    onRefresh={refetchPriceGroups}
                                    refreshing={isFetchingPriceGroups}
                                />
                            </div>
                        </div>

                        <div className="rounded-lg border border-gray-200 p-3 space-y-3">
                            <div className="text-xs font-semibold text-gray-700 uppercase tracking-wider">POS Policy</div>
                            <div className="grid grid-cols-2 gap-3">
                                <label className="text-xs text-gray-700 flex items-center gap-2"><input type="checkbox" checked={form.allowCreditSales} onChange={(e) => setForm((p) => ({ ...p, allowCreditSales: e.target.checked }))} />Allow Credit</label>
                                <label className="text-xs text-gray-700 flex items-center gap-2"><input type="checkbox" checked={form.allowPosReturns} onChange={(e) => setForm((p) => ({ ...p, allowPosReturns: e.target.checked }))} />Allow Returns</label>
                                <label className="text-xs text-gray-700 flex items-center gap-2"><input type="checkbox" checked={form.requireSameShiftForReturns} onChange={(e) => setForm((p) => ({ ...p, requireSameShiftForReturns: e.target.checked }))} />Same Shift Return</label>
                                <label className="text-xs text-gray-700 flex items-center gap-2"><input type="checkbox" checked={form.requireShiftForSale} onChange={(e) => setForm((p) => ({ ...p, requireShiftForSale: e.target.checked }))} />Require Open Shift</label>
                                <label className="text-xs text-gray-700 flex items-center gap-2"><input type="checkbox" checked={form.allowPriceChange} onChange={(e) => setForm((p) => ({ ...p, allowPriceChange: e.target.checked }))} />Allow Price Change</label>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className="block text-xs font-medium text-gray-600 mb-1">Max Discount %</label><input type="number" min={0} max={100} value={form.maxDiscountPct} onChange={(e) => setForm((p) => ({ ...p, maxDiscountPct: Number(e.target.value) }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
                                <div><label className="block text-xs font-medium text-gray-600 mb-1">Return Window (days)</label><input type="number" min={0} max={365} value={form.returnWindowDays} onChange={(e) => setForm((p) => ({ ...p, returnWindowDays: Number(e.target.value) }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Price Priority</label>
                                <AppDropdown
                                    value={form.pricePriority}
                                    onChange={(v) => setForm((p) => ({ ...p, pricePriority: v as 'CUSTOMER_FIRST' | 'TERMINAL_FIRST' }))}
                                    options={[{ value: 'CUSTOMER_FIRST', label: 'Customer First' }, { value: 'TERMINAL_FIRST', label: 'Terminal First' }]}
                                    placeholder="Price Priority"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Allowed Payment Methods</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {POS_PAYMENT_METHOD_KEYS.map((pm) => (
                                        <label key={pm} className="text-xs text-gray-700 flex items-center gap-2">
                                            <input type="checkbox" checked={form.allowedPaymentMethods.includes(pm)} onChange={(e) => setForm((p) => ({ ...p, allowedPaymentMethods: e.target.checked ? Array.from(new Set([...p.allowedPaymentMethods, pm])) : p.allowedPaymentMethods.filter((x) => x !== pm), }))} />
                                            {pm}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div><label className="block text-xs font-medium text-gray-600 mb-1">Receipt Header</label><textarea value={form.receiptHeader} onChange={(e) => setForm((p) => ({ ...p, receiptHeader: e.target.value }))} placeholder="Company name, address, etc." rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none" /></div>
                        <div><label className="block text-xs font-medium text-gray-600 mb-1">Receipt Footer</label><textarea value={form.receiptFooter} onChange={(e) => setForm((p) => ({ ...p, receiptFooter: e.target.value }))} placeholder="Thank you for visiting!" rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none" /></div>

                        <div className="flex justify-end gap-2 pt-2">
                            <button type="button" onClick={closeForm} className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
                            <button type="submit" disabled={saveMut.isPending} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                                {saveMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                {editingId ? 'Update' : 'Create'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
