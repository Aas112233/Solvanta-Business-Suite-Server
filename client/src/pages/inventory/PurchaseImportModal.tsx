import { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
    AlertCircle,
    CheckCircle2,
    Download,
    FileSpreadsheet,
    Loader2,
    Upload,
    X,
} from 'lucide-react';
import api from '../../lib/api';
import toast from '@/lib/toast';
import { resolveEffectiveTaxRate, useCompanyTaxSettings } from '../../lib/tax';

const MAX_FILE_BYTES = 10 * 1024 * 1024;

type PurchaseFormImportItem = {
    productId: string;
    productName?: string;
    unitCode: string;
    qty: number;
    unitCost: number;
    lineTotal: number;
    taxRate?: number;
    product?: any;
};

interface ParsedImportRow {
    rowNumber: number;
    itemCode: string;
    unitCode: string;
    qty: number | '';
    unitCost: number | '';
    note: string;
    _rowErrors: string[];
}

interface ResolvedImportRow extends ParsedImportRow {
    productId?: string;
    productName?: string;
    unitName?: string;
    resolvedUnitCode?: string;
    resolvedUnitCost?: number;
    taxRate?: number;
    product?: any;
}

interface ResolvedProduct {
    id: string;
    itemCode: string;
    name: string;
    nameArabic?: string | null;
    taxRate?: number | null;
    tax?: { id?: string; rate?: number | null; name?: string | null } | null;
    units?: Array<{
        id?: string;
        unitCode: string;
        unitName?: string | null;
        qtyInBaseUnit?: number | null;
        costPrice?: number | null;
        salePrice?: number | null;
        isBase?: boolean | null;
    }>;
}

interface PurchaseImportModalProps {
    onClose: () => void;
    onImport: (items: PurchaseFormImportItem[]) => void;
}

const COLUMNS = ['itemCode', 'unitCode', 'qty', 'unitCost', 'note'] as const;
type ColumnKey = (typeof COLUMNS)[number];

const HEADER_ALIASES: Record<ColumnKey, string[]> = {
    itemCode: ['item code', 'itemcode', 'product code', 'code'],
    unitCode: ['unit code', 'unit', 'barcode', 'primary barcode'],
    qty: ['qty', 'quantity'],
    unitCost: ['unit cost', 'cost', 'cost price', 'purchase cost'],
    note: ['note', 'notes', 'remark', 'remarks'],
};

const NUMERIC_KEYS = new Set<ColumnKey>(['qty', 'unitCost']);

