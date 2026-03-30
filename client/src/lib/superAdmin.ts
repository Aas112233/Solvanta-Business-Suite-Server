import { useAuthStore } from '../stores/authStore';

function parseSuperAdminEmails(raw: string | undefined) {
    if (!raw) return [];
    return raw
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean);
}

export function isCurrentUserSuperAdmin() {
    const userEmail = useAuthStore.getState().user?.email?.toLowerCase();
    if (!userEmail) return false;

    const allowList = parseSuperAdminEmails(import.meta.env.VITE_SUPER_ADMIN_EMAILS);
    if (allowList.length === 0) return false;
    return allowList.includes(userEmail);
}

