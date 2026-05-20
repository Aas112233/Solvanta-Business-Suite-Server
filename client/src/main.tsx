import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './lib/i18n';
import './index.css';
import { bootstrapTheme } from './stores/themeStore';
import { installGlobalAutofillBlocker } from './lib/disableAutofill';

bootstrapTheme();
const teardownAutofillBlocker = installGlobalAutofillBlocker();

if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        teardownAutofillBlocker();
    });
}

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 5 * 60 * 1000, // Data is fresh for 5 minutes
            gcTime: 10 * 60 * 1000, // Cache persists for 10 minutes
            retry: 1,
            refetchOnWindowFocus: false,
            refetchOnMount: false, // Don't refetch on component mount if data exists
        },
    },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>
                <App />
                <Toaster
                    position="top-right"
                    toastOptions={{
                        style: {
                            background: 'var(--color-bg-card)',
                            color: 'var(--color-text-primary)',
                            border: '1px solid var(--color-border)',
                        },
                        duration: 3000,
                    }}
                />
            </BrowserRouter>
        </QueryClientProvider>
    </React.StrictMode>
);
