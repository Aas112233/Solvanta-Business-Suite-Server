import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import toast from '@/lib/toast';
import { useDebounce } from '../../hooks/useDebounce';
import {
    Search,
    Plus,
    UserRound,
    History,
    Smile,
    Phone,
    TrendingUp,
    TrendingDown,
    Loader2,
    X,
    Save,
    Calendar,
    Receipt
} from 'lucide-react';
import { format } from 'date-fns';

type LoyaltyCustomer = {
    id: string;
    name: string;
    phone: string;
    pointsBalance: number;
    createdAt: string;
};

type PointHistory = {
    id: string;
    pointsChange: number;
    type: 'EARNED' | 'REDEEMED' | 'ADJUSTMENT';
    notes: string | null;
    createdAt: string;
    invoice?: {
        invoiceNo: string;
    } | null;
};

const emptyForm = {
    name: '',
    phone: '',
};

export default function LoyaltyCustomers() {
    const qc = useQueryClient();
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebounce(search, 300);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState(emptyForm);
    const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

    const { data: customers = [], isLoading } = useQuery({
        queryKey: ['loyalty-customers', debouncedSearch],
        queryFn: () => api.get('/pos/loyalty-customers', { params: { q: debouncedSearch } }).then((r) => r.data.data as LoyaltyCustomer[]),
    });

    const { data: customerDetail } = useQuery({
        queryKey: ['loyalty-customer-detail', selectedCustomerId],
        queryFn: async () => {
            const res = await api.get(`/pos/loyalty-customers/${selectedCustomerId}`);
            const payload = res.data.data;
            if (payload?.customer && Array.isArray(payload?.history)) {
                return payload as { customer: LoyaltyCustomer; history: PointHistory[] };
            }
            return {
                customer: payload as LoyaltyCustomer,
                history: Array.isArray(payload?.pointHistory) ? payload.pointHistory : [],
            };
        },
        enabled: !!selectedCustomerId,
    });

    const createMut = useMutation({
        mutationFn: (payload: typeof emptyForm) => api.post('/pos/loyalty-customers', payload),
        onSuccess: () => {
            toast.success('Loyalty customer created');
            setShowForm(false);
            setForm(emptyForm);
            qc.invalidateQueries({ queryKey: ['loyalty-customers'] });
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to create customer'),
    });

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!form.name.trim() || !form.phone.trim()) {
            toast.error('Name and phone are required');
            return;
        }
        createMut.mutate(form);
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <Smile size={24} className="text-pink-600" />
                        <h1 className="text-2xl font-bold text-gray-900">Walk-in Customers (Happiness Price)</h1>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">Manage loyalty points and purchase history for walk-in clients</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <input
                            type="text"
                            placeholder="Search name or phone..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-pink-500 focus:border-pink-500 outline-none w-64"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowForm(true)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 text-sm font-medium transition-colors shadow-sm"
                    >
                        <Plus size={16} /> New Customer
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_1fr] gap-6">
                {/* Customer List */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                        <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                            <UserRound size={18} className="text-gray-400" />
                            Customer Directory
                        </h3>
                    </div>
                    {isLoading ? (
                        <div className="py-20 text-center">
                            <Loader2 className="animate-spin mx-auto text-pink-500 mb-2" size={24} />
                            <span className="text-sm text-gray-500">Loading customers...</span>
                        </div>
                    ) : customers.length === 0 ? (
                        <div className="py-20 text-center text-gray-500">
                            {search ? 'No customers matching your search.' : 'No loyalty customers registered yet.'}
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-white">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Points Balance</th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-100">
                                    {customers.map((c) => (
                                        <tr
                                            key={c.id}
                                            className={`hover:bg-gray-50 cursor-pointer transition-colors ${selectedCustomerId === c.id ? 'bg-pink-50/50' : ''}`}
                                            onClick={() => setSelectedCustomerId(c.id)}
                                        >
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm font-medium text-gray-900">{c.name}</div>
                                                <div className="text-xs text-gray-400">Joined {format(new Date(c.createdAt), 'MMM d, yyyy')}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                                    <Phone size={14} className="text-gray-400" />
                                                    {c.phone}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right">
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-pink-100 text-pink-800">
                                                    {c.pointsBalance.toLocaleString()} Pts
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                <button
                                                    className="text-pink-600 hover:text-pink-900"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedCustomerId(c.id);
                                                    }}
                                                >
                                                    View Details
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Point History / Details */}
                <div className="space-y-6">
                    {!selectedCustomerId ? (
                        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center text-gray-500">
                            Select a customer to view point history and details
                        </div>
                    ) : !customerDetail ? (
                        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                            <Loader2 className="animate-spin mx-auto text-pink-500 mb-2" size={24} />
                            <span className="text-sm text-gray-500">Loading history...</span>
                        </div>
                    ) : (
                        <>
                            {/* Summary Card */}
                            <div className="bg-gradient-to-br from-pink-500 to-rose-600 rounded-xl p-6 text-white shadow-md">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <h3 className="text-2xl font-bold">{customerDetail.customer.name}</h3>
                                        <p className="text-pink-100 flex items-center gap-2 mt-1">
                                            <Phone size={14} /> {customerDetail.customer.phone}
                                        </p>
                                    </div>
                                    <div className="bg-white/20 p-2 rounded-lg">
                                        <Smile size={24} />
                                    </div>
                                </div>
                                <div className="mt-8">
                                    <p className="text-pink-100 text-xs uppercase tracking-wider font-semibold">Available Points</p>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-4xl font-black">{customerDetail.customer.pointsBalance.toLocaleString()}</span>
                                        <span className="text-lg text-pink-100 font-medium">Points</span>
                                    </div>
                                    <p className="text-pink-100 text-xs mt-2">
                                        Approx. Value: <span className="font-bold">{(customerDetail.customer.pointsBalance * 0.005).toFixed(2)} SAR</span>
                                    </p>
                                </div>
                            </div>

                            {/* History Timeline */}
                            <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col">
                                <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                                    <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                                        <History size={18} className="text-gray-400" />
                                        Point Activity
                                    </h3>
                                </div>
                                <div className="max-h-[500px] overflow-y-auto p-4 space-y-4">
                                    {customerDetail.history.length === 0 ? (
                                        <p className="text-center py-8 text-gray-400 text-sm italic">No point activity yet</p>
                                    ) : (
                                        customerDetail.history.map((h: PointHistory) => (
                                            <div key={h.id} className="flex gap-3 items-start border-l-2 border-gray-100 pl-4 py-1 relative ml-2">
                                                <div className={`absolute -left-[9px] top-2 w-4 h-4 rounded-full border-2 border-white ${h.type === 'EARNED' ? 'bg-emerald-500' : h.type === 'REDEEMED' ? 'bg-rose-500' : 'bg-blue-500'
                                                    }`} />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-start">
                                                        <div className="text-sm font-semibold text-gray-900">
                                                            {h.type === 'EARNED' ? 'Points Earned' : h.type === 'REDEEMED' ? 'Points Redeemed' : 'Adjustment'}
                                                        </div>
                                                        <div className={`text-sm font-bold ${h.pointsChange > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                            {h.pointsChange > 0 ? '+' : ''}{h.pointsChange.toLocaleString()}
                                                        </div>
                                                    </div>
                                                    <p className="text-xs text-gray-500 mt-0.5">{h.notes}</p>
                                                    <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400 uppercase tracking-tighter font-bold">
                                                        <span className="flex items-center gap-1"><Calendar size={10} /> {format(new Date(h.createdAt), 'MMM d, HH:mm')}</span>
                                                        {h.invoice && <span className="flex items-center gap-1 text-pink-600/70"><Receipt size={10} /> {h.invoice.invoiceNo}</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Create Component Modal */}
            {showForm && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
                    <form onSubmit={handleSubmit} className="w-full max-w-md rounded-2xl bg-white p-6 space-y-6 shadow-2xl transition-all scale-100">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 text-pink-600">
                                <div className="p-2 bg-pink-50 rounded-lg">
                                    <Plus size={20} />
                                </div>
                                <h3 className="text-xl font-bold text-gray-900">New Loyalty Member</h3>
                            </div>
                            <button type="button" onClick={() => setShowForm(false)} className="p-2 rounded-full hover:bg-gray-100 text-gray-400 transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Full Name *</label>
                                <input
                                    value={form.name}
                                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                                    placeholder="Enter customer name"
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-pink-500 focus:border-pink-500 outline-none transition-all"
                                    required
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Phone Number *</label>
                                <div className="relative">
                                    <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                    <input
                                        value={form.phone}
                                        type="tel"
                                        onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                                        placeholder="05xxxxxxx"
                                        className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-pink-500 focus:border-pink-500 outline-none transition-all"
                                        required
                                    />
                                </div>
                                <p className="text-[10px] text-gray-400 mt-1.5 px-1 font-medium italic">Unique phone number required for point tracking</p>
                            </div>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setShowForm(false)}
                                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={createMut.isPending}
                                className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-pink-600 text-white text-sm font-semibold hover:bg-pink-700 disabled:opacity-50 transition-all shadow-md shadow-pink-200"
                            >
                                {createMut.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                Register Member
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
