import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { Plus, Edit2, Trash2, X, Loader2, Search } from 'lucide-react';
import ModuleRefreshButton from '../../components/ModuleRefreshButton';

interface Column {
    key: string;
    label: string;
    render?: (row: any) => React.ReactNode;
}

interface MasterCRUDProps {
    title: string;
    endpoint: string;
    columns: Column[];
    formFields: {
        name: string;
        label: string;
        type?: string;
        required?: boolean;
        defaultValue?: any;
    }[];
    permission?: string;
}

export default function MasterCRUD({ title, endpoint, columns, formFields }: MasterCRUDProps) {
    const [search, setSearch] = useState('');
    const [editing, setEditing] = useState<any>(null);
    const [showForm, setShowForm] = useState(false);
    const qc = useQueryClient();

    const { data: items, isLoading } = useQuery({
        queryKey: [endpoint],
        queryFn: () => api.get(endpoint).then((r) => r.data.data),
    });

    const deleteMut = useMutation({
        mutationFn: (id: string) => api.delete(`${endpoint}/${id}`),
        onSuccess: () => {
            toast.success('Deleted successfully');
            qc.invalidateQueries({ queryKey: [endpoint] });
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed'),
    });

    const saveMut = useMutation({
        mutationFn: (data: any) => data.id ? api.patch(`${endpoint}/${data.id}`, data) : api.post(endpoint, data),
        onSuccess: () => {
            toast.success('Saved successfully');
            qc.invalidateQueries({ queryKey: [endpoint] });
            setShowForm(false);
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed'),
    });

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const data: any = {};
        formFields.forEach(f => {
            const val = fd.get(f.name);
            if (f.type === 'checkbox') data[f.name] = val === 'on';
            else if (f.type === 'number') data[f.name] = Number(val);
            else data[f.name] = val;
        });
        if (editing?.id) data.id = editing.id;
        saveMut.mutate(data);
    };

    const filteredItems = (items || []).filter((i: any) =>
        i.name?.toLowerCase().includes(search.toLowerCase()) ||
        i.code?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
                        <ModuleRefreshButton queryKeys={[[endpoint]]} />
                    </div>
                    <p className="text-sm text-gray-500">Manage your {title.toLowerCase()}</p>
                </div>
                <button
                    onClick={() => { setEditing(null); setShowForm(true); }}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-colors"
                >
                    <Plus size={18} /> Add {title.slice(0, -1)}
                </button>
            </div>

            <div className="relative max-w-md">
                <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search..."
                    className="w-full pl-11 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
            </div>

            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
                        <tr>
                            {columns.map(c => <th key={c.key} className="px-6 py-3">{c.label}</th>)}
                            <th className="px-6 py-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {isLoading ? (
                            <tr><td colSpan={columns.length + 1} className="py-12 text-center text-gray-500"><Loader2 className="animate-spin mx-auto" /> Loading...</td></tr>
                        ) : filteredItems.length === 0 ? (
                            <tr><td colSpan={columns.length + 1} className="py-12 text-center text-gray-500">No items found</td></tr>
                        ) : filteredItems.map((item: any) => (
                            <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                                {columns.map(c => (
                                    <td key={c.key} className="px-6 py-3 text-gray-900">
                                        {c.render ? c.render(item) : item[c.key]}
                                    </td>
                                ))}
                                <td className="px-6 py-3 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <button
                                            onClick={() => { setEditing(item); setShowForm(true); }}
                                            className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (confirm('Are you sure?')) deleteMut.mutate(item.id);
                                            }}
                                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-md transition-colors"
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

            {/* Modal */}
            {showForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-xl animate-scale-in">
                        <div className="flex items-center justify-between mb-5">
                            <h2 className="text-lg font-bold text-gray-900">{editing ? 'Edit' : 'Add'} {title.slice(0, -1)}</h2>
                            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {formFields.map(f => (
                                <div key={f.name}>
                                    <label className="text-xs font-semibold text-gray-700 mb-1.5 block">{f.label}</label>
                                    {f.type === 'checkbox' ? (
                                        <input
                                            type="checkbox"
                                            name={f.name}
                                            defaultChecked={editing?.[f.name] ?? f.defaultValue}
                                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                    ) : (
                                        <input
                                            type={f.type || 'text'}
                                            name={f.name}
                                            defaultValue={editing?.[f.name] ?? f.defaultValue}
                                            required={f.required}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-all"
                                        />
                                    )}
                                </div>
                            ))}
                            <div className="flex gap-3 pt-4">
                                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors">Cancel</button>
                                <button type="submit" disabled={saveMut.isPending} className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50">
                                    {saveMut.isPending ? 'Saving...' : 'Save'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
