import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { Plus, Edit2, Trash2, Search, Filter, Loader2, Package, Layout } from 'lucide-react';
import ModuleRefreshButton from '../../components/ModuleRefreshButton';
import Pagination from '../../components/ui/Pagination';
import AppDropdown from '../../components/ui/AppDropdown';
import { useAuthStore } from '../../stores/authStore';

export default function ItemsList() {
    const navigate = useNavigate();
    const { hasPermission } = useAuthStore();
    const canEditItem = hasPermission('product.edit') || hasPermission('product.editItem');
    const [searchInput, setSearchInput] = useState('');
    const [querySearch, setQuerySearch] = useState('');
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const qc = useQueryClient();
    const storageKey = 'items-list-saved-filters-v1';

    // Filters
    const [filters, setFilters] = useState({
        categoryId: '',
        itemGroupId: '',
        brandId: '',
        status: '',
        sortBy: 'createdAt',
        sortOrder: 'desc' as 'asc' | 'desc',
    });
    const [queryFilters, setQueryFilters] = useState(filters);

    // Fetch Meta for filters
    const { data: cats } = useQuery({ queryKey: ['categories'], queryFn: () => api.get('/products/meta/categories').then(r => r.data.data) });
    const { data: groups } = useQuery({ queryKey: ['groups'], queryFn: () => api.get('/products/meta/groups').then(r => r.data.data) });
    const { data: brands } = useQuery({ queryKey: ['brands'], queryFn: () => api.get('/products/meta/brands').then(r => r.data.data) });

    const { data, isLoading, isError, error, isFetching } = useQuery({
        queryKey: ['products', querySearch, page, limit, queryFilters],
        queryFn: () => {
            const params: Record<string, any> = {
                page,
                limit,
                sortBy: queryFilters.sortBy,
                sortOrder: queryFilters.sortOrder,
            };
            if (querySearch.trim()) params.search = querySearch.trim();
            if (queryFilters.categoryId) params.categoryId = queryFilters.categoryId;
            if (queryFilters.itemGroupId) params.itemGroupId = queryFilters.itemGroupId;
            if (queryFilters.brandId) params.brandId = queryFilters.brandId;
            if (queryFilters.status) params.status = queryFilters.status;
            return api.get('/products', { params }).then((r) => r.data);
        },
        retry: 1,
    });
    const pagination = data?.meta?.pagination;

    useEffect(() => {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return;
        try {
            const parsed = JSON.parse(raw);
            if (parsed?.filters) {
                setFilters(parsed.filters);
                setQueryFilters(parsed.filters);
            }
            if (typeof parsed?.search === 'string') {
                setSearchInput(parsed.search);
                setQuerySearch(parsed.search);
            }
        } catch { }
    }, []);

    const canSaveCurrentFilter = useMemo(() => Boolean(
        searchInput.trim() ||
        filters.categoryId ||
        filters.itemGroupId ||
        filters.brandId ||
        filters.status ||
        filters.sortBy !== 'createdAt' ||
        filters.sortOrder !== 'desc'
    ), [searchInput, filters]);

    const applyFilters = () => {
        setPage(1);
        setQuerySearch(searchInput);
        setQueryFilters(filters);
    };

    const saveCurrentFilter = () => {
        localStorage.setItem(storageKey, JSON.stringify({ search: searchInput, filters }));
        toast.success('Items filter saved');
    };

    const clearSavedFilter = () => {
        localStorage.removeItem(storageKey);
        toast.success('Saved filter cleared');
    };



    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold text-gray-900">Items</h1>
                        <ModuleRefreshButton queryKeys={[['products'], ['categories'], ['groups'], ['brands']]} />
                    </div>
                    <p className="text-sm text-gray-500">Manage products and services</p>
                </div>
                <button
                    onClick={() => navigate('/items/new')}
                    disabled={!canEditItem}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Plus size={18} /> Add Item
                </button>
            </div>

            {/* Controls */}
            <div className="flex flex-col lg:flex-row gap-4">
                <div className="relative flex-1">
                    <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') applyFilters(); }}
                        placeholder="Search by code, name, barcode..."
                        className="w-full pl-11 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    />
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                    <AppDropdown
                        value={filters.categoryId}
                        onChange={(v) => setFilters(prev => ({ ...prev, categoryId: v }))}
                        options={[{ value: '', label: 'All Categories' }, ...(cats || []).map((c: any) => ({ value: c.id, label: c.name }))]}
                        placeholder="All Categories"
                        searchable
                    />
                    <AppDropdown
                        value={filters.itemGroupId}
                        onChange={(v) => setFilters(prev => ({ ...prev, itemGroupId: v }))}
                        options={[{ value: '', label: 'All Groups' }, ...(groups || []).map((g: any) => ({ value: g.id, label: g.name }))]}
                        placeholder="All Groups"
                        searchable
                    />
                    <AppDropdown
                        value={filters.brandId}
                        onChange={(v) => setFilters(prev => ({ ...prev, brandId: v }))}
                        options={[{ value: '', label: 'All Brands' }, ...(brands || []).map((b: any) => ({ value: b.id, label: b.name }))]}
                        placeholder="All Brands"
                        searchable
                    />
                    <AppDropdown
                        value={filters.status}
                        onChange={(v) => setFilters(prev => ({ ...prev, status: v }))}
                        options={[{ value: '', label: 'All Status' }, { value: 'ACTIVE', label: 'Active' }, { value: 'INACTIVE', label: 'Inactive' }]}
                        placeholder="All Status"
                    />
                    <AppDropdown
                        value={filters.sortBy}
                        onChange={(v) => setFilters(prev => ({ ...prev, sortBy: v }))}
                        options={[{ value: 'createdAt', label: 'Sort: Created' }, { value: 'updatedAt', label: 'Sort: Updated' }, { value: 'name', label: 'Sort: Name' }, { value: 'itemCode', label: 'Sort: Item Code' }, { value: 'status', label: 'Sort: Status' }]}
                        placeholder="Sort By"
                    />
                    <AppDropdown
                        value={filters.sortOrder}
                        onChange={(v) => setFilters(prev => ({ ...prev, sortOrder: v as 'asc' | 'desc' }))}
                        options={[{ value: 'desc', label: 'Desc' }, { value: 'asc', label: 'Asc' }]}
                        placeholder="Order"
                    />
                    <button
                        type="button"
                        onClick={applyFilters}
                        className="px-3 py-2 border border-blue-300 rounded-lg text-sm bg-blue-50 hover:bg-blue-100 text-blue-700"
                    >
                        Apply
                    </button>
                    <button
                        type="button"
                        onClick={saveCurrentFilter}
                        disabled={!canSaveCurrentFilter}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white hover:bg-gray-50 text-gray-700 disabled:opacity-50"
                    >
                        Save Filter
                    </button>
                    <button
                        type="button"
                        onClick={clearSavedFilter}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white hover:bg-gray-50 text-gray-700"
                    >
                        Clear Saved
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setSearchInput('');
                            setQuerySearch('');
                            setPage(1);
                            const reset = { categoryId: '', itemGroupId: '', brandId: '', status: '', sortBy: 'createdAt', sortOrder: 'desc' as const };
                            setFilters(reset);
                            setQueryFilters(reset);
                        }}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white hover:bg-gray-50 text-gray-700"
                    >
                        Clear
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm relative min-h-[400px]">
                {(isLoading || isFetching) && (
                    <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-10 flex flex-col items-center justify-center text-blue-600">
                        <Loader2 size={40} className="animate-spin mb-3" />
                        <span className="text-sm font-bold animate-pulse">Loading items...</span>
                    </div>
                )}

                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
                        <tr>
                            <th className="px-6 py-3">Code/Name</th>
                            <th className="px-6 py-3">Group/Category</th>
                            <th className="px-6 py-3">Brand</th>
                            <th className="px-6 py-3">Default Unit</th>
                            <th className="px-6 py-3">Status</th>
                            <th className="px-6 py-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {isLoading && !isFetching ? (
                            <tr><td colSpan={6} className="py-12 h-16" /></tr>
                        ) : isError ? (
                            <tr>
                                <td colSpan={6} className="py-12 text-center text-red-600">
                                    {(error as any)?.response?.data?.error?.message || 'Failed to load items'}
                                </td>
                            </tr>
                        ) : (data?.data || []).length === 0 ? (
                            <tr><td colSpan={6} className="py-12 text-center text-gray-500">No items found</td></tr>
                        ) : (data?.data || []).map((item: any) => {
                            const defaultUnit = item.units?.[0];
                            return (
                                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded bg-blue-50 flex items-center justify-center text-blue-600">
                                                <Package size={18} />
                                            </div>
                                            <div onClick={() => navigate(`/items/${item.id}`)} className="cursor-pointer hover:opacity-70 transition-opacity">
                                                <p className="font-medium text-gray-900">{item.name}</p>
                                                <p className="text-xs font-mono text-gray-500">{item.itemCode}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-3">
                                        <div className="text-gray-900">{item.itemGroup?.name || '-'}</div>
                                        <div className="text-xs text-gray-500">{item.category?.name}</div>
                                    </td>
                                    <td className="px-6 py-3 text-gray-600">{item.brand?.name || '-'}</td>
                                    <td className="px-6 py-3">
                                        {defaultUnit ? (
                                            <div>
                                                <span className="font-medium text-gray-900">{defaultUnit.unitName}</span>
                                                <span className="text-xs text-gray-500 block">
                                                    SAR {Number(defaultUnit.salePrice).toFixed(2)}
                                                </span>
                                            </div>
                                        ) : <span className="text-gray-400">-</span>}
                                    </td>
                                    <td className="px-6 py-3">
                                        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${item.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                                            }`}>
                                            {item.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-3 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => navigate(`/items/${item.id}`)}
                                                className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                                                title="View Profile"
                                            >
                                                <Layout size={16} />
                                            </button>
                                            <button
                                                onClick={() => navigate(`/items/${item.id}/edit`)}
                                                disabled={!canEditItem}
                                                className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                title="Edit"
                                            >
                                                <Edit2 size={16} />
                                            </button>

                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {/* Pagination */}
                {pagination && (
                    <Pagination
                        currentPage={page}
                        totalPages={pagination.totalPages}
                        totalItems={pagination.total || 0}
                        itemsPerPage={limit}
                        onPageChange={setPage}
                        onItemsPerPageChange={setLimit}
                        isLoading={isFetching}
                    />
                )}
            </div>
        </div>
    );
}
