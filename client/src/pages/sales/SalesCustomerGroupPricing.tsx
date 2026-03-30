import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save, Search, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import ModuleRefreshButton from '../../components/ModuleRefreshButton';

type PriceGroup = {
    id: string;
    name: string;
    code?: string | null;
    isDefault: boolean;
    _count?: { customers: number; productPriceGroups: number };
};

export default function SalesCustomerGroupPricing() {
    const queryClient = useQueryClient();
    const [selectedGroupId, setSelectedGroupId] = useState('');
    const [groupSearch, setGroupSearch] = useState('');
    const [customerSearch, setCustomerSearch] = useState('');
    const [assignedCustomers, setAssignedCustomers] = useState<string[]>([]);

    const { data: groups = [], isLoading: groupsLoading } = useQuery<PriceGroup[]>({
        queryKey: ['sales-pricing-groups'],
        queryFn: () => api.get('/sales/pricing/price-groups').then((r) => r.data.data),
    });

    const { data: customersResp } = useQuery({
        queryKey: ['sales-pricing-customers', customerSearch],
        queryFn: () => api.get('/sales/pricing/customers', {
            params: { page: 1, limit: 300, search: customerSearch || undefined },
        }).then((r) => r.data),
    });
    const customers = customersResp?.data || [];

    const selectedGroup = groups.find((g) => g.id === selectedGroupId) || null;

    const filteredGroups = useMemo(() => {
        const key = groupSearch.trim().toLowerCase();
        if (!key) return groups;
        return groups.filter((g) => `${g.name} ${g.code || ''}`.toLowerCase().includes(key));
    }, [groups, groupSearch]);

    useEffect(() => {
        if (!selectedGroupId && groups.length > 0) setSelectedGroupId(groups[0].id);
    }, [groups, selectedGroupId]);

    useEffect(() => {
        if (!selectedGroupId) {
            setAssignedCustomers([]);
            return;
        }
        const ids = customers.filter((c: any) => c.priceGroupId === selectedGroupId).map((c: any) => c.id);
        setAssignedCustomers(ids);
    }, [customers, selectedGroupId]);

    const saveMut = useMutation({
        mutationFn: () => api.put(`/sales/pricing/price-groups/${selectedGroupId}/customers`, { customerIds: assignedCustomers }),
        onSuccess: () => {
            toast.success('Customer pricing assignments updated');
            queryClient.invalidateQueries({ queryKey: ['sales-pricing-customers'] });
            queryClient.invalidateQueries({ queryKey: ['sales-pricing-groups'] });
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to save assignments'),
    });

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold text-gray-900">Customer Group Pricing</h1>
                        <ModuleRefreshButton queryKeys={[["sales-pricing-groups"], ["sales-pricing-customers"]]} />
                    </div>
                    <p className="text-sm text-gray-500">Assign customers to price lists</p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                <aside className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 xl:col-span-4">
                    <div className="relative">
                        <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
                        <input
                            value={groupSearch}
                            onChange={(e) => setGroupSearch(e.target.value)}
                            placeholder="Search price lists..."
                            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm"
                        />
                    </div>

                    {groupsLoading ? (
                        <div className="py-10 text-center text-sm text-gray-500">Loading...</div>
                    ) : filteredGroups.length === 0 ? (
                        <div className="py-10 text-center text-sm text-gray-500">No price lists found</div>
                    ) : (
                        <div className="space-y-2">
                            {filteredGroups.map((group) => (
                                <button
                                    key={group.id}
                                    type="button"
                                    onClick={() => setSelectedGroupId(group.id)}
                                    className={`w-full rounded-lg border p-3 text-left ${selectedGroupId === group.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}
                                >
                                    <p className="text-sm font-semibold text-gray-900">{group.name}</p>
                                    <p className="text-xs text-gray-500">{group.code || 'NO-CODE'} · {group._count?.customers || 0} customers</p>
                                </button>
                            ))}
                        </div>
                    )}
                </aside>

                <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 xl:col-span-8">
                    {!selectedGroup ? (
                        <div className="py-20 text-center text-sm text-gray-500">Select a price list</div>
                    ) : (
                        <>
                            <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-3">
                                <div>
                                    <h2 className="text-lg font-semibold text-gray-900">{selectedGroup.name}</h2>
                                    <p className="text-xs text-gray-500">{selectedGroup.code || 'NO-CODE'} · {selectedGroup.isDefault ? 'Default' : 'Non-default'}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => saveMut.mutate()}
                                    disabled={saveMut.isPending}
                                    className="inline-flex items-center gap-2 rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                                >
                                    {saveMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Assignments
                                </button>
                            </div>

                            <div className="relative">
                                <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
                                <input
                                    value={customerSearch}
                                    onChange={(e) => setCustomerSearch(e.target.value)}
                                    placeholder="Search customers..."
                                    className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm"
                                />
                            </div>

                            <div className="max-h-[560px] space-y-2 overflow-y-auto">
                                {customers.map((c: any) => (
                                    <label key={c.id} className="flex items-center justify-between gap-2 rounded border border-gray-100 px-3 py-2 text-sm hover:bg-gray-50">
                                        <div>
                                            <p className="font-medium text-gray-900">{c.name}</p>
                                            <p className="text-xs text-gray-500">{c.customerCode || '-'} {c.phone ? `· ${c.phone}` : ''}</p>
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={assignedCustomers.includes(c.id)}
                                            onChange={(e) => {
                                                setAssignedCustomers((prev) =>
                                                    e.target.checked
                                                        ? Array.from(new Set([...prev, c.id]))
                                                        : prev.filter((id) => id !== c.id)
                                                ); }}
                                        />
                                    </label>
                                ))}
                                {customers.length === 0 && (
                                    <div className="py-10 text-center text-sm text-gray-500">No customers found</div>
                                )}
                            </div>

                            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-700">
                                <Users size={14} className="mb-1" />
                                Assigning a customer to this price list will remove it from any previously assigned list.
                            </div>
                        </>
                    )}
                </section>
            </div>
        </div>
    );
}
