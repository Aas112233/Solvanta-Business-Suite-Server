# Migration Guide - Unified Design System

## SOLVANTA Business Suite - UI Modernization

This guide helps you migrate existing pages to use the new unified design system components.

---

## Quick Start

### 1. Import Design System Components

```tsx
// Instead of multiple imports
import Button from '../components/ui/Button';
import Table from '../components/ui/Table';
import Card from '../components/ui/Card';

// Use the centralized export
import {
    Button,
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
    Card,
    PageHeader,
    Badge,
} from '@/components/ui';
```

---

## Component Migration Examples

### Button Migration

#### ❌ Before (Inconsistent Styles)
```tsx
// Inline styles
<button
    onClick={handleSave}
    className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm text-white bg-gradient-brand transition-all hover:opacity-90 shadow-lg shadow-brand-500/20"
>
    <Plus size={18} /> Add Customer
</button>

// Another style
<button className="px-3 py-2 bg-blue-500 text-white rounded">
    Save
</button>
```

#### ✅ After (Unified Button)
```tsx
import { Button } from '@/components/ui';
import { Plus } from 'lucide-react';

// Primary action
<Button 
    variant="primary" 
    size="md"
    icon={<Plus size={16} />}
    onClick={handleSave}
>
    Add Customer
</Button>

// Secondary action
<Button variant="secondary" onClick={handleCancel}>
    Cancel
</Button>

// Danger action
<Button variant="danger" icon={<Trash size={16} />}>
    Delete
</Button>

// Loading state
<Button variant="primary" loading>
    Saving...
</Button>
```

---

### Table Migration

#### ❌ Before (Custom Table Each Page)
```tsx
<div className="rounded-xl overflow-hidden" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
    <table className="w-full min-w-[900px]">
        <thead>
            <tr style={{ background: 'var(--color-bg-tertiary)' }}>
                <th className="text-left px-5 py-3.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                    Code
                </th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                    Name
                </th>
            </tr>
        </thead>
        <tbody>
            {customers.map(customer => (
                <tr key={customer.id}>
                    <td className="px-5 py-4">{customer.code}</td>
                    <td className="px-5 py-4">{customer.name}</td>
                </tr>
            ))}
        </tbody>
    </table>
</div>
```

#### ✅ After (Unified Table)
```tsx
import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
    TableLoading,
    TableEmpty,
} from '@/components/ui';

<Card>
    <Table>
        <TableHeader>
            <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead align="right">Actions</TableHead>
            </TableRow>
        </TableHeader>
        <TableBody>
            {isLoading ? (
                <TableLoading colSpan={3} message="Loading customers..." />
            ) : customers.length === 0 ? (
                <TableEmpty colSpan={3} message="No customers found" />
            ) : (
                customers.map(customer => (
                    <TableRow key={customer.id}>
                        <TableCell>{customer.code}</TableCell>
                        <TableCell>{customer.name}</TableCell>
                        <TableCell align="right">
                            <ActionButton icon={<Edit size={16} />} onClick={() => handleEdit(customer)} />
                        </TableCell>
                    </TableRow>
                ))
            )}
        </TableBody>
    </Table>
</Card>
```

---

### Page Layout Migration

#### ❌ Before (Inconsistent Layout)
```tsx
<div className="space-y-6">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
            <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
                    Customers
                </h1>
                <ModuleRefreshButton />
            </div>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                {pagination?.total || 0} total customers
            </p>
        </div>
        <button
            onClick={() => navigate('/customers/new')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm text-white bg-gradient-brand"
        >
            <Plus size={18} /> Add Customer
        </button>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <SummaryCard label="Active Customers" value={summary?.activeCustomers ?? 0} />
        <SummaryCard label="Total Receivable" value={`SAR ${Number(summary?.totalReceivable ?? 0).toLocaleString()}`} />
        <SummaryCard label="Credit Invoices" value={summary?.totalCreditInvoices ?? 0} />
    </div>
</div>
```

