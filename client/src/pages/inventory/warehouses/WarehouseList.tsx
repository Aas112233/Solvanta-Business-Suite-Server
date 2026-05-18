import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import api from '../../../lib/api';
import {
    Warehouse,
    Plus,
    Search,
    MapPin,
    Phone,
    MoreVertical,
    Edit2,
    Trash2,
    Loader2,
    BarChart3
} from 'lucide-react';
import toast from '@/lib/toast';
import WarehouseFormModal from '../../../components/inventory/WarehouseFormModal';
import ModuleRefreshButton from '../../../components/ModuleRefreshButton';

import { useNavigate, Link } from 'react-router-dom';

export default function WarehouseList() {
    const navigate = useNavigate();
    const [search, setSearch] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedWarehouse, setSelectedWarehouse] = useState<any>(null);

    const { data: warehouses, isLoading, refetch } = useQuery({
        queryKey: ['warehouses'],
        queryFn: () => api.get('/branches', { params: { includeInactive: 'true' } }).then(r => r.data.data)
    });

    const filteredWarehouses = warehouses?.filter((w: any) =>
        w.name.toLowerCase().includes(search.toLowerCase()) ||
        w.code.toLowerCase().includes(search.toLowerCase())
    );

    const handleEdit = (warehouse: any) => {
        setSelectedWarehouse(warehouse);
        setIsModalOpen(true);
    };

    const handleAddNew = () => {
        setSelectedWarehouse(null);
        setIsModalOpen(true);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this warehouse?')) return;
        try {
            await api.delete(`/branches/${id}`);
            toast.success('Warehouse deleted successfully');
            refetch();
        } catch (error: any) {
            toast.error(error.response?.data?.error?.message || 'Failed to delete warehouse');
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold text-gray-900">Warehouses</h1>
                        <ModuleRefreshButton queryKeys={[['warehouses']]} />
                    </div>
                    <p className="text-sm text-gray-500">Manage your storage locations and branches</p>
                </div>
                <button
                    onClick={handleAddNew}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm text-sm font-medium"
                >
                    <Plus size={18} />
                    Add Warehouse
                </button>
            </div>

            <div className="flex items-center gap-3 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <Search className="text-gray-400" size={20} />
                <input
                    type="text"
                    placeholder="Search warehouses..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="flex-1 bg-transparent border-none focus:ring-0 text-sm"
                />
            </div>

            {isLoading ? (
                <div className="flex flex-center justify-center py-20">
                    <Loader2 size={32} className="animate-spin text-blue-500" />
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredWarehouses?.map((warehouse: any) => (
                        <div
                            key={warehouse.id}
                            className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow group"
                        >
                            <div className="p-5">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                                            <Warehouse size={24} />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-gray-900">{warehouse.name}</h3>
                                            <span className="text-xs font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                                {warehouse.code}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => handleEdit(warehouse)}
                                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                            title="Edit"
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(warehouse.id)}
                                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                            title="Delete"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>

                                <div className="mt-6 space-y-3">
                                    <div className="flex items-start gap-3 text-sm text-gray-600">
                                        <MapPin size={16} className="mt-0.5 text-gray-400" />
                                        <span className="line-clamp-2">{warehouse.address || 'No address provided'}</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-sm text-gray-600">
                                        <Phone size={16} className="text-gray-400" />
                                        <span>{warehouse.phone || 'No phone provided'}</span>
                                    </div>
                                </div>

                                <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${warehouse.isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
                                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            {warehouse.isActive ? 'Active' : 'Inactive'}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => navigate(`/inventory/stock?branchId=${warehouse.id}`)}
                                        className="text-xs font-semibold text-blue-600 hover:text-blue-700 uppercase tracking-wider"
                                    >
                                        View Stock
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {isModalOpen && (
                <WarehouseFormModal
                    warehouse={selectedWarehouse}
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    onSuccess={() => {
                        setIsModalOpen(false);
                        refetch();
                    }}
                />
            )}
        </div>
    );
}
