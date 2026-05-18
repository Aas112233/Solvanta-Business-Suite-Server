import { Font } from '@react-pdf/renderer';
import notoSansRegular from '../assets/fonts/NotoSans-Regular.ttf';
import notoSansBold from '../assets/fonts/NotoSans-Bold.ttf';
import notoSansArabicRegular from '../assets/fonts/NotoSansArabic-Regular.ttf';
import notoSansArabicBold from '../assets/fonts/NotoSansArabic-Bold.ttf';
import notoSansBengaliRegular from '../assets/fonts/NotoSansBengali-Regular.ttf';
import notoSansBengaliBold from '../assets/fonts/NotoSansBengali-Bold.ttf';

const FONT_FAMILIES = {
    default: 'SolvantaPdfNotoSans',
    arabic: 'SolvantaPdfNotoSansArabic',
    bengali: 'SolvantaPdfNotoSansBengali',
} as const;

const ARABIC_TEXT_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
const BENGALI_TEXT_RE = /[\u0980-\u09FF]/;

let fontsRegistered = false;

export const PDF_BASE_FONT_FAMILY = FONT_FAMILIES.default;

export function ensurePdfFontsRegistered(): void {
    if (fontsRegistered) return;

    Font.register({
        family: FONT_FAMILIES.default,
        fonts: [
            { src: notoSansRegular, fontWeight: 'normal' },
            { src: notoSansBold, fontWeight: 'bold' },
        ],
    });

    Font.register({
        family: FONT_FAMILIES.arabic,
        fonts: [
            { src: notoSansArabicRegular, fontWeight: 'normal' },
            { src: notoSansArabicBold, fontWeight: 'bold' },
        ],
    });

    Font.register({
        family: FONT_FAMILIES.bengali,
        fonts: [
            { src: notoSansBengaliRegular, fontWeight: 'normal' },
            { src: notoSansBengaliBold, fontWeight: 'bold' },
        ],
    });

    fontsRegistered = true;
}

export function getPdfFontFamily(value: unknown): string {
    const text = String(value ?? '');
    if (!text) return FONT_FAMILIES.default;
    if (ARABIC_TEXT_RE.test(text)) return FONT_FAMILIES.arabic;
    if (BENGALI_TEXT_RE.test(text)) return FONT_FAMILIES.bengali;
    return FONT_FAMILIES.default;
}

export function getPdfTextStyle(value: unknown): { fontFamily: string } {
    ensurePdfFontsRegistered();
    return { fontFamily: getPdfFontFamily(value) };
}
