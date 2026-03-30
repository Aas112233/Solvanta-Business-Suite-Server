# SOLVANTA Business Suite - Design System

## Version 1.0.0

A unified design system for building consistent, accessible, and professional enterprise applications.

---

## Table of Contents

1. [Design Tokens](#design-tokens)
2. [Core Components](#core-components)
3. [Component Patterns](#component-patterns)
4. [Layout Guidelines](#layout-guidelines)
5. [Accessibility](#accessibility)

---

## Design Tokens

### Colors

#### Brand Colors (Primary Palette)

| Token | Value | Usage |
|-------|-------|-------|
| `--color-brand-500` | `#0F1E2E` | Primary brand color, headers, primary text |
| `--color-brand-600` | `#0d1a29` | Hover states, darker accents |
| `--color-brand-400` | `#265582` | Secondary brand elements |

#### Accent Color (Electric Blue)

| Token | Value | Usage |
|-------|-------|-------|
| `--color-text-brand` | `#2D7FF9` | Links, active states, highlights |
| `--color-border-active` | `#2D7FF9` | Active input borders, focus rings |
| `--color-accent-soft` | `rgba(45, 127, 249, 0.12)` | Soft background accents |

#### Semantic Colors

| Token | Light Mode | Dark Mode | Usage |
|-------|------------|-----------|-------|
| `--color-success` | `#1FAF8F` | `#1FAF8F` | Success states, confirmations |
| `--color-success-soft` | `rgba(31, 175, 143, 0.14)` | `rgba(31, 175, 143, 0.18)` | Success backgrounds |
| `--color-warning` | `#D97706` | `#F59E0B` | Warning states, cautions |
| `--color-warning-soft` | `rgba(217, 119, 6, 0.14)` | `rgba(245, 158, 11, 0.2)` | Warning backgrounds |
| `--color-danger` | `#DC2626` | `#F87171` | Error states, destructive actions |
| `--color-danger-soft` | `rgba(220, 38, 38, 0.12)` | `rgba(248, 113, 113, 0.2)` | Error backgrounds |

#### Surface Colors

| Token | Light Mode | Dark Mode | Usage |
|-------|------------|-----------|-------|
| `--color-background-app` | `#F4F6F8` | `#080D14` | App background |
| `--color-background-card` | `#FFFFFF` | `#0F1E2E` | Card/panel backgrounds |
| `--color-background-subtle` | `#F8FAFC` | `#14273A` | Subtle backgrounds |

#### Text Colors

| Token | Light Mode | Dark Mode | Usage |
|-------|------------|-----------|-------|
| `--color-text-primary` | `#0F1E2E` | `#F4F6F8` | Primary text, headings |
| `--color-text-secondary` | `#475569` | `#B3C2D1` | Secondary text, body |
| `--color-text-tertiary` | `#94A3B8` | `#809AB4` | Tertiary text, placeholders |

#### Border Colors

| Token | Light Mode | Dark Mode | Usage |
|-------|------------|-----------|-------|
| `--color-border` | `#E2E8F0` | `#1E3752` | Default borders |
| `--color-border-subtle` | `#F1F5F9` | `#14273A` | Subtle dividers |

### Typography

#### Font Families

```css
--font-sans: 'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif;
--font-heading: 'Montserrat', ui-sans-serif, system-ui, -apple-system, sans-serif;
```

#### Font Sizes

| Size | Value | Usage |
|------|-------|-------|
| `text-xs` | `0.75rem` (12px) | Labels, captions |
| `text-sm` | `0.875rem` (14px) | Body text, buttons |
| `text-base` | `1rem` (16px) | Default body |
| `text-lg` | `1.125rem` (18px) | Subheadings |
| `text-xl` | `1.25rem` (20px) | Section titles |
| `text-2xl` | `1.5rem` (24px) | Page titles |
| `text-3xl` | `1.875rem` (30px) | Large headings |

#### Font Weights

| Weight | Value | Usage |
|--------|-------|-------|
| `font-normal` | `400` | Body text |
| `font-medium` | `500` | Emphasized text |
| `font-semibold` | `600` | Headings, buttons |
| `font-bold` | `700` | Primary headings |

### Spacing

| Token | Value | Usage |
|-------|-------|-------|
| `spacing-1` | `0.25rem` (4px) | Tight spacing |
| `spacing-2` | `0.5rem` (8px) | Icon gaps |
| `spacing-3` | `0.75rem` (12px) | Compact spacing |
| `spacing-4` | `1rem` (16px) | Standard padding |
| `spacing-5` | `1.25rem` (20px) | Card padding |
| `spacing-6` | `1.5rem` (24px) | Section spacing |
| `spacing-8` | `2rem` (32px) | Large gaps |

### Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-button` | `0.375rem` (6px) | Buttons, inputs |
| `--radius-panel` | `0.5rem` (8px) | Panels, cards |
| `--radius-card` | `0.375rem` (6px) | Card corners |
| `rounded-full` | `9999px` | Avatars, badges |

### Shadows

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-card` | `0 1px 3px rgba(15, 30, 46, 0.05)` | Default cards |
| `--shadow-card-hover` | `0 10px 15px rgba(15, 30, 46, 0.05)` | Hover states |
| `--shadow-glow-brand` | `0 0 15px rgba(45, 127, 249, 0.4)` | Brand glow effects |

### Transitions

| Token | Value | Usage |
|-------|-------|-------|
| `transition-fast` | `150ms` | Hover states |
| `transition-normal` | `200ms` | Standard transitions |
| `transition-slow` | `300ms` | Modal, slide animations |

---

## Core Components

### Button

#### Variants

```tsx
// Primary - Main actions
<Button variant="primary">Save Changes</Button>

// Secondary - Secondary actions
<Button variant="secondary">Cancel</Button>

// Outline - Tertiary actions
<Button variant="outline">View Details</Button>

// Ghost - Minimal emphasis
<Button variant="ghost">Dismiss</Button>

// Danger - Destructive actions
<Button variant="danger">Delete</Button>
```

#### Sizes

```tsx
<Button size="sm">Small</Button>   // 32px height
<Button size="md">Medium</Button>  // 40px height (default)
<Button size="lg">Large</Button>   // 48px height
```

#### States

```tsx
<Button disabled>Disabled</Button>
<Button loading>Loading</Button>
<Button icon={<Plus size={16} />}>With Icon</Button>
```

### Table

#### Structure

```tsx
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Column 1</TableHead>
      <TableHead>Column 2</TableHead>
      <TableHead className="text-right">Actions</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell>Data 1</TableCell>
      <TableCell>Data 2</TableCell>
      <TableCell className="text-right">
        <ActionButton />
      </TableCell>
    </TableRow>
  </TableBody>
</Table>
```

#### Features

- Consistent header styling with `--color-background-subtle`
- Hover states on rows
- Right-aligned action columns
- Loading state support
- Empty state support

### Card

#### Basic Card

```tsx
<Card>
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
    <CardDescription>Optional description</CardDescription>
  </CardHeader>
  <CardContent>
    Card content goes here
  </CardContent>
  <CardFooter>
    <Button>Action</Button>
  </CardFooter>
</Card>
```

#### Stat Card

```tsx
<StatCard
  label="Total Sales"
  value="$12,345"
  sub="123 transactions"
  icon={DollarSign}
  trend="+12.5%"
  trendDirection="up"
/>
```

### Form Inputs

#### Text Input

```tsx
<FormField label="Email" error={errors.email}>
  <Input 
    type="email" 
    placeholder="Enter email"
    value={email}
    onChange={handleChange}
  />
</FormField>
```

#### Select Dropdown

```tsx
<FormField label="Status">
  <Select
    options={[
      { value: 'active', label: 'Active' },
      { value: 'inactive', label: 'Inactive' }
    ]}
    value={status}
    onChange={setStatus}
  />
</FormField>
```

#### Checkbox

```tsx
<Checkbox
  label="Enable notifications"
  checked={notifications}
  onChange={setNotifications}
/>
```

### Badge

#### Variants

```tsx
<Badge variant="default">Default</Badge>
<Badge variant="success">Success</Badge>
<Badge variant="warning">Warning</Badge>
<Badge variant="danger">Danger</Badge>
<Badge variant="info">Info</Badge>
```

#### Sizes

```tsx
<Badge size="sm">Small</Badge>   // 20px height
<Badge size="md">Medium</Badge>  // 24px height (default)
```

---

## Component Patterns

### Page Layout Pattern

```tsx
<div className="space-y-6">
  {/* Page Header */}
  <PageHeader
    title="Customers"
    subtitle={`${totalCustomers} total customers`}
    action={
      <Button icon={<Plus size={16} />} onClick={handleCreate}>
        Add Customer
      </Button>
    }
  />

  {/* Stats Grid */}
  <StatsGrid>
    <StatCard {...stats1} />
    <StatCard {...stats2} />
    <StatCard {...stats3} />
  </StatsGrid>

  {/* Filters */}
  <Filters>
    <SearchInput placeholder="Search..." />
    <SelectFilter options={statusOptions} />
    <DateRangeFilter />
  </Filters>

  {/* Data Table */}
  <Card>
    <DataTable
      columns={columns}
      data={data}
      isLoading={isLoading}
      emptyState={<EmptyState message="No data found" />}
    />
    <Pagination
      currentPage={page}
      totalPages={totalPages}
      onPageChange={setPage}
    />
  </Card>
</div>
```

### Modal Pattern

```tsx
<Modal
  isOpen={isOpen}
  onClose={handleClose}
  title="Create Customer"
  maxWidth="lg"
>
  <form onSubmit={handleSubmit}>
    <ModalContent>
      <FormField label="Name">
        <Input {...nameField} />
      </FormField>
    </ModalContent>
    <ModalFooter>
      <Button variant="secondary" onClick={handleClose}>
        Cancel
      </Button>
      <Button type="submit">Save</Button>
    </ModalFooter>
  </form>
</Modal>
```

### Action Buttons Pattern

```tsx
<div className="flex items-center gap-2">
  <ActionButton
    variant="ghost"
    icon={<Edit2 size={16} />}
    tooltip="Edit"
    onClick={handleEdit}
  />
  <ActionButton
    variant="ghost"
    icon={<Trash2 size={16} />}
    tooltip="Delete"
    onClick={handleDelete}
    danger
  />
</div>
```

---

## Layout Guidelines

### Page Structure

```
┌─────────────────────────────────────────┐
│           Global Header                  │
├──────────┬──────────────────────────────┤
│          │                              │
│  Sidebar │    Main Content Area         │
│          │    ┌──────────────────┐      │
│          │    │  Page Header     │      │
│          │    ├──────────────────┤      │
│          │    │  Stats Grid      │      │
│          │    ├──────────────────┤      │
│          │    │  Filters         │      │
│          │    ├──────────────────┤      │
│          │    │  Data Table      │      │
│          │    └──────────────────┘      │
│          │                              │
└──────────┴──────────────────────────────┘
```

### Spacing System

- **Page padding**: `spacing-6` (24px) on all sides
- **Section gaps**: `spacing-6` (24px) between major sections
- **Card padding**: `spacing-5` (20px) internal padding
- **Element gaps**: `spacing-4` (16px) between related elements

### Grid Layouts

#### Stats Grid

```tsx
// Mobile: 1 column
// Tablet: 2 columns
// Desktop: 3-4 columns
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
```

#### Two Column Layout

```tsx
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
```

#### Sidebar + Content

```tsx
<div className="flex gap-6">
  <aside className="w-64 shrink-0">...</aside>
  <main className="flex-1">...</main>
</div>
```

---

## Accessibility

### Keyboard Navigation

- All interactive elements must be focusable
- Focus states must be visible (2px ring with offset)
- Tab order must follow visual order

### Color Contrast

- Text must have minimum 4.5:1 contrast ratio
- Interactive elements must have 3:1 contrast ratio
- Never use color alone to convey information

### ARIA Labels

```tsx
<button aria-label="Close modal">
  <X size={20} />
</button>

<nav aria-label="Main navigation">
  <Pagination aria-label="Pagination" />
</nav>
```

### Form Accessibility

```tsx
<FormField label="Email" error={error} id="email">
  <Input 
    id="email"
    aria-describedby={error ? "email-error" : undefined}
    aria-invalid={!!error}
  />
  {error && <span id="email-error" role="alert">{error}</span>}
</FormField>
```

---

## Migration Checklist

When updating existing pages:

- [ ] Replace inline styles with design tokens
- [ ] Use unified Button component
- [ ] Use unified Table component
- [ ] Use unified Card component
- [ ] Use unified FormField components
- [ ] Apply consistent spacing (spacing-4, spacing-6)
- [ ] Use semantic colors for states
- [ ] Add proper loading states
- [ ] Add proper empty states
- [ ] Ensure keyboard accessibility
- [ ] Test dark mode compatibility

---

## Component Location Map

| Component | Location | Status |
|-----------|----------|--------|
| Button | `components/ui/Button.tsx` | ✅ New |
| Table | `components/ui/Table.tsx` | ✅ New |
| Card | `components/ui/Card.tsx` | ✅ New |
| Input | `components/ui/Input.tsx` | ✅ New |
| Select | `components/ui/Select.tsx` | ✅ New |
| Badge | `components/ui/Badge.tsx` | ✅ New |
| Modal | `components/ui/Modal.tsx` | 🔄 Update |
| Pagination | `components/ui/Pagination.tsx` | 🔄 Update |
| AppDropdown | `components/ui/AppDropdown.tsx` | 🔄 Update |
| PageHeader | `components/ui/PageHeader.tsx` | ✅ New |
| StatCard | `components/ui/StatCard.tsx` | ✅ New |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-03-24 | Initial design system release |
