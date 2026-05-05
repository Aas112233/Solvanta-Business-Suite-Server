import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useSearchParams } from 'react-router-dom';
import { FeatureFlags, fetchSuperAdminTenants, Tenant, updateTenantFeatures } from './api';
import AppDropdown from '../../components/ui/AppDropdown';
import { useAuthStore } from '../../stores/authStore';
import { SUPER_ADMIN_PERMISSIONS } from '../../lib/superAdminPermissions';
import SuperAdminAccessCard from './SuperAdminAccessCard';

const featureLabelMap: Record<keyof FeatureFlags, string> = {
    crm: 'CRM',
    inventory: 'Inventory',
    purchases: 'Purchases',
    accounting: 'Accounting',
    pos: 'POS',
    reports: 'Reports',
    bom: 'Production Recipes',
    production: 'Production',
    sales: 'Sales',
    items: 'Items / Products',
    suppliers: 'Suppliers',
    hr: 'Human Resources',
};

const moduleScreensMap: Record<keyof FeatureFlags, string[]> = {
    crm: ['Customer List', 'Customer Groups', 'Customer Credit Terms', 'Customer Ledger'],
    inventory: ['Stock Overview', 'Warehouses', 'Stock Transfers', 'Stock Counts', 'Analytics', 'Reports'],
    purchases: ['Purchase Overview', 'New Purchase', 'Invoices', 'Expense Purchases', 'Returns', 'Requisitions', 'RFQ', 'Orders', 'GRN', 'Payments', 'Control', 'Reports'],
    accounting: ['Chart of Accounts', 'Mappings', 'General Journal', 'General Ledger', 'Trial Balance', 'Profit & Loss', 'Balance Sheet', 'Bank Accounts', 'Bank Reconciliation', 'AR Aging', 'AP Aging'],
    pos: ['Terminal', 'Unposted Invoices', 'Hotkeys & Shortcuts', 'Hold & Resume', 'Management', 'Shift History', 'Receipt Printing', 'Happiness Price', 'Walk-in Customers'],
    reports: ['Sales Invoices', 'Item Price List', 'VAT', 'Inventory Stock', 'Purchase Reports', '...and more'],
    bom: ['Production Recipes'],
    production: ['Production Orders'],
    sales: ['Dashboard', 'Invoices', 'Quotations', 'Orders', 'Returns', 'Payments', 'Cash Management', 'Pricing', 'Logistics', 'Reports', '...and more'],
    items: ['Item List', 'Categories', 'Groups', 'Brands', 'Unit Management', 'Price Channels'],
    suppliers: ['Supplier List', 'Supplier Ledger'],
    hr: ['Employee Directory', 'Departments', 'Positions', 'Attendance', 'Leaves'],
};

export default function SuperAdminModules() {
    const queryClient = useQueryClient();
    const canReadTenants = useAuthStore((state) =>
        state.hasSuperAdminPermission(SUPER_ADMIN_PERMISSIONS.TENANTS_READ),
    );
    const canManageTenants = useAuthStore((state) =>
        state.hasSuperAdminPermission(SUPER_ADMIN_PERMISSIONS.TENANTS_MANAGE),
    );
    const [searchParams, setSearchParams] = useSearchParams();
    const tenantParam = searchParams.get('tenant') || '';
    const [draftFlags, setDraftFlags] = useState<FeatureFlags | null>(null);

    const { data: tenants = [], isLoading } = useQuery<Tenant[]>({
        queryKey: ['super-admin', 'tenants'],
        queryFn: () => fetchSuperAdminTenants(),
        enabled: canReadTenants,
    });

    const selectedTenant = useMemo(() => tenants.find((tenant: Tenant) => tenant.id === tenantParam) || null, [tenantParam, tenants]);

    const mutation = useMutation({
        mutationFn: ({ tenantId, flags }: { tenantId: string; flags: FeatureFlags }) => updateTenantFeatures(tenantId, flags),
        onSuccess: () => {
            toast.success('Module settings updated');
            queryClient.invalidateQueries({ queryKey: ['super-admin', 'tenants'] });
            queryClient.invalidateQueries({ queryKey: ['super-admin', 'audit'] });
        },
        onError: () => toast.error('Failed to update module settings'),
    });

    const currentFlags = draftFlags ?? selectedTenant?.featureFlags ?? null;
    const hasPendingChanges = Boolean(
        selectedTenant
        && currentFlags
        && (Object.keys(selectedTenant.featureFlags) as (keyof FeatureFlags)[]).some(
            (key) => currentFlags[key] !== selectedTenant.featureFlags[key],
        ),
    );

    if (!canReadTenants) {
        return (
            <SuperAdminAccessCard message="Your super admin role does not include tenant visibility." />
        );
    }

    return (
        <section className="rounded-2xl border border-border bg-background-card p-5">
            <h2 className="text-lg font-semibold text-text-primary">Module Controls</h2>
            <p className="text-xs text-text-tertiary">
                {canManageTenants ? 'Enable or disable modules per tenant.' : 'View current tenant module availability.'}
            </p>

            <div className="mt-4">
                <label className="text-xs text-text-secondary">Select Tenant</label>
                <AppDropdown
                    value={tenantParam}
                    onChange={(v) => { setSearchParams(v ? { tenant: v } : {}); setDraftFlags(null); }}
                    options={[{ value: '', label: 'Choose tenant...' }, ...tenants.map((tenant: Tenant) => ({ value: tenant.id, label: `${tenant.name} (${tenant.id.slice(-6)})` }))]}
                    placeholder='Choose tenant...'
                    searchable
                />
            </div>

            {isLoading && <p className="mt-4 text-sm text-text-tertiary">Loading tenants...</p>}

            {!isLoading && selectedTenant && currentFlags && (
                <div className="mt-4 space-y-3">
                    {(Object.keys(currentFlags) as (keyof FeatureFlags)[]).map((key) => (
                        <label key={key} className="flex items-start justify-between rounded-lg border border-border p-3 cursor-pointer hover:bg-slate-50 transition-colors">
                            <div className="flex flex-col gap-1 pr-4">
                                <span className="text-sm font-semibold text-text-primary">{featureLabelMap[key]}</span>
                                <span className="text-xs text-text-tertiary leading-relaxed">
                                    <span className="font-medium text-slate-500">Included Screens:</span> {moduleScreensMap[key].join(', ')}
                                </span>
                            </div>
                            <input
                                type="checkbox"
                                checked={currentFlags[key]}
                                onChange={() => {
                                    if (!canManageTenants) return;
                                    setDraftFlags((prev) => {
                                        const base = prev ?? selectedTenant?.featureFlags;
                                        if (!base) return prev;
                                        return { ...base, [key]: !base[key] };
                                    });
                                }}
                                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                                disabled={!canManageTenants}
                            />
                        </label>
                    ))}
                    {canManageTenants && (
                        <button
                            type="button"
                            onClick={() => mutation.mutate({ tenantId: selectedTenant.id, flags: currentFlags })}
                            disabled={mutation.isPending || !hasPendingChanges}
                            className="w-full rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                        >
                            {mutation.isPending ? 'Saving...' : 'Save Module Settings'}
                        </button>
                    )}
                </div>
            )}
        </section>
    );
}

