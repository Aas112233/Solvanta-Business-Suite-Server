import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

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

    return `vendor-${packageName.replace('@', '').replaceAll('/', '-')}`;
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
