import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import toast from 'react-hot-toast';
import ModuleRefreshButton from '../components/ModuleRefreshButton';
import Pagination from '../components/ui/Pagination';
import {
    Search, Plus, Edit2, Trash2, X, Loader2,
    Phone, Mail, MapPin, Hash, Briefcase,
    ArrowUpRight, Users, ShoppingCart, TrendingUp,
    ChevronRight, ExternalLink
} from 'lucide-react';
import { format } from 'date-fns';
import Modal from '../components/ui/Modal';

export default function Suppliers() {
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [editing, setEditing] = useState<any>(null);
    const [showForm, setShowForm] = useState(false);
    const [viewing, setViewing] = useState<any>(null);
    const { hasPermission } = useAuthStore();
    const canCreateSupplier = hasPermission('supplier.create');
    const canEditSupplier = hasPermission('supplier.edit');
    const canDeleteSupplier = hasPermission('supplier.delete');
    const currency = useAuthStore((s) => s.user?.company?.currency) || 'SAR';
    const navigate = useNavigate();
    const qc = useQueryClient();

    // Summary Stats
    const { data: stats } = useQuery({
        queryKey: ['suppliers-stats'],
        queryFn: () => api.get('/suppliers/summary/stats').then(r => r.data.data)
    });

    // Suppliers List
    const { data, isLoading, isFetching } = useQuery({
        queryKey: ['suppliers', search, page, limit],
        queryFn: () => api.get('/suppliers', { params: { search, page, limit } }).then(r => r.data),
    });

    const deleteMut = useMutation({
        mutationFn: (id: string) => api.delete(`/suppliers/${id}`),
        onSuccess: () => {
            toast.success('Supplier archived');
            qc.invalidateQueries({ queryKey: ['suppliers'] });
            qc.invalidateQueries({ queryKey: ['suppliers-stats'] });
        },
    });

    const saveMut = useMutation({
        mutationFn: (s: any) => s.id ? api.patch(`/suppliers/${s.id}`, s) : api.post('/suppliers', s),
        onSuccess: () => {
            toast.success('Supplier Saved');
            qc.invalidateQueries({ queryKey: ['suppliers'] });
            qc.invalidateQueries({ queryKey: ['suppliers-stats'] });
            setShowForm(false);
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to save'),
    });

    const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        saveMut.mutate({
            ...(editing?.id && { id: editing.id }),
            supplierCode: fd.get('supplierCode'),
            name: fd.get('name'),
            phone: fd.get('phone'),
            vatNumber: fd.get('vatNumber'),
            address: fd.get('address'),
            city: fd.get('city'),
            country: fd.get('country'),
            openingBalance: Number(fd.get('openingBalance')) || 0,
        });
    };

    const getInitial = (name: string) => name.charAt(0).toUpperCase();
    const formatLocation = (address: any) => {
        const parts = [address?.street, address?.city, address?.country]
            .map((v) => String(v || '').trim())
            .filter(Boolean);
        return parts.length ? parts.join(', ') : 'No location';
    };

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            {/* Header & Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold text-gray-900">Supplier Management</h1>
                        <ModuleRefreshButton queryKeys={[['suppliers'], ['suppliers-stats']]} />
                    </div>
                    <p className="text-sm text-gray-500">{data?.meta?.pagination?.total || 0} active partner accounts</p>
                </div>
                {canCreateSupplier && (
                    <button
                        onClick={() => { setEditing(null); setShowForm(true); }}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg shadow-indigo-200 transition-all font-medium"
                    >
                        <Plus size={18} />
                        Add New Supplier
                    </button>
                )}
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Total Partners', value: stats?.totalSuppliers || 0, icon: Users, color: 'indigo', trend: '+2 this month' },
                    { label: 'Active Status', value: stats?.activeSuppliers || 0, icon: Briefcase, color: 'emerald', trend: 'Healthy' },
                    { label: 'Total Procurement', value: `$${(stats?.totalPurchaseValue || 0).toLocaleString()}`, icon: ShoppingCart, color: 'amber', trend: `${stats?.totalPurchaseCount || 0} orders` },
                    { label: 'Growth', value: '12%', icon: TrendingUp, color: 'rose', trend: 'Supply chain stability' },
                ].map((s, idx) => (
                    <div key={idx} className="p-4 rounded-2xl bg-white border border-gray-100 shadow-sm transition-hover group">
                        <div className="flex items-center gap-3 mb-2">
                            <div className={`p-2 rounded-xl transition-transform ${s.color === 'indigo' ? 'bg-indigo-50 text-indigo-600' :
                                s.color === 'emerald' ? 'bg-emerald-50 text-emerald-600' :
                                    s.color === 'amber' ? 'bg-amber-50 text-amber-600' :
                                        'bg-rose-50 text-rose-600'
                                } group-hover:scale-110`}>
                                <s.icon size={20} />
                            </div>
                            <span className="text-sm font-medium text-gray-400 uppercase tracking-wider">{s.label}</span>
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-bold text-gray-900">{s.value}</span>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${s.color === 'indigo' ? 'text-indigo-500 bg-indigo-50' :
                                s.color === 'emerald' ? 'text-emerald-500 bg-emerald-50' :
                                    s.color === 'amber' ? 'text-amber-500 bg-amber-50' :
                                        'text-rose-500 bg-rose-50'
                                }`}>{s.trend}</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Filter & Search */}
            <div className="flex items-center gap-4 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1);}}
                        placeholder="Search by code, name or phone..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none"
                    />
                </div>
            </div>

            {/* Suppliers Grid/Table */}
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden min-h-[400px] relative">
                {(isLoading || isFetching) && (
                    <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-10 flex flex-col items-center justify-center text-indigo-600">
                        <Loader2 size={40} className="animate-spin mb-3" />
                        <span className="text-sm font-bold animate-pulse">Loading suppliers...</span>
                    </div>
                )}

                <table className="w-full text-left">
                    <thead>
                        <tr className="bg-gray-50/50 border-b border-gray-100">
                            <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Partner Info</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Contact</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Procurement</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Payable</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {isLoading && !isFetching ? (
                            Array(5).fill(0).map((_, i) => (
                                <tr key={i} className="animate-pulse">
                                    <td colSpan={5} className="px-6 py-4"><div className="h-10 bg-gray-100 rounded-lg"></div></td>
                                </tr>
                            ))
                        ) : (data?.data || []).map((s: any) => (
                            <tr key={s.id} className="hover:bg-gray-50/50 transition-colors group">
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center font-bold text-indigo-600 text-lg">
                                            {getInitial(s.name)}
                                        </div>
                                        <div>
                                            <div className="font-semibold text-gray-900">{s.name}</div>
                                            <div className="text-xs text-indigo-500 font-mono">{s.supplierCode}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-600">
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-1.5"><Phone size={12} className="text-gray-400" />{s.phone || 'No phone'}</div>
                                        <div className="flex items-center gap-1.5"><MapPin size={12} className="text-gray-400" />{formatLocation(s.address)}</div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-600">
                                    <div className="space-y-1">
                                        <div className="font-semibold text-gray-900">{currency} {Number(s.metrics?.totalPurchases || 0).toLocaleString()}</div>
                                        <div className="text-xs text-gray-500">{s.metrics?.purchaseCount || 0} purchase orders</div>
                                        <div className="text-[11px] text-gray-400">
                                            Last: {s.metrics?.lastPurchase?.createdAt ? format(new Date(s.metrics.lastPurchase.createdAt), 'MMM dd, yyyy') : 'N/A'}
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-sm">
                                    <div className="space-y-1">
                                        <div className={`font-bold ${Number(s.metrics?.outstandingBalance || 0) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                            {currency} {Number(s.metrics?.outstandingBalance || 0).toLocaleString()}
                                        </div>
                                        <div className="text-xs text-gray-500">Paid: {currency} {Number(s.metrics?.totalPaid || 0).toLocaleString()}</div>
                                        <div className="text-[11px] text-gray-400">Tax: {s.vatNumber || 'N/A'}</div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <button
                                            onClick={() => navigate('/purchases/new')}
                                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                            title="Create Purchase"
                                        >
                                            <ArrowUpRight size={16} />
                                        </button>
                                        <button
                                            onClick={() => setViewing(s)}
                                            className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                            title="View Details"
                                        >
                                            <ExternalLink size={16} />
                                        </button>
                                        {(canEditSupplier || canDeleteSupplier) && (
                                            <>
                                                {canEditSupplier && (
                                                    <button
                                                        onClick={() => { setEditing(s); setShowForm(true); }}
                                                        className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all"
                                                        title="Edit"
                                                    >
                                                        <Edit2 size={16} />
                                                    </button>
                                                )}
                                                {canDeleteSupplier && (
                                                    <button
                                                        onClick={() => {
                                                            if (window.confirm('Archive this supplier?')) deleteMut.mutate(s.id);
                                                        }}
                                                        className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                                        title="Archive"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {!isLoading && (!data?.data || data.data.length === 0) && (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                        <Briefcase size={48} strokeWidth={1} className="mb-4" />
                        <p>No suppliers found matching your search</p>
                    </div>
                )}

                {data?.meta?.pagination && (
                    <Pagination
                        currentPage={page}
                        totalPages={data.meta.pagination.totalPages}
                        totalItems={data.meta.pagination.total}
                        itemsPerPage={limit}
                        onPageChange={setPage}
                        onItemsPerPageChange={setLimit}
                        isLoading={isFetching}
                    />
                )}
            </div>

                        {/* Form Modal */}
            <Modal
                isOpen={showForm}
                onClose={() => setShowForm(false)}
                title={editing?.id ? 'Edit Supplier Profile' : 'New Supplier Partnership'}
                maxWidth="xl"
            >

                        <form onSubmit={handleSave} className="p-6 space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-1">
                                    <label className="text-sm font-semibold text-gray-700 mb-1.5 block flex justify-between">
                                        Unique Vendor Code
                                        <span className="text-[10px] text-gray-400 font-normal mt-0.5">(Optional)</span>
                                    </label>
                                    <input name="supplierCode" defaultValue={editing?.supplierCode} placeholder="Auto-generated" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all font-mono" />
                                </div>
                                <div className="col-span-1">
                                    <label className="text-sm font-semibold text-gray-700 mb-1.5 block">Tax / VAT ID</label>
                                    <input name="vatNumber" defaultValue={editing?.vatNumber} placeholder="VAT-12345" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all" />
                                </div>
                                <div className="col-span-2">
                                    <label className="text-sm font-semibold text-gray-700 mb-1.5 block">Corporate Name</label>
                                    <input name="name" defaultValue={editing?.name} required placeholder="Global Logistics Ltd" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-lg font-bold" />
                                </div>
                                <div className="col-span-1">
                                    <label className="text-sm font-semibold text-gray-700 mb-1.5 block">Primary Phone</label>
                                    <input name="phone" defaultValue={editing?.phone} placeholder="+1 234 567 890" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all" />
                                </div>
                                <div className="col-span-1">
                                    <label className="text-sm font-semibold text-gray-700 mb-1.5 block">Opening Balance ($)</label>
                                    <input name="openingBalance" type="number" step="0.01" defaultValue={editing?.openingBalance || 0} placeholder="0.00" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all" />
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest pt-2">Location Information</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="col-span-2">
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Street Address</label>
                                        <input name="address" defaultValue={editing?.address?.street} placeholder="123 Supply Ave, Suite 500" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all" />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">City</label>
                                        <input name="city" defaultValue={editing?.address?.city} placeholder="New York" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all" />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Country</label>
                                        <input name="country" defaultValue={editing?.address?.country} placeholder="USA" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all" />
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-4 pt-4 border-t border-gray-50">
                                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-3.5 px-6 rounded-2xl bg-gray-50 hover:bg-gray-100 text-gray-600 font-bold transition-all border border-gray-100">
                                    Cancel
                                </button>
                                <button type="submit" disabled={saveMut.isPending} className="flex-1 py-3.5 px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-lg shadow-indigo-100 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                                    {saveMut.isPending ? <Loader2 className="animate-spin" size={20} /> : (editing?.id ? 'Update Supplier' : 'Establish Partnership')}
                                </button>
                            </div>
                        </form>
            </Modal>

            {/* Details Slideover */}
            {viewing && (
                <div className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-[2px] animate-fade-in" onClick={() => setViewing(null)}>
                    <div className="w-full max-w-lg bg-white h-full shadow-2xl animate-slide-in p-8 overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-8">
                            <h2 className="text-2xl font-bold text-gray-900 leading-tight">Supplier Profile</h2>
                            <button onClick={() => setViewing(null)} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 transition-colors">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="space-y-8">
                            <div className="flex items-center gap-4">
                                <div className="h-20 w-20 rounded-3xl bg-indigo-50 flex items-center justify-center text-3xl font-black text-indigo-600 ring-4 ring-indigo-50/50">
                                    {getInitial(viewing.name)}
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900">{viewing.name}</h3>
                                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 text-indigo-600 text-xs font-bold rounded-lg mt-1">
                                        <Hash size={12} /> {viewing.supplierCode}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Opening Balance</div>
                                    <div className="text-lg font-bold text-gray-900">${(viewing.openingBalance || 0).toLocaleString()}</div>
                                </div>
                                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Tax ID</div>
                                    <div className="text-lg font-bold text-gray-900">{viewing.vatNumber || 'N/A'}</div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                    <span className="w-8 h-px bg-gray-100"></span>
                                    Contact Details
                                </h4>
                                <div className="space-y-3 px-2">
                                    <div className="flex items-center justify-between text-sm group cursor-pointer">
                                        <span className="text-gray-500">Phone Number</span>
                                        <span className="font-semibold text-gray-800 flex items-center gap-1.5 group-hover:text-indigo-600 transition-colors">
                                            {viewing.phone || 'Not provided'} <Phone size={14} className="opacity-0 group-hover:opacity-100" />
                                        </span>
                                    </div>
                                    <div className="flex items-start justify-between text-sm group cursor-pointer">
                                        <span className="text-gray-500">Address</span>
                                        <span className="font-semibold text-gray-800 text-right max-w-[200px] flex items-start gap-1.5 group-hover:text-indigo-600 transition-colors">
                                            {viewing.address ? `${viewing.address.street}, ${viewing.address.city}, ${viewing.address.country}` : 'No address saved'} <MapPin size={14} className="mt-0.5 opacity-0 group-hover:opacity-100 flex-shrink-0" />
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                    <span className="w-8 h-px bg-gray-100"></span>
                                    Recent Activity
                                </h4>
                                <div className="space-y-3">
                                    {viewing.recentPurchases?.length > 0 ? viewing.recentPurchases.map((p: any) => (
                                        <div key={p.id} className="p-3 bg-white border border-gray-100 rounded-xl hover:shadow-md hover:border-indigo-100 transition-all cursor-pointer">
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="text-sm font-bold text-gray-800">{p.invoiceNo}</span>
                                                <span className="text-xs font-bold text-indigo-600">${p.grandTotal.toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-[10px] text-gray-400 uppercase tracking-tighter">
                                                <span>{format(new Date(p.createdAt), 'MMM dd, yyyy')}</span>
                                                <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-600 rounded-md">{p.status}</span>
                                            </div>
                                        </div>
                                    )) : (
                                        <div className="py-6 text-center text-sm text-gray-400 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                                            No recent purchase history
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="pt-6 border-t border-gray-50 flex gap-3">
                                {canEditSupplier && (
                                    <button
                                        onClick={() => { setEditing(viewing); setViewing(null); setShowForm(true); }}
                                        className="flex-1 py-3 bg-indigo-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-100"
                                    >
                                        <Edit2 size={18} /> Edit Profile
                                    </button>
                                )}
                                <button
                                    onClick={() => setViewing(null)}
                                    className="px-6 py-3 bg-gray-50 text-gray-500 rounded-2xl font-bold hover:bg-gray-100 transition-colors"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
