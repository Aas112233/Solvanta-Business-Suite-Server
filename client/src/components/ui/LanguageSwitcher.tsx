import { Globe } from 'lucide-react';
import { useLanguageStore } from '../../stores/languageStore';
import AppDropdown from '../ui/AppDropdown';
import { clsx } from 'clsx';

export default function LanguageSwitcher() {
    const { language, setLanguage } = useLanguageStore();

    const languageOptions = [
        { value: 'en', label: '🇬🇧 English' },
        { value: 'bn', label: '🇧🇩 বাংলা' },
    ];

    const currentLanguage = languageOptions.find((lang) => lang.value === language);

    return (
        <div className="relative">
            <div className="flex items-center gap-2">
                <Globe size={18} className="text-text-tertiary" />
                <div className="w-36">
                    <AppDropdown
                        value={language}
                        onChange={(value) => setLanguage(value as 'en' | 'bn')}
                        options={languageOptions}
                        placeholder="Select Language"
                        className="min-w-[140px]"
                    />
                </div>
            </div>
        </div>
    );
}
