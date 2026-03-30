import axios from 'axios';
import { useAuthStore } from '../stores/authStore';

/**
 * API Configuration
 * - Development: Uses proxy to localhost:5001 (configured in vite.config.ts)
 * - Production: Uses environment variable or default production URL
 */

// Production backend URL (Render)
const PROD_API_BASE_URL = 'https://solvanta-business-suite-server.onrender.com/api/v1';

// Development backend URL (localhost)
const DEV_API_BASE_URL = '/api/v1'; // Uses Vite proxy

// Get configured API URL from environment
const configuredApiBaseURL = String(import.meta.env.VITE_API_BASE_URL || '').trim();

// Determine which API URL to use based on environment
const apiBaseURL = (() => {
    // If explicitly configured in environment, use that
    if (configuredApiBaseURL) {
        console.log('📡 Using custom API URL:', configuredApiBaseURL);
        return configuredApiBaseURL;
    }

    // Otherwise, use environment-based default
    const isProduction = import.meta.env.PROD;
    const apiUrl = isProduction ? PROD_API_BASE_URL : DEV_API_BASE_URL;

    console.log('📡 Using API URL:', apiUrl, `(${isProduction ? 'Production' : 'Development'})`);
    return apiUrl;
})();

/**
 * Join base URL and path, handling slashes properly
 */
function joinApiUrl(base: string, path: string) {
    const normalizedBase = base.replace(/\/+$/, '');
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${normalizedBase}${normalizedPath}`;
}

/**
 * Create axios instance with base configuration
 */
const api = axios.create({
    baseURL: apiBaseURL,
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000, // 30 second timeout
});

type RefreshPayload = {
    accessToken: string;
    refreshToken: string;
};

let refreshPromise: Promise<RefreshPayload> | null = null;

function isRefreshEndpoint(url?: string) {
    return String(url || '').includes('/auth/refresh');
}

async function runTokenRefresh(): Promise<RefreshPayload> {
    const currentRefreshToken = useAuthStore.getState().refreshToken;
    if (!currentRefreshToken) throw new Error('No refresh token');

    const { data } = await axios.post(joinApiUrl(apiBaseURL, '/auth/refresh'), { refreshToken: currentRefreshToken });
    const accessToken = data?.data?.accessToken ?? data?.data?.token;
    const refreshToken = data?.data?.refreshToken;

    if (!accessToken || !refreshToken) {
        throw new Error('Invalid refresh response');
    }

    useAuthStore.getState().setTokens(accessToken, refreshToken);
    return { accessToken, refreshToken };
}

async function refreshAccessTokenOnce(): Promise<RefreshPayload> {
    if (!refreshPromise) {
        refreshPromise = runTokenRefresh().finally(() => {
            refreshPromise = null;
        });
    }
    return refreshPromise;
}

export async function refreshSessionTokens(): Promise<boolean> {
    try {
        await refreshAccessTokenOnce();
        return true;
    } catch {
        return false;
    }
}

// Request interceptor — attach JWT
api.interceptors.request.use((config) => {
    const token = useAuthStore.getState().token;
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }

    const posSessionToken = sessionStorage.getItem('posSessionToken');
    if (posSessionToken) {
        config.headers['x-pos-session'] = posSessionToken;
    }

    return config;
});

// Response interceptor — handle 401 + token refresh
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest?._retry && !isRefreshEndpoint(originalRequest?.url)) {
            originalRequest._retry = true;

            try {
                const refreshed = await refreshAccessTokenOnce();
                if (!originalRequest.headers) {
                    originalRequest.headers = {};
                }
                originalRequest.headers.Authorization = `Bearer ${refreshed.accessToken}`;
                return api(originalRequest);
            } catch {
                useAuthStore.getState().logout();
                window.location.href = '/login';
            }
        }

        return Promise.reject(error);
    }
);

export default api;
