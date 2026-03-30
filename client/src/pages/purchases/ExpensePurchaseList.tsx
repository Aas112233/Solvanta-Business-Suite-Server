import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { Plus, Trash2, Edit, Eye, Loader2 } from 'lucide-react';
import AppLoader from '../../components/ui/AppLoader';
import Pagination from '../../components/ui/Pagination';

interface ExpensePurchase {
    id: string;
    vendorName: string;
    invoiceNo?: string;
    totalAmount: number;
    paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'BANK' | 'CREDIT';
    status: 'DRAFT' | 'POSTED' | 'PAID';
    branch: { id: string; name: string };
    createdBy: { id: string; name: string };
    _count: { items: number };
    createdAt: string;
}

export default function ExpensePurchaseList() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [page, setPage] = useState(1);
    const limit = 20;

    const { data, isLoading, refetch } = useQuery({
        queryKey: ['expense-purchases', page],
        queryFn: () => api.get('/purchases/expense-purchases', {
            params: { page, limit }
        }).then(r => r.data),
    });

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this expense purchase?')) return;
        
        try {
            await api.delete(`/purchases/expense-purchases/${id}`);
           toast.success('Expense purchase deleted successfully');
            queryClient.invalidateQueries({ queryKey: ['expense-purchases'] });
        } catch (error: any) {
           toast.error(error.response?.data?.message || 'Failed to delete');
        }
    };

    const columns = [
        {
            header: 'Date',
            accessorKey: 'createdAt',
            cell: ({ row }: any) => new Date(row.original.createdAt).toLocaleDateString(),
        },
        {
            header: 'Invoice No',
            accessorKey: 'invoiceNo',
            cell: ({ row }: any) => row.original.invoiceNo || '-',
        },
        {
            header: 'Vendor',
            accessorKey: 'vendorName',
        },
        {
            header: 'Branch',
            accessorKey: 'branch',
            cell: ({ row }: any) => row.original.branch.name,
        },
        {
            header: 'Payment Method',
            accessorKey: 'paymentMethod',
            cell: ({ row }: any) => {
                const colors: any = {
                    CASH: 'bg-green-100 text-green-800',
                    BANK: 'bg-blue-100 text-blue-800',
                    BANK_TRANSFER: 'bg-blue-100 text-blue-800',
                    CREDIT: 'bg-yellow-100 text-yellow-800',
                };
                return (
                    <span className={`px-2 py-1 rounded text-xs font-medium ${colors[row.original.paymentMethod]}`}>
                        {row.original.paymentMethod}
                    </span>
                );
            },
        },
        {
            header: 'Status',
            accessorKey: 'status',
            cell: ({ row }: any) => {
                const colors: any = {
                    DRAFT: 'bg-gray-100 text-gray-800',
                    POSTED: 'bg-blue-100 text-blue-800',
                    PAID: 'bg-green-100 text-green-800',
                };
                return (
                    <span className={`px-2 py-1 rounded text-xs font-medium ${colors[row.original.status]}`}>
                        {row.original.status}
                    </span>
                );
            },
        },
        {
            header: 'Amount',
            accessorKey: 'totalAmount',
            cell: ({ row }: any) => `SAR ${Number(row.original.totalAmount).toFixed(2)}`,
        },
        {
            header: 'Items',
            accessorKey: '_count.items',
        },
        {
            header: 'Actions',
            cell: ({ row }: any) => (
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => navigate(`/purchases/expense/${row.original.id}`)}
                        className="p-1 hover:bg-gray-100 rounded"
                        title="View"
                    >
                        <Eye size={16} />
                    </button>
                    <button
                        onClick={() => navigate(`/purchases/expense/${row.original.id}/edit`)}
                        className="p-1 hover:bg-gray-100 rounded"
                        title="Edit"
                    >
                        <Edit size={16} />
                    </button>
                    <button
                        onClick={() => handleDelete(row.original.id)}
                        className="p-1 hover:bg-red-50 text-red-600 rounded"
                        title="Delete"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            ),
        },
    ];

    if (isLoading) return <AppLoader />;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Expense Purchases</h1>
                    <p className="text-sm text-gray-500 mt-1">Track non-stock purchases and expenses</p>
                </div>
                <button
                    onClick={() => navigate('/purchases/expense/new')}
                   className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
                >
                    <Plus size={18} />
                    New Expense Purchase
                </button>
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice No</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vendor</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Branch</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payment Method</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Items</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {(data?.data || []).map((expense: any) => (
                                <tr key={expense.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/purchases/expense/${expense.id}`)}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {new Date(expense.createdAt).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {expense.invoiceNo || '-'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {expense.vendorName}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {expense.branch.name}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                                            expense.paymentMethod === 'CASH' ? 'bg-green-100 text-green-800' :
                                            expense.paymentMethod === 'BANK' || expense.paymentMethod === 'BANK_TRANSFER' ? 'bg-blue-100 text-blue-800' :
                                            'bg-yellow-100 text-yellow-800'
                                        }`}>
                                            {expense.paymentMethod}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                                            expense.status === 'DRAFT' ? 'bg-gray-100 text-gray-800' :
                                            expense.status === 'POSTED' ? 'bg-blue-100 text-blue-800' :
                                            'bg-green-100 text-green-800'
                                        }`}>
                                            {expense.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        SAR {Number(expense.totalAmount).toFixed(2)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {expense._count.items}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); navigate(`/purchases/expense/${expense.id}`); }}
                                                className="text-blue-600 hover:text-blue-900"
                                                title="View"
                                            >
                                                <Eye size={16} />
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); navigate(`/purchases/expense/${expense.id}/edit`); }}
                                                className="text-gray-600 hover:text-gray-900"
                                                title="Edit"
                                            >
                                                <Edit size={16} />
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleDelete(expense.id); }}
                                                className="text-red-600 hover:text-red-900"
                                                title="Delete"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {data?.pagination && (
                    <Pagination
                       currentPage={page}
                      totalPages={Math.ceil(data.pagination.total / limit)}
                      totalItems={data.pagination.total}
                       itemsPerPage={limit}
                      onPageChange={setPage}
                      onItemsPerPageChange={() => {}}
                   />
               )}
            </div>
        </div>
    );
}
