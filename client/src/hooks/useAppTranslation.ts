import { useTranslation } from 'react-i18next';

/**
 * Custom hook for using translations with type safety
 * @returns Translation function and i18n instance
 * 
 * @example
 * const { t } = useAppTranslation();
 * <h1>{t('app.welcome')}</h1>
 */
export function useAppTranslation() {
    const { t, i18n } = useTranslation();
    return {
        t,
        i18n,
        language: i18n.language,
    };
}
