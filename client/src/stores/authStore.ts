import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SuperAdminPermission } from '../lib/superAdminPermissions';

export interface EnabledModules {
    crm: boolean;
    inventory: boolean;
    purchases: boolean;
    accounting: boolean;
    pos: boolean;
    reports: boolean;
    bom: boolean;
    production: boolean;
    sales: boolean;
    items: boolean;
    suppliers: boolean;
    hr: boolean;
}

interface User {
    id: string;
    name: string;
    email: string;
    isSuperAdmin?: boolean;
    superAdminPermissions?: SuperAdminPermission[];
    enabledModules?: EnabledModules;
    impersonation?: {
        isActive: boolean;
        actorUserId: string;
        actorEmail: string;
        actorName: string;
        actorCompanyId: string;
        reason: string;
        startedAt: string;
        sessionId: string;
    } | null;
    company: { id: string; name: string; currency: string; logoUrl: string | null; setupCompleted: boolean };
    role: { id: string; name: string; permissions: string[] };
    branches: { id: string; name: string; code: string }[];
}

interface OriginalSession {
    token: string;
    refreshToken: string;
    user: User;
}

interface AuthState {
    token: string | null;
    refreshToken: string | null;
    user: User | null;
    originalSession: OriginalSession | null;
    activeBranchId: string | null;
    isAuthenticated: boolean;
    hasHydrated: boolean;

    setTokens: (token: string, refreshToken: string) => void;
    setUser: (user: User) => void;
    startImpersonation: (session: { token: string; refreshToken: string; user?: User | null }) => void;
    restoreOriginalSession: () => boolean;
    clearOriginalSession: () => void;
    setActiveBranch: () => void;
    setAuthenticated: (isAuthenticated: boolean) => void;
    setHydrated: (hydrated: boolean) => void;
    isSuperAdmin: () => boolean;
    isImpersonating: () => boolean;
    hasSuperAdminPermission: (permission: SuperAdminPermission) => boolean;
    hasAnySuperAdminPermission: (permissions: SuperAdminPermission[]) => boolean;
    hasPermission: (permission: string) => boolean;
    isModuleEnabled: (moduleKey: keyof EnabledModules) => boolean;
    logout: () => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            token: null,
            refreshToken: null,
            user: null,
            originalSession: null,
            activeBranchId: null,
            isAuthenticated: false,
            hasHydrated: false,

            setTokens: (token, refreshToken) => set({ token, refreshToken, isAuthenticated: true }),

            setUser: (user) => {
                const assignedBranchId = user.branches[0]?.id || null;
                set({
                    user,
                    activeBranchId: assignedBranchId,
                });
            },

            startImpersonation: ({ token, refreshToken, user }) => {
                const current = get();
                const originalSession = current.token && current.refreshToken && current.user
                    ? {
                        token: current.token,
                        refreshToken: current.refreshToken,
                        user: current.user,
                    }
                    : current.originalSession;

                set({
                    token,
                    refreshToken,
                    user: user || null,
                    originalSession,
                    activeBranchId: user?.branches?.[0]?.id || null,
                    isAuthenticated: true,
                });
            },

            restoreOriginalSession: () => {
                const originalSession = get().originalSession;
                if (!originalSession) return false;

                set({
                    token: originalSession.token,
                    refreshToken: originalSession.refreshToken,
                    user: originalSession.user,
                    originalSession: null,
                    activeBranchId: originalSession.user.branches[0]?.id || null,
                    isAuthenticated: true,
                });

                return true;
            },

            clearOriginalSession: () => set({ originalSession: null }),

            // Branch context is controlled by user assignment only (no manual switching).
            setActiveBranch: () => {
                const assignedBranchId = get().user?.branches?.[0]?.id || null;
                set({ activeBranchId: assignedBranchId });
            },
            setAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
            setHydrated: (hasHydrated) => set({ hasHydrated }),
            isSuperAdmin: () => Boolean(get().user?.isSuperAdmin),
            isImpersonating: () => Boolean(get().user?.impersonation?.isActive),
            hasSuperAdminPermission: (permission) => {
                const user = get().user;
                if (!user?.isSuperAdmin) return false;

                const permissions = user.superAdminPermissions || [];
                if (permissions.length === 0) return true;
                return permissions.includes(permission);
            },
            hasAnySuperAdminPermission: (permissions) => {
                const user = get().user;
                if (!user?.isSuperAdmin) return false;

                const currentPermissions = user.superAdminPermissions || [];
                if (currentPermissions.length === 0) return true;
                return permissions.some((permission) => currentPermissions.includes(permission));
            },

            hasPermission: (permission) => {
                const user = get().user;
                if (user?.isSuperAdmin) {
                    return true;
                }

                const perms = user?.role?.permissions || [];
                if (perms.includes('*')) return true;
                return perms.includes(permission);
            },

            isModuleEnabled: (moduleKey) => {
                const user = get().user;
                // Super admins always have all modules
                if (user?.isSuperAdmin) return true;
                // If no enabledModules data, default to all enabled
                if (!user?.enabledModules) return true;
                return user.enabledModules[moduleKey] !== false;
            },

            logout: () => set({
                token: null,
                refreshToken: null,
                user: null,
                originalSession: null,
                activeBranchId: null,
                isAuthenticated: false,
            }),
        }),
        {
            name: 'erp-auth',
            onRehydrateStorage: (initialState) => (state, error) => {
                const currentState = state || initialState;
                if (!currentState) return;

                if (error) {
                    currentState.setAuthenticated(false);
                    currentState.setHydrated(true);
                    return;
                }
                currentState.setAuthenticated(Boolean(currentState.token));
                currentState.setActiveBranch();
                currentState.setHydrated(true);
            },
            partialize: (state) => ({
                token: state.token,
                refreshToken: state.refreshToken,
                user: state.user,
                originalSession: state.originalSession,
            }),
        }
    )
);
