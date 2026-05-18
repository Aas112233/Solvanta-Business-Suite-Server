import { X, Printer } from 'lucide-react';
import { printHtmlDocument } from '../../lib/fileExport';
import { formatCurrencyAmount, useCompanyCurrency } from '../../lib/companySettings';
import { useAuthStore } from '../../stores/authStore';

interface LabelPrintModalProps {
    isOpen: boolean;
    onClose: () => void;
    product: any;
}

export default function LabelPrintModal({ isOpen, onClose, product }: LabelPrintModalProps) {
    const currency = useCompanyCurrency();
    const companyName = useAuthStore((s) => s.user?.company?.name) || 'Company';

    if (!isOpen || !product) return null;

    const handlePrint = () => {
        const barcodeBars = [1, 2, 1, 3, 1, 1, 2, 1, 1, 4, 1, 2, 1]
            .map((w) => `<div style="background:#000;width:${w}px;height:100%;"></div>`)
            .join('');

        const html = `
            <div style="width:280px;border:1px solid #000;padding:14px;border-radius:8px;font-family:Arial,sans-serif;">
                <div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;">${String(companyName)}</div>
                <div style="font-size:14px;font-weight:800;text-transform:uppercase;line-height:1.2;margin-bottom:10px;">
                    ${String(product.name || '')}
                </div>
                <div style="border:1px solid #111;padding:12px 10px;display:flex;flex-direction:column;align-items:center;gap:4px;">
                    <div style="display:flex;gap:2px;height:40px;align-items:flex-end;">${barcodeBars}</div>
                    <div style="font-size:10px;font-family:monospace;font-weight:700;">${String(product.itemCode || '')}</div>
                </div>
                <div style="margin-top:12px;display:flex;justify-content:space-between;align-items:flex-end;">
                    <div>
                        <div style="font-size:9px;text-transform:uppercase;color:#334155;">Price (Incl. VAT)</div>
                        <div style="font-size:18px;font-weight:800;">
                            ${formatCurrencyAmount(product.salePrice || 0, currency)}
                        </div>
                    </div>
                    <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#475569;">
                        ${String(product.category?.name || 'GEN')}
                    </div>
                </div>
            </div>
        `;

        printHtmlDocument({
            documentTitle: `Label-${String(product.itemCode || 'item')}`,
            html,
            styles: '@page { size: auto; margin: 8mm; } body { margin: 0; padding: 0; }',
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-gray-100">
                    <h3 className="text-lg font-black text-gray-900 uppercase">Print Labels</h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-8 flex flex-col items-center gap-6">
                    {/* Preview of Label */}
                    <div className="w-64 border-2 border-dashed border-gray-200 p-4 rounded-lg bg-gray-50 flex flex-col items-center text-center">
                        <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{companyName}</div>
                        <div className="text-sm font-black text-gray-900 uppercase leading-tight line-clamp-2 mb-2">{product.name}</div>

                        {/* Mock Barcode */}
                        <div className="w-full bg-white border border-gray-100 py-4 flex flex-col items-center gap-1">
                            <div className="flex gap-0.5 h-10 items-end">
                                {[1, 2, 1, 3, 1, 1, 2, 1, 1, 4, 1, 2, 1].map((w, i) => (
                                    <div key={i} className="bg-black" style={{ width: `${w}px`, height: '100%' }}></div>
                                ))}
                            </div>
                            <div className="text-[9px] font-mono font-black text-gray-500 uppercase">{product.itemCode}</div>
                        </div>

                        <div className="mt-4 flex justify-between w-full items-end">
                            <div className="text-left">
                                <div className="text-[8px] font-bold text-gray-400 uppercase">Price (Incl. VAT)</div>
                                <div className="text-lg font-black text-blue-600">
                                    {formatCurrencyAmount(product.salePrice || 0, currency)}
                                </div>
                            </div>
                            <div className="text-right text-[10px] font-black text-gray-500 uppercase">{product.category?.name || 'GEN'}</div>
                        </div>
                    </div>

                    <p className="text-xs text-gray-400 text-center uppercase font-bold tracking-tight">
                        The label above is a preview. <br /> Clicking print will open the system dialog.
                    </p>

                    <button
                        onClick={handlePrint}
                        className="w-full py-4 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest text-sm hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
                    >
                        <Printer size={18} /> Print Now
                    </button>
                </div>
            </div>
        </div>
    );
}
