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

    const currentFlags = draftFlags || selectedTenant?.featureFlags || null;

    if (!canReadTenants) {
        return (
            <SuperAdminAccessCard message="Your super admin role does not include tenant visibility." />
        );
    }

    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-slate-900">Module Controls</h2>
            <p className="text-xs text-slate-500">
                {canManageTenants ? 'Enable or disable modules per tenant.' : 'View current tenant module availability.'}
            </p>

            <div className="mt-4">
                <label className="text-xs text-slate-600">Select Tenant</label>
                <AppDropdown
                    value={tenantParam}
                    onChange={(v) => { setSearchParams(v ? { tenant: v } : {}); setDraftFlags(null); }}
                    options={[{ value: '', label: 'Choose tenant...' }, ...tenants.map((tenant: Tenant) => ({ value: tenant.id, label: `${tenant.name} (${tenant.id.slice(-6)})` }))]}
                    placeholder='Choose tenant...'
                    searchable
                />
            </div>

            {isLoading && <p className="mt-4 text-sm text-slate-500">Loading tenants...</p>}

            {!isLoading && selectedTenant && currentFlags && (
                <div className="mt-4 space-y-3">
                    {(Object.keys(currentFlags) as (keyof FeatureFlags)[]).map((key) => (
                        <label key={key} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                            <span className="text-sm font-medium text-slate-800">{featureLabelMap[key]}</span>
                            <input
                                type="checkbox"
                                checked={currentFlags[key]}
                                onChange={() => {
                                    if (!canManageTenants) return;
                                    setDraftFlags((prev) => {
                                        if (!prev) return prev;
                                        return { ...prev, [key]: !prev[key] };
                                    });
                                }}
                                className="h-4 w-4"
                                disabled={!canManageTenants}
                            />
                        </label>
                    ))}
                    {canManageTenants && (
                        <button
                            type="button"
                            onClick={() => mutation.mutate({ tenantId: selectedTenant.id, flags: currentFlags })}
                            disabled={mutation.isPending}
                            className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                        >
                            Save Module Settings
                        </button>
                    )}
                </div>
            )}
        </section>
    );
}

