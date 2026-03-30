import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
    id: string;
    name: string;
    email: string;
    isSuperAdmin?: boolean;
    company: { id: string; name: string; currency: string; logoUrl: string | null; setupCompleted: boolean };
    role: { id: string; name: string; permissions: string[] };
    branches: { id: string; name: string; code: string }[];
}

interface AuthState {
    token: string | null;
    refreshToken: string | null;
    user: User | null;
    activeBranchId: string | null;
    isAuthenticated: boolean;
    hasHydrated: boolean;

    setTokens: (token: string, refreshToken: string) => void;
    setUser: (user: User) => void;
    setActiveBranch: () => void;
    setAuthenticated: (isAuthenticated: boolean) => void;
    setHydrated: (hydrated: boolean) => void;
    hasPermission: (permission: string) => boolean;
    logout: () => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            token: null,
            refreshToken: null,
            user: null,
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

            // Branch context is controlled by user assignment only (no manual switching).
            setActiveBranch: () => {
                const assignedBranchId = get().user?.branches?.[0]?.id || null;
                set({ activeBranchId: assignedBranchId });
            },
            setAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
            setHydrated: (hasHydrated) => set({ hasHydrated }),

            hasPermission: (permission) => {
                const user = get().user;
                if (user?.isSuperAdmin) {
                    return true;
                }
                // Super Admins override all permissions locally
                if (user?.email) {
                    const allowList = (import.meta.env.VITE_SUPER_ADMIN_EMAILS || '')
                        .split(',')
                        .map((email: string) => email.trim().toLowerCase())
                        .filter(Boolean);
                    if (allowList.includes(user.email.toLowerCase())) {
                        return true;
                    }
                }
                
                const perms = user?.role?.permissions || [];
                // Check for master permission (any module.access)
                const module = permission.split('.')[0];
                if (perms.includes(`${module}.access`)) return true;
                return perms.includes(permission);
            },

            logout: () => set({
                token: null,
                refreshToken: null,
                user: null,
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
            }),
        }
    )
);