#### ✅ After (Unified Page Layout)
```tsx
import {
    PageLayout,
    PageHeader,
    PageContent,
    StatsGrid,
    StatCard,
    Button,
} from '@/components/ui';
import { Plus, Users } from 'lucide-react';

<PageLayout>
    <PageHeader
        title="Customers"
        subtitle={`${pagination?.total || 0} total customers`}
        action={
            <Button 
                variant="primary" 
                icon={<Plus size={16} />}
                onClick={() => navigate('/customers/new')}
            >
                Add Customer
            </Button>
        }
    />

    <StatsGrid columns={3}>
        <StatCard
            label="Active Customers"
            value={summary?.activeCustomers ?? 0}
            icon={<Users size={20} />}
        />
        <StatCard
            label="Total Receivable"
            value={`SAR ${Number(summary?.totalReceivable ?? 0).toLocaleString()}`}
        />
        <StatCard
            label="Credit Invoices"
            value={summary?.totalCreditInvoices ?? 0}
        />
    </StatsGrid>

    <PageContent>
        {/* Your content */}
    </PageContent>
</PageLayout>
```

---

### Form Migration

#### ❌ Before (Inconsistent Forms)
```tsx
<div className="space-y-4">
    <div>
        <label className="block text-sm font-medium text-gray-700">Email</label>
        <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
        />
        {errors.email && <p className="text-red-500 text-sm">{errors.email}</p>}
    </div>

    <div>
        <label className="block text-sm font-medium text-gray-700">Status</label>
        <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300"
        >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
        </select>
    </div>

    <div className="flex justify-end gap-3">
        <button onClick={handleCancel} className="px-4 py-2 text-gray-600">
            Cancel
        </button>
        <button onClick={handleSubmit} className="px-4 py-2 bg-blue-500 text-white rounded">
            Save
        </button>
    </div>
</div>
```

#### ✅ After (Unified Forms)
```tsx
import {
    FormField,
    FormGroup,
    FormActions,
    Input,
    Select,
    Button,
} from '@/components/ui';

<form onSubmit={handleSubmit} className="space-y-4">
    <FormGroup>
        <FormField
            label="Email"
            error={errors.email}
            required
        >
            <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter email"
                fullWidth
            />
        </FormField>

        <FormField label="Status">
            <Select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                options={[
                    { value: 'active', label: 'Active' },
                    { value: 'inactive', label: 'Inactive' },
                ]}
                fullWidth
            />
        </FormField>
    </FormGroup>

    <FormActions>
        <Button variant="secondary" onClick={handleCancel} type="button">
            Cancel
        </Button>
        <Button variant="primary" type="submit">
            Save
        </Button>
    </FormActions>
</form>
```

---

### Badge Migration

#### ❌ Before (Inline Status Styles)
```tsx
<span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
    Active
</span>

<span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
    Inactive
</span>
```

#### ✅ After (Unified Badge)
```tsx
import { Badge, StatusBadge } from '@/components/ui';

// Custom badge
<Badge variant="success">Active</Badge>
<Badge variant="danger">Inactive</Badge>
<Badge variant="warning">Pending</Badge>
<Badge variant="info">Info</Badge>

// Status badge (predefined statuses)
<StatusBadge status="active" />
<StatusBadge status="pending" />
<StatusBadge status="completed" />
<StatusBadge status="cancelled" />
```

---

## Common Patterns

### Data Table with Filters

