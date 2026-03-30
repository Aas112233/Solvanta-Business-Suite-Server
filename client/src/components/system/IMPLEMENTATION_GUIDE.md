# Component System Implementation Guide

## Overview

This guide provides step-by-step instructions for implementing the SOLVANTA Component System in your application.

## Quick Start

### 1. Import Components

```tsx
import { 
  PageTemplate, 
  Section, 
  DataTable, 
  FormField, 
  Input, 
  Button,
  useNotification 
} from '@/components/system';
```

### 2. Create a Page

```tsx
function CustomersPage() {
  const notify = useNotification();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  const columns = [
    { key: 'name', header: 'Name', sortable: true },
    { key: 'email', header: 'Email' },
    { 
      key: 'status', 
      header: 'Status',
      render: (row) => (
        <span className={clsx(
          'px-2 py-1 rounded-full text-xs font-medium',
          row.status === 'active' 
            ? 'bg-green-100 text-green-800' 
            : 'bg-gray-100 text-gray-800'
        )}>
          {row.status}
        </span>
      )
    },
  ];

  return (
    <PageTemplate
      title="Customers"
      subtitle="Manage your customer relationships"
      breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Customers' }]}
      action={
        <Button onClick={() => notify.success('Feature coming soon!')}>
          Add Customer
        </Button>
      }
      loading={loading}
    >
      <Section title="All Customers" variant="card">
        <DataTable
          columns={columns}
          data={customers}
          keyAccessor={(row) => row.id}
        />
      </Section>
    </PageTemplate>
  );
}
```

## Component Patterns

### Page Template Pattern

Every page should use `PageTemplate` as the root wrapper:

```tsx
<PageTemplate
  title="Page Title"           // Required
  subtitle="Description"       // Optional
  breadcrumb={[                // Optional
    { label: 'Home', href: '/' },
    { label: 'Current Page' }
  ]}
  action={<Button>Action</Button>}  // Optional
  loading={isLoading}          // Optional - shows skeleton
  error={errorMessage}         // Optional - shows error state
  onRetry={refetch}            // Optional - retry callback
  maxWidth="2xl"               // Optional - content width
>
  {/* Page content */}
</PageTemplate>
```

### Form Pattern

Use the form components for consistent form layouts:

```tsx
function CustomerForm() {
  const form = useFormValidation({
    initialValues: { name: '', email: '' },
    validationRules: {
      name: { required: 'Name is required' },
      email: { 
        required: 'Email is required',
        pattern: { 
          value: /\S+@\S+\.\S+/, 
          message: 'Invalid email format' 
        }
      },
    },
    onSubmit: async (values) => {
      await api.createCustomer(values);
    },
  });

  return (
    <form onSubmit={form.handleSubmit}>
      <FormSection title="Customer Information" columns={2}>
        <FormField 
          label="Name" 
          error={form.errors.name}
          required
        >
          <Input 
            {...form.getFieldProps('name')}
            placeholder="Enter customer name"
          />
        </FormField>

        <FormField 
          label="Email" 
          error={form.errors.email}
          required
        >
          <Input 
            {...form.getFieldProps('email')}
            type="email"
            placeholder="Enter email address"
          />
        </FormField>
      </FormSection>

      <FormActions>
        <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
          Cancel
        </Button>
        <Button type="submit" loading={form.isSubmitting}>
          Save Customer
        </Button>
      </FormActions>
    </form>
  );
}
```

### Data Table Pattern

```tsx
<DataTable
  columns={[
    { key: 'name', header: 'Name', sortable: true },
    { 
      key: 'amount', 
      header: 'Amount', 
      align: 'right',
      render: (row) => formatCurrency(row.amount)
    },
    { 
      key: 'actions', 
      header: '', 
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm">Edit</Button>
          <Button variant="danger" size="sm">Delete</Button>
        </div>
      )
    },
  ]}
  data={data}
  keyAccessor={(row) => row.id}
  loading={isLoading}
  pagination={pagination}
  onPageChange={setPage}
  sortColumn={sortColumn}
  sortDirection={sortDirection}
  onSort={handleSort}
  onRowClick={(row) => navigate(`/detail/${row.id}`)}
  emptyState={{
    title: 'No customers found',
    description: 'Get started by adding your first customer',
    action: <Button>Add Customer</Button>
  }}
/>
```

## Migration Strategy

### Phase 1: New Pages (Immediate)
- Use system components exclusively for new pages
- Reference existing pages as examples

### Phase 2: Existing Page Updates (Gradual)
1. Wrap existing page with `PageTemplate`
2. Replace raw tables with `DataTable`
3. Update forms to use `FormField` components
4. Add `Section` wrappers for content grouping

### Phase 3: Legacy Cleanup (Future)
- Remove old component imports
- Consolidate duplicate patterns
- Update tests

## Best Practices

### 1. Consistent Props
- Use `size="sm|md|lg"` for sizing
- Use `variant="primary|secondary|outline|ghost|danger"` for styling
- Use `loading` prop for async states
- Use `disabled` for non-interactive states

### 2. Accessibility
- All form inputs must have labels
- Use proper heading hierarchy (h1 in PageTemplate, h2 in Section)
- Include `aria-label` for icon-only buttons
- Ensure keyboard navigation works

### 3. Responsive Design
- Use `maxWidth` prop on PageTemplate to control content width
- Tables scroll horizontally on mobile
- Forms stack vertically on small screens
- Test at 320px, 768px, and 1440px widths

### 4. Error Handling
- Always provide error feedback on forms
- Use PageTemplate's error state for page-level errors
- Include retry functionality where possible

### 5. Loading States
- Use PageTemplate's loading prop for page-level loading
- Use DataTable's loading prop for table loading
- Use Skeleton components for custom loading UI

## Common Patterns

### Search + Filter + Table

```tsx
<PageTemplate title="Customers" action={<Button>Add</Button>}>
  <div className="space-y-4">
    <div className="flex gap-4">
      <Input 
        icon={<SearchIcon />}
        placeholder="Search customers..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-md"
      />
      <Select 
        options={statusOptions}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-40"
      />
    </div>
    
    <DataTable {...tableProps} />
  </div>
</PageTemplate>
```

### Detail Page with Sections

```tsx
<PageTemplate 
  title={customer.name}
  breadcrumb={[...]}
  action={<Button>Edit</Button>}
>
  <div className="space-y-6">
    <Section title="Basic Information" variant="card">
      <dl className="grid grid-cols-2 gap-4">
        <div>
          <dt className="text-sm text-gray-500">Email</dt>
          <dd className="text-sm font-medium">{customer.email}</dd>
        </div>
        {/* ... */}
      </dl>
    </Section>
    
    <Section title="Orders" variant="card">
      <DataTable {...ordersTableProps} />
    </Section>
  </div>
</PageTemplate>
```

## Troubleshooting

### TypeScript Errors
- Ensure all required props are provided
- Check that generic types match your data structure
- Use `as const` for option arrays

### Styling Issues
- Verify Tailwind CSS is properly configured
- Check that dark mode classes are applied
- Ensure no conflicting inline styles

### Performance
- Memoize column definitions
- Use pagination for large datasets
- Implement virtualization for very large tables

## Support

For questions or issues:
1. Check this guide first
2. Review component source code
3. Reference example implementations
4. Create an issue in the project tracker
