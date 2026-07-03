import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getNodeModulePackageName(id: string) {
    const normalizedId = id.replaceAll('\\', '/');
    const nodeModulesIndex = normalizedId.lastIndexOf('/node_modules/');
    if (nodeModulesIndex === -1) return null;

    const packagePath = normalizedId.slice(nodeModulesIndex + '/node_modules/'.length);
    const [scopeOrName, maybeName] = packagePath.split('/');

    if (!scopeOrName) return null;
    return scopeOrName.startsWith('@') && maybeName ? `${scopeOrName}/${maybeName}` : scopeOrName;
}

function getVendorChunkName(packageName: string) {
    // Large, core frameworks — keep separate for optimal caching
    if (packageName === 'react' || packageName === 'react-dom' || packageName === 'scheduler') {
        return 'vendor-react-core';
    }

    if (packageName.startsWith('@react-pdf/')) {
        return 'vendor-react-pdf';
    }

    if (packageName.startsWith('@tanstack/')) {
        return 'vendor-tanstack';
    }

    if (packageName.startsWith('d3-')) {
        return 'vendor-d3';
    }

    // Group smaller packages into logical bundles to reduce HTTP requests
    const UI_PACKAGES = new Set([
        'lucide-react', 'clsx', 'react-hot-toast', 'class-variance-authority',
    ]);
    if (UI_PACKAGES.has(packageName)) {
        return 'vendor-ui';
    }

    const FORM_PACKAGES = new Set([
        'react-hook-form', '@hookform/resolvers', 'zod',
    ]);
    if (FORM_PACKAGES.has(packageName) || packageName.startsWith('@hookform/')) {
        return 'vendor-forms';
    }

    const UTIL_PACKAGES = new Set([
        'date-fns', 'axios', 'jsbarcode', 'i18next', 'react-i18next',
        'i18next-browser-languagedetector', 'zustand',
    ]);
    if (UTIL_PACKAGES.has(packageName)) {
        return 'vendor-utils';
    }

    // recharts is large (~200KB) and only used on analytics pages — separate chunk
    if (packageName === 'recharts') {
        return 'vendor-charts';
    }

    // PDF/Excel generation (lazy-loaded at runtime, but include in case of static imports)
    if (packageName === 'jspdf' || packageName === 'exceljs' || packageName === 'xlsx') {
        return 'vendor-docs';
    }

    // Everything else goes to a shared vendor chunk
    return 'vendor-shared';
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, __dirname, '');
    const configuredPort = Number(env.VITE_DEV_SERVER_PORT || '3001');
    const devServerPort = Number.isFinite(configuredPort) ? configuredPort : 3001;
    const devApiProxyTarget = env.VITE_DEV_API_PROXY || 'http://localhost:5001';
    const configuredBasePath = String(env.VITE_APP_BASE_PATH || '/').trim();
    const appBasePath = configuredBasePath.endsWith('/') ? configuredBasePath : `${configuredBasePath}/`;

    return {
        base: appBasePath,
        plugins: [react(), tailwindcss()],
        resolve: {
            alias: {
                '@': path.resolve(__dirname, './src'),
            },
        },
        build: {
            chunkSizeWarningLimit: 1000,
            minify: 'terser',
            terserOptions: {
                compress: {
                    drop_console: mode === 'production',
                    drop_debugger: mode === 'production',
                },
            },
            rollupOptions: {
                output: {
                    manualChunks(id) {
                        const packageName = getNodeModulePackageName(id);
                        if (!packageName) return undefined;
                        return getVendorChunkName(packageName);
                    },
                },
            },
        },
        server: {
            port: devServerPort,
            host: true,
            proxy: {
                '/api': {
                    target: devApiProxyTarget,
                    changeOrigin: true,
                },
            },
        },
    };
});
