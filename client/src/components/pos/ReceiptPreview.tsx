import { useEffect, useRef } from 'react';
import {
    buildPosReceiptPrintDocument,
    PosReceiptData,
    PosReceiptSettings
} from '../../lib/posReceiptTemplates';
import { useAuthStore } from '../../stores/authStore';
import { DEFAULT_CURRENCY } from '../../lib/constants';

interface ReceiptPreviewProps {
    receipt: PosReceiptData;
    settings: PosReceiptSettings;
    width?: string;
    height?: string;
}

export default function ReceiptPreview({ receipt, settings, width, height }: ReceiptPreviewProps) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const companyName = useAuthStore((s) => s.user?.company?.name) || 'SOLVANTA ERP';
    const currency = useAuthStore((s) => s.user?.company?.currency) || DEFAULT_CURRENCY;

    const { html, styles } = buildPosReceiptPrintDocument({
        receipt,
        settings,
        companyName,
        currency,
    });

    useEffect(() => {
        if (!iframeRef.current) return;

        const doc = iframeRef.current.contentDocument;
        if (!doc) return;

        const fullHtml = `
            <!DOCTYPE html>
            <html>
                <head>
                    <style>
                        ${styles}
                        body { 
                            background: white; 
                            display: flex; 
                            justify-content: center; 
                            padding: 0;
                            margin: 0;
                            overflow-x: hidden;
                        }
                        /* Override for preview mode to remove margins that are for physical printing */
                        @page { margin: 0; }
                    </style>
                </head>
                <body>
                    ${html}
                </body>
            </html>
        `;

        doc.open();
        doc.write(fullHtml);
        doc.close();
    }, [html, styles]);

    const defaultWidth = settings.paperWidth === '58MM' ? '230px' : '320px';

    return (
        <div className="flex justify-center w-full">
            <iframe
                ref={iframeRef}
                title="Receipt Preview"
                style={{
                    width: width || defaultWidth,
                    height: height || '800px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    backgroundColor: 'white'
                }}
            />
        </div>
    );
}
