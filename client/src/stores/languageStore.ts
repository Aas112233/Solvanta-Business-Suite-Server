import { create } from 'zustand';
import i18n from '../lib/i18n';

type Language = 'en' | 'bn';

interface LanguageState {
    language: Language;
    setLanguage: (lang: Language) => void;
}

export const useLanguageStore = create<LanguageState>((set) => ({
    language: (i18n.language as Language) || 'en',
    setLanguage: (lang) => {
        i18n.changeLanguage(lang);
        set({ language: lang });
    },
}));
