import jsPDF from 'jspdf';
import { pdf } from '@react-pdf/renderer';
import { downloadExcelReport, type ExcelReportOptions } from './excelReport';

export type { ExcelReportOptions } from './excelReport';

export async function exportExcel(options: ExcelReportOptions): Promise<void> {
    await downloadExcelReport(options);
}

interface PdfFromHtmlOptions {
    fileName: string;
    html: string;
    styles?: string;
    documentTitle?: string;
    orientation?: 'portrait' | 'landscape';
    format?: string;
    scale?: number;
    marginMm?: number;
}

export async function exportPdfFromHtml(options: PdfFromHtmlOptions): Promise<void> {
    const doc = new jsPDF({
        orientation: options.orientation || 'portrait',
        unit: 'mm',
        format: options.format || 'a4',
    });
    const pageWidthMm = doc.internal.pageSize.getWidth();
    const pageHeightMm = doc.internal.pageSize.getHeight();
    const marginMm = typeof options.marginMm === 'number' ? Math.max(0, options.marginMm) : 8;
    const contentWidthMm = Math.max(10, pageWidthMm - (marginMm * 2));
    const contentHeightMm = Math.max(10, pageHeightMm - (marginMm * 2));
    const mmToPx = (mm: number) => Math.round((mm / 25.4) * 96);
    const contentWidthPx = mmToPx(contentWidthMm);
    const contentHeightPx = mmToPx(contentHeightMm);

    const replaceCssFunctionCalls = (
        input: string,
        functionNames: string[],
        replacement: string
    ): string => {
        if (!input) return input;
        const names = functionNames.map((name) => name.toLowerCase());
        let output = '';
        let index = 0;

        while (index < input.length) {
            let replaced = false;

            for (const name of names) {
                const slice = input.slice(index);
                if (!slice.toLowerCase().startsWith(name)) continue;

                let cursor = index + name.length;
                while (cursor < input.length && /\s/.test(input[cursor])) cursor += 1;
                if (input[cursor] !== '(') continue;

                let depth = 0;
                let end = cursor;
                while (end < input.length) {
                    const ch = input[end];
                    if (ch === '(') depth += 1;
                    else if (ch === ')') {
                        depth -= 1;
                        if (depth === 0) {
                            end += 1;
                            break;
                        }
                    }
                    end += 1;
                }

                output += replacement;
                index = end;
                replaced = true;
                break;
            }

            if (!replaced) {
                output += input[index];
                index += 1;
            }
        }

        return output;
    };

    const sanitizeCssColorFns = (input: string): string =>
        replaceCssFunctionCalls(input, ['oklch', 'lab', 'lch', 'color-mix', 'color', 'light-dark'], '#000000');

    const safeStyles = sanitizeCssColorFns(options.styles || '');
    const safeHtml = sanitizeCssColorFns(options.html || '');

    // Render in an isolated document so html2canvas doesn't parse app-level theme CSS.
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.left = '-99999px';
    iframe.style.top = '0';
    iframe.style.width = `${Math.max(1200, contentWidthPx + 320)}px`;
    iframe.style.height = `${Math.max(1200, contentHeightPx + 320)}px`;
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentDocument;
    if (!iframeDoc) {
        document.body.removeChild(iframe);
        throw new Error('Failed to initialize export document');
    }

    iframeDoc.open();
    iframeDoc.write(`
        <!doctype html>
        <html>
        <head>
            <meta charset="utf-8" />
            <style>
                html, body { margin: 0; padding: 0; background: #ffffff; color: #111827; }
                *, *::before, *::after {
                    color: inherit;
                    border-color: #e5e7eb;
                    box-sizing: border-box;
                }
            </style>
            ${safeStyles ? `<style>${safeStyles}</style>` : ''}
        </head>
        <body>
            <div id="export-root" style="width: ${contentWidthPx}px;">${safeHtml}</div>
        </body>
        </html>
    `);
    iframeDoc.close();

    const root = iframeDoc.getElementById('export-root');
    if (!root) {
        document.body.removeChild(iframe);
        throw new Error('Failed to render export content');
    }

    const sanitizeElementStyles = (element: HTMLElement): void => {
        // 1. Clean inline style attributes (string based)
        const currentStyle = element.getAttribute('style');
        if (currentStyle) {
            const cleaned = sanitizeCssColorFns(currentStyle);
            if (cleaned !== currentStyle) {
                element.setAttribute('style', cleaned);
            }
        }

        // 2. Clean computed styles that might use modern CSS colors (browser-resolved)
        // html2canvas crashes on oklch(), color(), etc.
        const win = element.ownerDocument?.defaultView || window;
        const computed = win.getComputedStyle(element);
        const colorProps = ['color', 'backgroundColor', 'borderColor', 'outlineColor'];

        for (const prop of colorProps) {
            const val = computed[prop as any];
            if (val && (val.includes('oklch') || val.includes('color(') || val.includes('lab(') || val.includes('lch('))) {
                // If the browser resolved a color to oklch, html2canvas will crash.
                // We force a safe fallback via inline style.
                if (prop === 'backgroundColor') {
                    // Try to detect if it's likely transparent or white
                    if (val.includes('0%') || val.includes('none')) {
                        element.style.backgroundColor = 'transparent';
                    } else {
                        element.style.backgroundColor = '#ffffff';
                    }
                } else if (prop === 'color') {
                    element.style.color = '#111827';
                } else if (prop === 'borderColor') {
                    element.style.borderColor = '#e5e7eb';
                }
            }
        }
    };

    // Apply sanitization to the root and all children
    sanitizeElementStyles(root);
    root.querySelectorAll<HTMLElement>('*').forEach((node) => sanitizeElementStyles(node));
    const renderWidthPx = Math.max(contentWidthPx, Math.ceil(root.scrollWidth || 0));
    root.style.width = `${renderWidthPx}px`;

    try {
        await new Promise<void>((resolve) => {
            doc.html(root, {
                x: marginMm,
                y: marginMm,
                width: contentWidthMm,
                windowWidth: renderWidthPx,
                autoPaging: 'text',
                html2canvas: {
                    scale: options.scale ?? 1,
                    useCORS: true,
                    backgroundColor: '#ffffff',
                },
                callback: (pdf) => {
                    pdf.save(options.fileName.toLowerCase().endsWith('.pdf') ? options.fileName : `${options.fileName}.pdf`);
                    resolve();
                },
            });
        });
    } finally {
        document.body.removeChild(iframe);
    }
}

