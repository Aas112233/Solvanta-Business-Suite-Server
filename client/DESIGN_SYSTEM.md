# SOLVANTA Business Suite - Design System

A comprehensive, unified design system for enterprise business applications.

---

## 📦 Table of Contents

1. [Design Tokens](#design-tokens)
2. [Core Components](#core-components)
3. [Component Usage Guide](#component-usage-guide)
4. [Page Layout Standards](#page-layout-standards)
5. [Accessibility](#accessibility)

---

## 🎨 Design Tokens

### Colors

```css
/* Brand Colors */
--color-brand-500: #0F1E2E;      /* Deep Navy - Primary */
--color-brand-300: #4d7398;      /* Hover states */
--color-text-brand: #2D7FF9;     /* Electric Blue - Accent */

/* Semantic Colors */
--color-success: #1FAF8F;        /* Emerald Green */
--color-warning: #D97706;        /* Amber */
--color-danger: #DC2626;         /* Red */
--color-info: #2D7FF9;           /* Blue */

/* Background */
--color-background-app: #F4F6F8;
--color-background-card: #FFFFFF;
--color-background-subtle: #F8FAFC;

/* Text */
--color-text-primary: #0F1E2E;
--color-text-secondary: #475569;
--color-text-tertiary: #94A3B8;

/* Border */
--color-border: #E2E8F0;
--color-border-subtle: #F1F5F9;
--color-border-active: #2D7FF9;
```

### Typography

- **Font Family:** Inter (sans-serif), Montserrat (headings)
- **Sizes:** xs (12px), sm (14px), base (16px), lg (18px), xl (20px), 2xl (24px)

### Spacing

Base unit: **4px** (Tailwind's `1`)

- `1` = 4px, `2` = 8px, `3` = 12px, `4` = 16px, `5` = 20px, `6` = 24px

### Radius

- **Buttons/Cards:** 6px max
- **Panels:** 8px
- **Circular:** 9999px (full)

### Shadows

- **Card:** `0 1px 3px rgba(15, 30, 46, 0.05)`
- **Hover:** `0 10px 15px rgba(15, 30, 46, 0.05)`
- **Glow:** `0 0 15px rgba(45, 127, 249, 0.4)`

---

## 🧩 Core Components

### Buttons

**File:** `components/ui/Button.tsx`

```tsx
import { Button } from '@/components/ui';

// Variants: primary | secondary | outline | ghost | danger | success
// Sizes: sm | md | lg

<Button variant="primary" size="md">Save</Button>
<Button variant="secondary" icon={<Plus size={16} />}>Add Item</Button>
<Button variant="danger" loading>Saving...</Button>
<Button variant="ghost" size="sm">Cancel</Button>
```

**Usage Rules:**
- **Primary:** Main actions (Save, Submit, Create)
- **Secondary:** Alternative actions (Back, Cancel)
- **Outline:** Tertiary actions (Filter, Export)
- **Ghost:** Row actions, icon buttons
- **Danger:** Destructive actions (Delete, Remove)
- **Success:** Positive actions (Approve, Confirm)

---

### Forms

**File:** `components/ui/Input.tsx`, `Select.tsx`, `FormField.tsx`, `DatePicker.tsx`

```tsx
import { Input, Select, FormField, FormGroup, FormActions, DatePicker } from '@/components/ui';

<FormGroup>
  <FormField label="Customer Name" required>
    <Input placeholder="Enter name" fullWidth />
  </FormField>
  
  <FormField label="Email" error={errors.email} hint="We'll never share your email">
    <Input type="email" fullWidth error={!!errors.email} />
  </FormField>
  
  <FormField label="Status">
    <Select
      options={[
        { value: 'active', label: 'Active' },
        { value: 'inactive', label: 'Inactive' },
      ]}
      fullWidth
    />
  </FormField>
  
  <FormField label="Date">
    <DatePicker value={date} onChange={setDate} fullWidth />
  </FormField>
  
  <FormActions>
    <Button variant="secondary">Cancel</Button>
    <Button variant="primary">Save</Button>
  </FormActions>
</FormGroup>
```

---

### Tables

**File:** `components/ui/Table.tsx`

```tsx
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableLoading, TableEmpty } from '@/components/ui';

<Card>
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Name</TableHead>
        <TableHead>Email</TableHead>
        <TableHead>Status</TableHead>
        <TableHead align="right">Actions</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {data.map((item) => (
        <TableRow key={item.id}>
          <TableCell>{item.name}</TableCell>
          <TableCell>{item.email}</TableCell>
          <TableCell><StatusBadge status={item.status} /></TableCell>
          <TableCell align="right">
            <Button variant="ghost" size="sm">Edit</Button>
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
  
  {/* Loading State */}
  {loading && <TableLoading colSpan={4} />}
  
  {/* Empty State */}
  {!loading && data.length === 0 && (
    <TableEmpty colSpan={4} message="No customers found" />
  )}
</Card>
```

---

### Cards

**File:** `components/ui/Card.tsx`

```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, StatCard, StatsGrid } from '@/components/ui';

// Standard Card
<Card>
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
    <CardDescription>Card description</CardDescription>
  </CardHeader>
  <CardContent>Content here</CardContent>
  <CardFooter>
    <Button>Action</Button>
  </CardFooter>
</Card>

// Stats Grid
<StatsGrid columns={4}>
  <StatCard
    label="Total Revenue"
    value="$45,231"
    trend="+20.1%"
    trendDirection="up"
    icon={<DollarSign size={20} />}
  />
</StatsGrid>
```

---

### Badges

**File:** `components/ui/Badge.tsx`

```tsx
import { Badge, StatusBadge } from '@/components/ui';

// Variants: default | success | warning | danger | info | brand
// Sizes: sm | md

<Badge variant="success">Success</Badge>
<Badge variant="warning" dot>Warning</Badge>

// Status badges with predefined colors
<StatusBadge status="active" />
<StatusBadge status="pending" />
<StatusBadge status="completed" />
<StatusBadge status="cancelled" />
```

---

### Modals

**File:** `components/ui/Modal.tsx`

```tsx
import { Modal } from '@/components/ui';

<Modal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="Create Customer"
  maxWidth="md"
  closeOnOutsideClick={true}
>
  {/* Modal content */}
  <p>Form or content here</p>
  
  <div className="flex gap-3 mt-6">
    <Button variant="secondary" onClick={() => setIsOpen(false)}>Cancel</Button>
    <Button variant="primary">Save</Button>
  </div>
</Modal>
```

**Max Width Options:** sm | md | lg | xl | 2xl | 3xl | 4xl | 5xl | fit | full

---

### Tabs

**File:** `components/ui/Tabs.tsx`

```tsx
import { Tabs, TabPanel } from '@/components/ui';
import { Users, Settings } from 'lucide-react';

const [activeTab, setActiveTab] = useState('customers');

<Tabs
  tabs={[
    { value: 'customers', label: 'Customers', icon: <Users size={16} /> },
    { value: 'settings', label: 'Settings', icon: <Settings size={16} /> },
  ]}
  activeTab={activeTab}
  onChange={setActiveTab}
  variant="default" // default | pills | underline
/>

<TabPanel activeTab={activeTab} tabValue="customers">
  <CustomersList />
</TabPanel>

<TabPanel activeTab={activeTab} tabValue="settings">
  <SettingsForm />
</TabPanel>
```

---

### Toast Notifications

**File:** `components/ui/Toast.tsx`

```tsx
import { toast, useToast, ToastContainer } from '@/components/ui';

// In your App.tsx or root component
import { ToastContainer } from '@/components/ui';

function App() {
  return (
    <>
      <YourApp />
      <ToastContainer />
    </>
  );
}

// Usage in components
function MyComponent() {
  const { success, error } = useToast();
  
  const handleSave = async () => {
    try {
      await saveData();
      toast.success('Saved successfully', 'Your changes have been saved');
    } catch (err) {
      toast.error('Save failed', 'Please try again');
    }
  };
  
  // Or directly
  toast.success('Done!');
  toast.error('Error occurred');
  toast.warning('Warning message');
  toast.info('Information');
}
```

---

### Empty States

**File:** `components/ui/EmptyState.tsx`

```tsx
import { EmptyState, EmptyDataState, EmptySearchState, EmptyCustomersState } from '@/components/ui';
import { Button } from '@/components/ui';

// Generic
<EmptyState
  title="No items yet"
  description="Get started by adding your first item"
  action={<Button>Create Item</Button>}
/>

// Preset variants
<EmptyDataState description="No data available for this period" />
<EmptySearchState searchTerm="john" />
<EmptyCustomersState action={<Button>Add Customer</Button>} />
<EmptyProductsState />
<EmptyOrdersState />
```

---

### Skeleton Loaders

**File:** `components/ui/Skeleton.tsx`

```tsx
import { Skeleton, SkeletonText, SkeletonCard, SkeletonTable } from '@/components/ui';

// Simple skeleton
<Skeleton variant="text" height={20} width={200} />
<Skeleton variant="circular" width={40} height={40} />
<Skeleton variant="rounded" height={160} />

// Multi-line text
<SkeletonText lines={3} spacing="md" />

// Card placeholder
<SkeletonCard showImage showTitle showDescription />

// Table placeholder
<SkeletonTable rows={5} columns={4} />
```

---

### Avatar

**File:** `components/ui/Avatar.tsx`

```tsx
import { Avatar, AvatarGroup } from '@/components/ui';

// Single avatar
<Avatar
  name="John Doe"
  src="/avatar.jpg"
  size="md" // xs | sm | md | lg | xl | 2xl
  status="online" // online | offline | busy | away
/>

// Avatar group
<AvatarGroup
  avatars={[
    { name: 'John Doe', src: '/john.jpg', status: 'online' },
    { name: 'Jane Smith', status: 'busy' },
  ]}
  max={5}
  size="md"
/>
```

---

### Progress Indicators

**File:** `components/ui/ProgressBar.tsx`

```tsx
import { ProgressBar, CircularProgress, Stepper } from '@/components/ui';

// Linear progress
<ProgressBar
  value={75}
  max={100}
  variant="success" // default | success | warning | danger | brand
  size="md" // sm | md | lg
  showLabel
  label="Upload progress"
/>

// Circular progress
<CircularProgress
  value={75}
  size="lg" // sm | md | lg | xl
  variant="brand"
  showLabel
/>

// Stepper
<Stepper
  steps={[
    { id: 'step1', label: 'Basic Info', description: 'Enter company details' },
    { id: 'step2', label: 'Users', description: 'Add team members' },
    { id: 'step3', label: 'Review' },
  ]}
  currentStep={1}
  orientation="horizontal" // horizontal | vertical
/>
```

---

## 📐 Page Layout Standards

### Dashboard Page

```tsx
import { PageLayout, PageHeader, StatsGrid, StatCard, Card } from '@/components/ui';

<PageLayout>
  <PageHeader
    title="Dashboard"
    subtitle="Overview of your business"
  />
  
  <StatsGrid columns={4}>
    <StatCard ... />
    <StatCard ... />
  </StatsGrid>
  
  <div className="grid gap-4 mt-4">
    <Card>
      <CardHeader><CardTitle>Recent Activity</CardTitle></CardHeader>
      <CardContent>...</CardContent>
    </Card>
  </div>
</PageLayout>
```

### List/Catalog Page

```tsx
import { PageLayout, PageHeader, FilterBar, SearchInput, Select, Table, Pagination, EmptyState } from '@/components/ui';

<PageLayout>
  <PageHeader
    title="Customers"
    action={<Button icon={<Plus />}>New Customer</Button>}
  />
  
  <FilterBar>
    <SearchInput value={search} onChange={setSearch} placeholder="Search customers..." />
    <Select options={statusOptions} placeholder="Filter by status" />
  </FilterBar>
  
  <Card>
    <Table>...</Table>
    <Pagination
      currentPage={1}
      totalPages={10}
      totalItems={100}
      itemsPerPage={20}
      onPageChange={setPage}
      onItemsPerPageChange={setLimit}
    />
  </Card>
</PageLayout>
```

### Form Page

```tsx
import { PageLayout, PageHeader, Card, FormGroup, FormField, FormActions, Input, Select } from '@/components/ui';

<PageLayout>
  <PageHeader
    title="Create Customer"
    breadcrumb={[
      { label: 'Customers', href: '/customers' },
      { label: 'Create' },
    ]}
  />
  
  <Card>
    <form onSubmit={handleSubmit}>
      <FormGroup>
        <FormField label="Name" required>
          <Input fullWidth />
        </FormField>
        
        <FormField label="Email" required>
          <Input type="email" fullWidth />
        </FormField>
      </FormGroup>
      
      <FormActions align="right" className="mt-6">
        <Button variant="secondary" type="button">Cancel</Button>
        <Button variant="primary" type="submit">Save Customer</Button>
      </FormActions>
    </form>
  </Card>
</PageLayout>
```

### Report Page

```tsx
import { PageLayout, PageHeader, FilterBar, DateRangePicker, Select, Table, Card } from '@/components/ui';

<PageLayout>
  <PageHeader title="Sales Report" />
  
  <FilterBar>
    <DateRangePicker
      startDate={startDate}
      endDate={endDate}
      onChange={(start, end) => { setStartDate(start); setEndDate(end); }}
    />
    <Select options={branchOptions} placeholder="Filter by branch" />
    <Button variant="outline">Export PDF</Button>
    <Button variant="outline">Export Excel</Button>
  </FilterBar>
  
  <Card>
    <Table>...</Table>
  </Card>
</PageLayout>
```

---

## ♿ Accessibility

### Focus States

All interactive elements have visible focus rings:
```css
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 focus-visible:ring-offset-2
```

### ARIA Attributes

```tsx
// Buttons with icons
<Button aria-label="Close modal"><X size={16} /></Button>

// Form fields
<FormField label="Email" error={error} id="email-input">
  <Input aria-invalid={!!error} aria-describedby="email-error" />
</FormField>

// Tables
<Table role="table">
  <TableHeader><TableRow role="row">...</TableRow></TableHeader>
  <TableBody>...</TableBody>
</Table>

// Modals
<Modal role="dialog" aria-modal="true" aria-labelledby="modal-title">
  <h2 id="modal-title">Modal Title</h2>
</Modal>
```

### Keyboard Navigation

- **Tab/Shift+Tab:** Navigate between interactive elements
- **Enter/Space:** Activate buttons, links
- **Escape:** Close modals, dropdowns
- **Arrow keys:** Navigate menus, tabs

### Color Contrast

All text meets WCAG AA standards (4.5:1 ratio):
- Primary text: `#0F1E2E` on `#FFFFFF` = 16.5:1 ✓
- Secondary text: `#475569` on `#FFFFFF` = 7.2:1 ✓
- Tertiary text: `#94A3B8` on `#FFFFFF` = 3.5:1 (decorative only)

---

## 📝 Best Practices

### 1. **Consistency**
- Always use design system components
- Don't create custom colors or styles
- Follow established patterns

### 2. **Performance**
- Use Skeleton loaders for async content
- Implement virtual scrolling for large tables
- Lazy load heavy components

### 3. **Error Handling**
- Show clear error messages in forms
- Use toast notifications for feedback
- Provide recovery actions

### 4. **Loading States**
- Show skeleton for content loading
- Use button loading state for actions
- Display progress for long operations

### 5. **Responsive Design**
- All components are mobile-first
- Use responsive grid layouts
- Test on multiple screen sizes

---

## 🚀 Quick Start

```tsx
// Import everything you need
import {
  Button, Input, Select, FormField, FormGroup, FormActions,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Card, CardHeader, CardTitle, CardContent,
  Badge, StatusBadge,
  Modal, ToastContainer, toast,
  EmptyState, Skeleton, Avatar, ProgressBar, Tabs,
  PageLayout, PageHeader, FilterBar, SearchInput,
} from '@/components/ui';

// Use in your components
function MyPage() {
  return (
    <PageLayout>
      <PageHeader title="My Page" />
      <Card>
        <CardHeader><CardTitle>Content</CardTitle></CardHeader>
        <CardContent>...</CardContent>
      </Card>
    </PageLayout>
  );
}
```

---

**Last Updated:** March 2026  
**Version:** 1.0.0  
**Maintained by:** SOLVANTA Development Team