function normalizeHeader(value: unknown): string {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/[%()[\]_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeCode(value: unknown): string {
    return String(value ?? '').trim().toUpperCase();
}

function normalizeNumericText(value: string): string {
    return value
        .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
        .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
        .replace(/[\u066C\u060C]/g, ',')
        .replace(/\u066B/g, '.')
        .replace(/[^\d,.\-]/g, '');
}

function parseExcelNumber(value: unknown): number | '' {
    if (value == null) return '';
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;

    const raw = String(value).trim();
    if (!raw) return '';

    let normalized = normalizeNumericText(raw);
    if (!normalized) return '';

    const hasComma = normalized.includes(',');
    const hasDot = normalized.includes('.');

    if (hasComma && hasDot) {
        const lastComma = normalized.lastIndexOf(',');
        const lastDot = normalized.lastIndexOf('.');
        if (lastComma > lastDot) {
            normalized = normalized.replace(/\./g, '').replace(',', '.');
        } else {
            normalized = normalized.replace(/,/g, '');
        }
    } else if (hasComma) {
        normalized = /^\d{1,3}(,\d{3})+$/.test(normalized)
            ? normalized.replace(/,/g, '')
            : normalized.replace(',', '.');
    } else if ((normalized.match(/\./g) || []).length > 1 && /^\d{1,3}(\.\d{3})+$/.test(normalized)) {
        normalized = normalized.replace(/\./g, '');
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : NaN;
}

function resolveColumnIndexes(headerRow: any[]): number[] {
    const normalizedHeader = headerRow.map((cell) => normalizeHeader(cell));
    return COLUMNS.map((key, fallbackIndex) => {
        const matchedIndex = normalizedHeader.findIndex((header) => HEADER_ALIASES[key].includes(header));
        return matchedIndex >= 0 ? matchedIndex : fallbackIndex;
    });
}

function parseSheet(sheet: XLSX.WorkSheet): ParsedImportRow[] {
    const raw = XLSX.utils.sheet_to_json<any>(sheet, { header: 1, defval: '' });
    const headerRow = raw[0] || [];
    const columnIndexes = resolveColumnIndexes(headerRow);

    return raw
        .slice(1)
        .filter((row: any[]) => row.some((cell: any) => String(cell).trim() !== ''))
        .map((row: any[], index: number) => {
            const mapped: Record<string, unknown> = {};
            COLUMNS.forEach((key, columnIndex) => {
                const sourceValue = row[columnIndexes[columnIndex]] ?? '';
                mapped[key] = NUMERIC_KEYS.has(key) ? parseExcelNumber(sourceValue) : sourceValue;
            });

            const errors: string[] = [];
            const itemCode = normalizeCode(mapped.itemCode);
            const unitCode = normalizeCode(mapped.unitCode);
            const qty = mapped.qty as number | '';
            const unitCost = mapped.unitCost as number | '';

            if (!/^\d{1,32}$/.test(itemCode)) {
                errors.push('Item Code must be 1-32 digits');
            }
            if (qty === '' || Number.isNaN(Number(qty)) || Number(qty) <= 0) {
                errors.push('Qty must be a positive number');
            }
            if (unitCost !== '' && (Number.isNaN(Number(unitCost)) || Number(unitCost) < 0)) {
                errors.push('Unit Cost must be blank or a non-negative number');
            }

            return {
                rowNumber: index + 2,
                itemCode,
                unitCode,
                qty,
                unitCost,
                note: String(mapped.note ?? '').trim(),
                _rowErrors: errors,
            };
        });
}

export default function PurchaseImportModal({ onClose, onImport }: PurchaseImportModalProps) {
    const companyTax = useCompanyTaxSettings();
    const fileRef = useRef<HTMLInputElement>(null);
    const [fileName, setFileName] = useState('');
    const [rows, setRows] = useState<ResolvedImportRow[]>([]);
    const [parseError, setParseError] = useState('');
    const [isResolving, setIsResolving] = useState(false);
    const [isImporting, setIsImporting] = useState(false);

    const validRows = useMemo(() => rows.filter((row) => row._rowErrors.length === 0), [rows]);
    const invalidRows = useMemo(() => rows.filter((row) => row._rowErrors.length > 0), [rows]);

    const handleDownloadTemplate = () => {
        const workbook = XLSX.utils.book_new();
        const rowsForSheet = [
            ['Item Code', 'Unit Code', 'Qty', 'Unit Cost', 'Note'],
            ['0000000000000001', 'PCS', 10, 5.5, 'Leave Unit Cost blank to use current unit cost'],
            ['0000000000000002', 'BOX', 2, '', 'Unit Code optional: base unit will be used if blank'],
        ];
        const worksheet = XLSX.utils.aoa_to_sheet(rowsForSheet);
        worksheet['!cols'] = [
            { wch: 18 },
            { wch: 16 },
            { wch: 12 },
            { wch: 14 },
            { wch: 44 },
        ];
        XLSX.utils.book_append_sheet(workbook, worksheet, 'PurchaseItems');
        XLSX.writeFile(workbook, 'purchase-items-import-template.xlsx');
    };

    const resolveRows = async (parsedRows: ParsedImportRow[]) => {
        const itemCodes = Array.from(new Set(parsedRows.map((row) => row.itemCode).filter(Boolean)));
        if (itemCodes.length === 0) {
            setRows(parsedRows);
            return;
        }

        setIsResolving(true);
        try {
            const response = await api.post('/products/import-resolve', { itemCodes });
            const products: ResolvedProduct[] = Array.isArray(response.data?.data) ? response.data.data : [];
            const productMap = new Map<string, ResolvedProduct>(products.map((product) => [normalizeCode(product.itemCode), product]));

            const resolvedRows = parsedRows.map((row) => {
                const nextRow: ResolvedImportRow = { ...row };
                const product = productMap.get(row.itemCode);
                if (!product) {
                    nextRow._rowErrors = [...nextRow._rowErrors, `Item ${row.itemCode} was not found`];
                    return nextRow;
                }

                const unit = row.unitCode
                    ? product.units?.find((candidate: any) => normalizeCode(candidate.unitCode) === row.unitCode)
                    : product.units?.find((candidate: any) => candidate.isBase) || product.units?.[0];

                if (!unit) {
                    nextRow._rowErrors = [...nextRow._rowErrors, 'This item has no units configured'];
                    return nextRow;
                }

                if (row.unitCode && normalizeCode(unit.unitCode) !== row.unitCode) {
                    nextRow._rowErrors = [...nextRow._rowErrors, `Unit ${row.unitCode} was not found for item ${row.itemCode}`];
                    return nextRow;
                }

                const resolvedUnitCost = row.unitCost === '' ? Number(unit.costPrice || 0) : Number(row.unitCost);
                if (!Number.isFinite(resolvedUnitCost) || resolvedUnitCost < 0) {
                    nextRow._rowErrors = [...nextRow._rowErrors, 'Resolved unit cost is invalid'];
                    return nextRow;
                }

                return {
                    ...nextRow,
                    productId: product.id,
                    productName: product.name,
                    unitName: unit.unitName || unit.unitCode,
                    resolvedUnitCode: unit.unitCode,
                    resolvedUnitCost,
                    taxRate: resolveEffectiveTaxRate([product.tax?.rate, product.taxRate], companyTax),
                    product,
                };
            });

            setRows(resolvedRows);
        } catch (error: any) {
            toast.error(error.response?.data?.error?.message || 'Failed to resolve items from Excel');
        } finally {
            setIsResolving(false);
        }
    };

    const handleFile = async (file: File) => {
        if (!file) return;

        setParseError('');
        setRows([]);

        const ext = file.name.split('.').pop()?.toLowerCase();
        if (ext !== 'xlsx') {
            toast.error('Only .xlsx files are supported');
            return;
        }
        if (file.size > MAX_FILE_BYTES) {
            toast.error('File is too large. Maximum allowed is 10 MB.');
            return;
        }

        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const workbook = XLSX.read(event.target?.result, { type: 'array' });
                const worksheet = workbook.Sheets['PurchaseItems'] ?? workbook.Sheets[workbook.SheetNames[0]];
                if (!worksheet) {
                    setParseError('The Excel file has no readable worksheet.');
                    return;
                }

                const parsedRows = parseSheet(worksheet);
                if (parsedRows.length === 0) {
                    setParseError('No data rows found in the worksheet.');
                    return;
                }

                await resolveRows(parsedRows);
            } catch (error: any) {
                setParseError(error?.message || 'Failed to parse the Excel file');
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleImport = () => {
        if (validRows.length === 0) {
            toast.error('There are no valid rows to import');
            return;
        }

        setIsImporting(true);
        const importedItems: PurchaseFormImportItem[] = validRows.map((row) => {
            const qty = Number(row.qty || 0);
            const unitCost = Number(row.resolvedUnitCost || 0);
            return {
                productId: String(row.productId || ''),
                productName: row.productName || '',
                unitCode: row.resolvedUnitCode || row.unitCode || '',
                qty,
                unitCost,
                lineTotal: qty * unitCost,
                taxRate: row.taxRate,
                product: row.product,
            };
        });

        onImport(importedItems);
        setIsImporting(false);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-5xl rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">Import Purchase Items from Excel</h2>
                        <p className="text-sm text-gray-500">Download the template, fill item codes and quantities, then import into this purchase form.</p>
                    </div>
                    <button onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                        <X size={18} />
                    </button>
                </div>

                <div className="space-y-6 p-6">
                    <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 md:flex-row md:items-center md:justify-between">
                        <div className="space-y-1">
                            <div className="text-sm font-semibold text-gray-900">Template Columns</div>
                            <div className="text-xs text-gray-500">`Item Code`, `Unit Code`, `Qty`, `Unit Cost`, `Note`</div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={handleDownloadTemplate}
                                className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                            >
                                <Download size={15} /> Download Template
                            </button>
                            <button
                                type="button"
                                onClick={() => fileRef.current?.click()}
                                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                            >
                                <Upload size={15} /> Choose Excel File
                            </button>
                            <input
                                ref={fileRef}
                                type="file"
                                accept=".xlsx"
                                className="hidden"
                                onChange={(event) => {
                                    if (event.target.files?.[0]) {
                                        void handleFile(event.target.files[0]);
                                    }
                                    event.target.value = '';
                                }}
                            />
                        </div>
                    </div>

                    {parseError && (
                        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            {parseError}
                        </div>
                    )}

                    {fileName && (
                        <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600">
                            <FileSpreadsheet size={14} className="text-emerald-600" />
                            {fileName}
                        </div>
                    )}

                    {isResolving && (
                        <div className="flex h-48 items-center justify-center gap-3 rounded-xl border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-500">
                            <Loader2 size={18} className="animate-spin" />
                            Resolving item codes and units...
                        </div>
                    )}

                    {!isResolving && rows.length > 0 && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                                    <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Valid Rows</div>
                                    <div className="mt-1 text-2xl font-black text-emerald-800">{validRows.length}</div>
                                </div>
                                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                                    <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">Invalid Rows</div>
                                    <div className="mt-1 text-2xl font-black text-amber-800">{invalidRows.length}</div>
                                </div>
                                <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
                                    <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">Import Result</div>
                                    <div className="mt-1 text-sm font-semibold text-blue-900">Valid rows will be appended to the current purchase lines.</div>
                                </div>
                            </div>

                            <div className="overflow-hidden rounded-xl border border-gray-200">
                                <div className="max-h-[420px] overflow-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead className="sticky top-0 bg-gray-50 text-xs font-bold uppercase tracking-wide text-gray-500">
                                            <tr>
                                                <th className="px-4 py-3">Row</th>
                                                <th className="px-4 py-3">Item Code</th>
                                                <th className="px-4 py-3">Product</th>
                                                <th className="px-4 py-3">Unit</th>
                                                <th className="px-4 py-3 text-right">Qty</th>
                                                <th className="px-4 py-3 text-right">Unit Cost</th>
                                                <th className="px-4 py-3">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 bg-white">
                                            {rows.map((row) => {
                                                const isValid = row._rowErrors.length === 0;
                                                return (
                                                    <tr key={`${row.rowNumber}-${row.itemCode}-${row.unitCode}`}>
                                                        <td className="px-4 py-3 font-mono text-xs text-gray-500">{row.rowNumber}</td>
                                                        <td className="px-4 py-3 font-mono text-gray-800">{row.itemCode}</td>
                                                        <td className="px-4 py-3">
                                                            <div className="font-medium text-gray-900">{row.productName || '-'}</div>
                                                            {row.note && <div className="text-xs text-gray-500">{row.note}</div>}
                                                        </td>
                                                        <td className="px-4 py-3 text-gray-700">{row.resolvedUnitCode || row.unitCode || 'Base unit'}</td>
                                                        <td className="px-4 py-3 text-right font-medium text-gray-800">{row.qty === '' ? '-' : Number(row.qty).toLocaleString()}</td>
                                                        <td className="px-4 py-3 text-right font-medium text-gray-800">
                                                            {row.resolvedUnitCost == null ? '-' : Number(row.resolvedUnitCost).toLocaleString()}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            {isValid ? (
                                                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                                                                    <CheckCircle2 size={13} /> Ready
                                                                </span>
                                                            ) : (
                                                                <div className="space-y-1">
                                                                    {row._rowErrors.map((error) => (
                                                                        <div key={error} className="inline-flex items-start gap-1 rounded-lg bg-red-50 px-2 py-1 text-xs text-red-700">
                                                                            <AlertCircle size={12} className="mt-0.5 shrink-0" />
                                                                            <span>{error}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4">
                    <div className="text-xs text-gray-500">
                        Leave `Unit Cost` blank to use the current configured cost price for that unit.
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleImport}
                            disabled={isImporting || validRows.length === 0}
                            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isImporting ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                            Import {validRows.length} Row{validRows.length === 1 ? '' : 's'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