export async function downloadPdfFromComponent(fileName: string, component: any): Promise<void> {
    const blob = await pdf(component).toBlob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName.toLowerCase().endsWith('.pdf') ? fileName : `${fileName}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

export async function printPdfFromComponent(component: any): Promise<void> {
    const blob = await pdf(component).toBlob();
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = url;
    document.body.appendChild(iframe);
    iframe.onload = () => {
        iframe.contentWindow?.print();
        setTimeout(() => {
            URL.revokeObjectURL(url);
            document.body.removeChild(iframe);
        }, 5000); // Leave some time for printer spooling
    };
}

interface PrintHtmlOptions {
    html: string;
    styles?: string;
    documentTitle?: string;
}

export function printHtmlDocument(options: PrintHtmlOptions): void {
    const printWindow = window.open('', '_blank', 'width=1024,height=900');
    if (!printWindow) {
        throw new Error('Popup blocked');
    }

    const documentTitle = options.documentTitle || 'Document';
    const fullHtml = `
        <!doctype html>
        <html>
        <head>
            <meta charset="utf-8" />
            <title>${documentTitle}</title>
            ${options.styles ? `<style>${options.styles}</style>` : ''}
        </head>
        <body>
            ${options.html}
        </body>
        </html>
    `;

    printWindow.document.open();
    printWindow.document.write(fullHtml);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 350);
}
