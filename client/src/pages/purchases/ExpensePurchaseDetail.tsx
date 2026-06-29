import { useNavigate, useParams } from 'react-router-dom';
import { isCashType, isBankType } from \'../../lib/globalStrings\';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { ArrowLeft, Edit, Trash2, FileText } from 'lucide-react';
import AppLoader from '../../components/ui/AppLoader';
import toast from '@/lib/toast';
import { formatCompanyDate, formatCurrencyAmount, resolveCompanyCurrency } from '../../lib/companySettings';
import { useAuthStore } from '../../stores/authStore';

export default function ExpensePurchaseDetail() {
   const navigate = useNavigate();
   const { id} = useParams<{ id: string }>();
   const company = useAuthStore((s) => s.user?.company);
   const currency = resolveCompanyCurrency(company);

  const { data: expense, isLoading, error } = useQuery({
        queryKey: ['expense-purchase', id],
        queryFn: () => api.get(`/purchases/expense-purchases/${id}`).then(r => r.data.data),
    });

   const handleDelete = async () => {
        if (!confirm('Are you sure you want to delete this expense purchase?')) return;
        
        try {
            await api.delete(`/purchases/expense-purchases/${id}`);
          toast.success('Expense purchase deleted successfully');
            navigate('/purchases/expense');
        } catch (error: any) {
          toast.error(error.response?.data?.message || 'Failed to delete');
        }
    };

    if (isLoading) return <AppLoader />;
    if (error || !expense) return <div className="text-center py-12 text-red-600">Expense purchase not found</div>;

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button
                       onClick={() => navigate('/purchases/expense')}
                     className="p-2 hover:bg-gray-100 rounded-lg"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">Expense Purchase Details</h1>
                        <p className="text-sm text-gray-500 mt-1">
                            {expense.invoiceNo ? `Invoice: ${expense.invoiceNo}` : 'No invoice number'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                       onClick={() => navigate(`/purchases/expense/${id}/edit`)}
                     className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                    >
                        <Edit size={16} />
                        Edit
                    </button>
                    <button
                       onClick={handleDelete}
                     className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium"
                    >
                        <Trash2 size={16} />
                        Delete
                    </button>
                </div>
            </div>

            {/* Status Badge */}
            <div className="flex items-center gap-3">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                   expense.status === 'PAID' ? 'bg-green-100 text-green-800' :
                   expense.status === 'POSTED' ? 'bg-blue-100 text-blue-800' :
                    'bg-gray-100 text-gray-800'
                }`}>
                    {expense.status}
                </span>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                   isCashType(expense.paymentMethod || '') ? 'bg-green-100 text-green-800' :
                   isBankType(expense.paymentMethod || '') ? 'bg-blue-100 text-blue-800' :
                    'bg-yellow-100 text-yellow-800'
                }`}>
                    {expense.paymentMethod}
                </span>
            </div>

            {/* Main Info Card */}
            <div className="bg-white rounded-lg shadow divide-y">
                <div className="p-6">
                    <h2 className="text-lg font-semibold text-gray-800 mb-4">Basic Information</h2>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
                        <div>
                            <dt className="text-sm font-medium text-gray-500">Vendor Name</dt>
                            <dd className="mt-1 text-base font-semibold text-gray-900">{expense.vendorName}</dd>
                        </div>
                        <div>
                            <dt className="text-sm font-medium text-gray-500">Invoice Number</dt>
                            <dd className="mt-1 text-base text-gray-900">{expense.invoiceNo || '-'}</dd>
                        </div>
                        <div>
                            <dt className="text-sm font-medium text-gray-500">Date</dt>
                            <dd className="mt-1 text-base text-gray-900">
                                {formatCompanyDate(expense.date, company)}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-sm font-medium text-gray-500">Branch</dt>
                            <dd className="mt-1 text-base text-gray-900">{expense.branch.name}</dd>
                        </div>
                        <div>
                            <dt className="text-sm font-medium text-gray-500">Payment Method</dt>
                            <dd className="mt-1 text-base text-gray-900">{expense.paymentMethod}</dd>
                        </div>
                        <div>
                            <dt className="text-sm font-medium text-gray-500">Created By</dt>
                            <dd className="mt-1 text-base text-gray-900">{expense.createdBy.name}</dd>
                        </div>
                        {expense.notes && (
                            <div className="col-span-2">
                                <dt className="text-sm font-medium text-gray-500">Notes</dt>
                                <dd className="mt-1 text-base text-gray-900 whitespace-pre-wrap">{expense.notes}</dd>
                            </div>
                        )}
                    </dl>
                </div>

                {/* Items Section */}
                <div className="p-6">
                    <h2 className="text-lg font-semibold text-gray-800 mb-4">Expense Items</h2>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Account</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {expense.items.map((item: any, index: number) => (
                                    <tr key={item.id}>
                                        <td className="px-4 py-3 text-sm text-gray-900">{index + 1}</td>
                                        <td className="px-4 py-3 text-sm text-gray-900">{item.description}</td>
                                        <td className="px-4 py-3 text-sm text-gray-500">
                                            {item.expenseAccount?.name || 'Account ID: ' + item.expenseAccountId}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-right text-gray-900">
                                            {formatCurrencyAmount(Number(item.amount || 0), currency)}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-right text-gray-900">
                                            {item.quantity}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                                            {formatCurrencyAmount(Number(item.amount * item.quantity || 0), currency)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-gray-50">
                                <tr>
                                    <td colSpan={5} className="px-4 py-3 text-right text-sm font-medium text-gray-900">
                                        Total Amount:
                                    </td>
                                    <td className="px-4 py-3 text-right text-lg font-bold text-gray-900">
                                        {formatCurrencyAmount(Number(expense.totalAmount || 0), currency)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>

                {/* Journal Entry Link */}
                {expense.journalEntry && (
                    <div className="p-6 bg-blue-50">
                        <div className="flex items-center gap-2 text-blue-900">
                            <FileText size={20} />
                            <h2 className="text-lg font-semibold">Accounting Entry</h2>
                        </div>
                        <p className="mt-2 text-sm text-blue-700">
                            Journal Entry No: <span className="font-semibold">{expense.journalEntry.entryNo}</span>
                        </p>
                        <button
                          onClick={() => navigate(`/accounting/journal-entries/${expense.journalEntry.id}`)}
                         className="mt-3 text-sm text-blue-600 hover:text-blue-800 font-medium"
                        >
                            View Journal Entry →
                        </button>
                    </div>
                )}
            </div>

            {/* Metadata */}
            <div className="text-xs text-gray-500 space-y-1">
                <p>Created: {new Date(expense.createdAt).toLocaleString()}</p>
                <p>Last Updated: {new Date(expense.updatedAt).toLocaleString()}</p>
            </div>
        </div>
    );
}
