# Sidebar Module Visibility Fix

## Problem
Users could see module names in the sidebar even though they didn't have permission to access those modules. This happened because:

1. The `isModuleEnabled()` function defaulted to `true` when `enabledModules` was missing from the user object
2. Some parent navigation items lacked permission checks, relying only on module enablement
3. The landing route didn't check module enablement before redirecting users

## Solutions Implemented

### 1. Enhanced `isModuleEnabled` Logic (`client/src/stores/authStore.ts`)

**Before:**
```typescript
if (!user?.enabledModules) return true; // Always default to enabled
```

**After:**
```typescript
if (user?.enabledModules) {
    return user.enabledModules[moduleKey] !== false;
}

// Fallback: Check if user has ANY permission related to this module
const perms = user?.role?.permissions || [];
if (perms.includes('*')) return true;

// Map module keys to permission prefixes
const permissionMap = {
    crm: ['crm'],
    inventory: ['inventory'],
    purchases: ['purchase'],
    accounting: ['accounting'],
    pos: ['pos'],
    reports: ['reports'],
    bom: ['bom'],
    production: ['production'],
    sales: ['sales'],
    items: ['product'],
    suppliers: ['supplier'],
    hr: ['hr'],
};

const modulePerms = permissionMap[moduleKey] || [];
return modulePerms.some(prefix => perms.some(p => p.startsWith(prefix)));
```

**Impact:** Now if the backend doesn't send `enabledModules`, the system checks if the user has any permissions related to that module. If not, the module is hidden.

---

### 2. Added Permission Checks to Parent Nav Items (`client/src/components/Layout.tsx`)

**POS Module:**
```typescript
// Before
{
    icon: MonitorSmartphone,
    label: 'POS',
    section: 'Commerce',
    moduleKey: 'pos',
    // No permission check!
}

// After
{
    icon: MonitorSmartphone,
    label: 'POS',
    section: 'Commerce',
    moduleKey: 'pos',
    anyPermissions: ['pos.sell', 'pos.access', 'pos.manageTerminals', 'pos.viewShifts', 'pos.viewOwnShifts', 'pos.closeShift'],
}
```

**Manufacturing Module:**
```typescript
// Before
{
    icon: Wrench,
    label: 'Manufacturing',
    section: 'Operations',
    moduleKey: 'production',
    // No permission check!
}

// After
{
    icon: Wrench,
    label: 'Manufacturing',
    section: 'Operations',
    moduleKey: 'production',
    anyPermissions: ['production.view', 'bom.view'],
}
```

**Impact:** Parent nav items now require at least one relevant permission, preventing users from seeing module headings they can't access.

---

### 3. Fixed LandingRoute Module Checks (`client/src/App.tsx`)

**Before:**
```typescript
const fallbackPath = ([
    ['sales.view', '/sales/dashboard'],
    ['pos.access', '/pos'],
    // ... no module checks
] as const).find(([perm]) => hasPermission(perm))?.[1] || null;
```

**After:**
```typescript
const fallbackPath = ([
    ['sales.view', '/sales/dashboard', 'sales'],
    ['pos.access', '/pos', 'pos'],
    ['inventory.view', '/inventory/stock', 'inventory'],
    // ... each has module key
] as const).find(([perm, _, mod]) => {
    if (!hasPermission(perm)) return false;
    if (mod && !isModuleEnabled(mod as any)) return false;
    return true;
})?.[1] || null;
```

**Impact:** Users are no longer redirected to modules that aren't enabled for them.

---

### 4. Moved Misplaced Nav Item

**Sales Services** was incorrectly placed under "Human Resources". Now moved to "Sales" section where it belongs.

**Before:**
```typescript
{
    icon: Briefcase,
    label: 'Human Resources',
    children: [
        // ... HR items
        { to: '/services', label: 'Sales Services', permission: 'sales.view' }, // Wrong section!
    ],
}
```

**After:**
```typescript
{
    icon: BadgeDollarSign,
    label: 'Sales',
    children: [
        // ... Sales items
        { to: '/services', label: 'Sales Services', category: 'Services', permission: 'sales.view' },
    ],
}
```

---

## How The System Works Now

### Two-Layer Gating:

1. **Module Enablement Layer** (`isModuleEnabled`)
   - Checks tenant-level module settings from backend
   - Falls back to permission-based checking if settings missing
   - Super admins bypass all checks

2. **Permission Layer** (`hasPermission`)
   - Checks user role permissions
   - Parent items use `anyPermissions` for flexible access
   - Children items have specific permissions

### Sidebar Filtering Flow:

```
Nav Item
  ↓
Check moduleKey → isModuleEnabled(moduleKey)?
  ↓ Yes
Check permissions → hasPermission(permission) or anyPermissions?
  ↓ Yes
Check children → filter each child through same logic
  ↓
Show item if it has any visible children (or has own `to` route)
```

---

## Testing Checklist

- [ ] User with NO permissions sees minimal/empty sidebar
- [ ] User with only `crm.view` sees only Customers module
- [ ] User with only `pos.sell` sees only POS module
- [ ] User with multiple module permissions sees all accessible modules
- [ ] Super admin sees ALL modules
- [ ] User without `production.view` doesn't see Manufacturing
- [ ] User without `pos.*` permissions doesn't see POS
- [ ] Landing page redirects to user's first accessible module
- [ ] Clicking on disabled module routes shows "Module not available" placeholder

---

## Files Modified

1. `client/src/stores/authStore.ts` - Enhanced `isModuleEnabled` logic
2. `client/src/components/Layout.tsx` - Added permission checks to nav items
3. `client/src/App.tsx` - Fixed LandingRoute module checks

---

**Status:** ✅ Complete
**Date:** 2026-04-14
