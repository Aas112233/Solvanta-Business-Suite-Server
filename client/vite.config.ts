import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

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
                        if (!id.includes('node_modules')) return undefined;
                        if (id.includes('react') || id.includes('scheduler')) return 'vendor-react';
                        if (id.includes('@tanstack')) return 'vendor-query';
                        if (id.includes('@react-pdf') || id.includes('jspdf') || id.includes('exceljs') || id.includes('html2canvas') || id.includes('jsbarcode')) {
                            return 'vendor-export';
                        }
                        if (id.includes('recharts')) return 'vendor-charts';
                        if (id.includes('lucide-react') || id.includes('react-icons')) return 'vendor-icons';
                        return 'vendor';
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
