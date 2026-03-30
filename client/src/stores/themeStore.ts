import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark';

const THEME_STORAGE_KEY = 'erp-theme';

function getSystemTheme(): ThemeMode {
    return 'light';
}

function readStoredTheme(): ThemeMode | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const storedTheme = parsed?.state?.theme;
        return storedTheme === 'dark' || storedTheme === 'light' ? storedTheme : null;
    } catch {
        return null;
    }
}

function applyThemeToDocument(theme: ThemeMode): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.setAttribute('data-theme', theme);
}

function getInitialTheme(): ThemeMode {
    return readStoredTheme() || getSystemTheme();
}

export function bootstrapTheme(): void {
    applyThemeToDocument(getInitialTheme());
}

interface ThemeState {
    theme: ThemeMode;
    setTheme: (theme: ThemeMode) => void;
    toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>()(
    persist(
        (set, get) => ({
            theme: getInitialTheme(),
            setTheme: (theme) => {
                set({ theme });
                applyThemeToDocument(theme);
            },
            toggleTheme: () => {
                const nextTheme: ThemeMode = get().theme === 'dark' ? 'light' : 'dark';
                set({ theme: nextTheme });
                applyThemeToDocument(nextTheme);
            },
        }),
        {
            name: THEME_STORAGE_KEY,
            partialize: (state) => ({ theme: state.theme }),
            onRehydrateStorage: () => (state) => {
                if (!state) {
                    applyThemeToDocument(getSystemTheme());
                    return;
                }
                applyThemeToDocument(state.theme);
            },
        }
    )
);
