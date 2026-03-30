import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Package } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import api from '../lib/api';
import {
    Badge,
    Button,
    Card,
    FilterBar,
    PageHeader,
    PageLayout,
    SearchInput,
    Select,
    Table,
    TableBody,
    TableCell,
    TableEmpty,
    TableHead,
    TableHeader,
    TableLoading,
    TableRow,
} from '../components/ui';

const numberFormatter = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

type BranchOption = {
    id: string;
    name: string;
};

export default function Inventory() {
    const [search, setSearch] = useState('');
    const [lowStock, setLowStock] = useState(false);
    const [branchFilter, setBranchFilter] = useState('');
    const branches = (useAuthStore((s) => s.user?.branches) || []) as BranchOption[];

    const { data: stockData, isLoading: stockLoading } = useQuery({
        queryKey: ['inventory-stock', branchFilter, lowStock],
        queryFn: () =>
            api
                .get('/inventory/stock', {
                    params: {
                        branchId: branchFilter || undefined,
                        lowStock: lowStock || undefined,
                        limit: 100,
                    },
                })
                .then((r) => r.data),
    });

    const stockRows = (stockData?.data || []) as any[];
    const filteredStock = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) {
            return stockRows;
        }

        return stockRows.filter((item) => {
            const haystack = [
                item.product?.name,
                item.product?.itemCode,
                item.branch?.name,
                item.unitCode,
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();

            return haystack.includes(term);
        });
    }, [search, stockRows]);

    return (
        <PageLayout className="gap-6">
            <PageHeader
                title="Inventory"
                subtitle="Track stock across branches and spot replenishment risks quickly."
            />

            <FilterBar>
                <div className="min-w-[240px] flex-1">
                    <SearchInput
                        value={search}
                        onChange={setSearch}
                        placeholder="Search products, codes, or branches"
                    />
                </div>
                <Select
                    value={branchFilter}
                    onChange={(e) => setBranchFilter(e.target.value)}
                    options={[
                        { value: '', label: 'All Branches' },
                        ...branches.map((branch) => ({
                            value: branch.id,
                            label: branch.name,
                        })),
                    ]}
                    placeholder=""
                    className="min-w-[220px]"
                />
                <Button
                    type="button"
                    variant={lowStock ? 'danger' : 'outline'}
                    icon={<AlertTriangle size={16} />}
                    onClick={() => setLowStock((current) => !current)}
                    aria-pressed={lowStock}
                >
                    Low Stock Only
                </Button>
            </FilterBar>

            <Card padding="none">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Product</TableHead>
                            <TableHead>Branch</TableHead>
                            <TableHead>Unit</TableHead>
                            <TableHead>Qty on Hand</TableHead>
                            <TableHead align="right">Avg Cost</TableHead>
                            <TableHead align="right">Value</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {stockLoading ? (
                            <TableLoading colSpan={6} message="Loading inventory..." />
                        ) : filteredStock.length === 0 ? (
                            <TableEmpty
                                colSpan={6}
                                message={
                                    search || branchFilter || lowStock
                                        ? 'No stock rows match the current filters.'
                                        : 'No stock records are available yet.'
                                }
                                icon={<Package size={40} className="text-text-tertiary" />}
                            />
                        ) : (
                            filteredStock.map((item) => {
                                const qty = Number(item.qtyOnHand || 0);
                                const avgCost = Number(item.avgCost || 0);
                                const isLow = qty <= 10 && qty > 0;

                                return (
                                    <TableRow key={item.id}>
                                        <TableCell>
                                            <div>
                                                <p className="text-sm font-semibold text-text-primary">
                                                    {item.product?.name || 'Unnamed Product'}
                                                </p>
                                                <p className="text-xs font-mono text-text-tertiary">
                                                    {item.product?.itemCode || 'No code'}
                                                </p>
                                            </div>
                                        </TableCell>
                                        <TableCell>{item.branch?.name || '-'}</TableCell>
                                        <TableCell>{item.unitCode || '-'}</TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <span
                                                    className={
                                                        isLow
                                                            ? 'text-sm font-semibold text-danger'
                                                            : 'text-sm font-semibold text-text-primary'
                                                    }
                                                >
                                                    {qty.toLocaleString()}
                                                </span>
                                                {isLow && (
                                                    <Badge variant="danger" size="sm">
                                                        Low
                                                    </Badge>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell align="right">
                                            {numberFormatter.format(avgCost)}
                                        </TableCell>
                                        <TableCell align="right" className="font-medium text-text-primary">
                                            {numberFormatter.format(qty * avgCost)}
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>
            </Card>
        </PageLayout>
    );
}
