# SOLVANTA Component System

A comprehensive, accessible, and modular component library for building consistent enterprise interfaces.

## Quick Start

```tsx
import { PageTemplate, DataTable, FormField, Input, Button } from '@/components/system';

function CustomersPage() {
  return (
    <PageTemplate
      title="Customers"
      subtitle="Manage your customer relationships"
      breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Customers' }]}
      action={<Button variant="primary">Add Customer</Button>}
    >
      {/* Your content */}
    </PageTemplate>
  );
}
```

## Architecture Principles

1. **Composition Over Configuration**: Components are built to be composed together
2. **Prop Consistency**: Common props (size, variant, disabled, loading) work the same across components
3. **Accessibility First**: All components meet WCAG 2.1 AA standards
4. **Type Safety**: Full TypeScript support with exported types
5. **Theme Aware**: Automatic light/dark mode support via CSS variables

## Directory Structure

```
system/
├── core/           # Layout & structural components
├── forms/          # Form inputs and validation
├── data/           # Data display components (tables, lists)
├── feedback/       # Loading, empty, error states
├── navigation/     # Navigation components
├── types/          # Shared TypeScript types
├── hooks/          # Shared hooks
└── utils/          # Utility functions
```

## Migration Strategy

1. **New pages**: Use the system components exclusively
2. **Existing pages**: Migrate incrementally, starting with PageTemplate wrapper
3. **Legacy components**: Can coexist during transition period