```tsx
import {
    PageLayout,
    PageHeader,
    PageContent,
    Card,
    Button,
    Badge,
    SearchInput,
    FilterBar,
    Select,
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
    Pagination,
} from '@/components/ui';
import { Plus, Edit2, Trash2 } from 'lucide-react';

export default function CustomersPage() {
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [page, setPage] = useState(1);

    return (
        <PageLayout>
            <PageHeader
                title="Customers"
                subtitle="Manage your customer relationships"
                action={
                    <Button 
                        variant="primary" 
                        icon={<Plus size={16} />}
                        onClick={() => navigate('/customers/new')}
                    >
                        Add Customer
                    </Button>
                }
            />

            <PageContent>
                <div className="space-y-4">
                    <FilterBar>
                        <SearchInput
                            value={search}
                            onChange={setSearch}
                            placeholder="Search customers..."
                            className="w-64"
                        />
                        <Select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            options={[
                                { value: 'all', label: 'All Statuses' },
                                { value: 'active', label: 'Active' },
                                { value: 'inactive', label: 'Inactive' },
                            ]}
                            className="w-40"
                        />
                    </FilterBar>

                    <Card>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Code</TableHead>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Contact</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead align="right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {customers.map(customer => (
                                    <TableRow key={customer.id}>
                                        <TableCell>{customer.code}</TableCell>
                                        <TableCell>{customer.name}</TableCell>
                                        <TableCell>{customer.email}</TableCell>
                                        <TableCell>
                                            <StatusBadge status={customer.status} />
                                        </TableCell>
                                        <TableCell align="right">
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    icon={<Edit2 size={16} />}
                                                    onClick={() => handleEdit(customer)}
                                                />
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    icon={<Trash2 size={16} />}
                                                    onClick={() => handleDelete(customer)}
                                                />
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        <Pagination
                            currentPage={page}
                            totalPages={totalPages}
                            totalItems={totalItems}
                            itemsPerPage={itemsPerPage}
                            onPageChange={setPage}
                            onItemsPerPageChange={setItemsPerPage}
                        />
                    </Card>
                </div>
            </PageContent>
        </PageLayout>
    );
}
```

---

## Color Mapping Reference

| Old Style | New Token | Usage |
|-----------|-----------|-------|
| `bg-white` | `bg-background-card` | Card backgrounds |
| `bg-gray-50` | `bg-background-subtle` | Subtle backgrounds |
| `text-gray-900` | `text-text-primary` | Primary text |
| `text-gray-600` | `text-text-secondary` | Secondary text |
| `text-gray-400` | `text-text-tertiary` | Tertiary text |
| `border-gray-200` | `border-border` | Default borders |
| `border-gray-100` | `border-border-subtle` | Subtle borders |
| `text-blue-600` | `text-brand` | Brand accent |
| `text-green-600` | `text-success` | Success states |
| `text-red-600` | `text-danger` | Error states |
| `text-yellow-600` | `text-warning` | Warning states |

---

## Checklist for Page Migration

When migrating a page, follow this checklist:

- [ ] Replace inline styles with design tokens
- [ ] Use `Button` component instead of custom buttons
- [ ] Use `Table` components for data tables
- [ ] Use `Card` for content containers
- [ ] Use `PageHeader` for page titles
- [ ] Use `FormField` and `Input` for forms
- [ ] Use `Badge` for status indicators
- [ ] Use `StatsGrid` and `StatCard` for statistics
- [ ] Use `SearchInput` and `FilterBar` for filters
- [ ] Ensure loading states use `TableLoading`
- [ ] Ensure empty states use `TableEmpty`
- [ ] Test dark mode compatibility
- [ ] Verify keyboard accessibility

---

## Troubleshooting

### Issue: Component looks different in dark mode

**Solution:** Ensure you're using design tokens instead of hardcoded colors:
```tsx
// ❌ Wrong
<div className="bg-white text-gray-900">

// ✅ Correct
<div className="bg-background-card text-text-primary">
```

### Issue: Button spacing is inconsistent

**Solution:** Use the `size` prop instead of custom padding:
```tsx
// ❌ Wrong
<Button className="px-6 py-3">

// ✅ Correct
<Button size="lg">
```

### Issue: Table rows don't have hover effect

**Solution:** Ensure `hoverable` prop is enabled (default is true):
```tsx
<Table hoverable={true}>
```

---

## Need Help?

- Refer to `DESIGN_SYSTEM.md` for complete documentation
- Check component source files for available props
- Look at existing migrated pages for examples

---

**Last Updated:** 2026-03-24  
**Version:** 1.0.0
