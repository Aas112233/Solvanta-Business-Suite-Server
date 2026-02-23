import { AsyncLocalStorage } from 'async_hooks';

/**
 * Global storage for tenant (company) context.
 * Allows the Prisma Client to automatically know the companyId
 * without passing it through every function call.
 */
export const tenantStorage = new AsyncLocalStorage<{
    companyId: string;
    userId?: string;
    activeBranchId?: string;
}>();

export const getTenant = () => tenantStorage.getStore();
export const getCompanyId = () => tenantStorage.getStore()?.companyId;
export const getUserId = () => tenantStorage.getStore()?.userId;
