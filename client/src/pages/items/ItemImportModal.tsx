import { useRef, useState, useCallback, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import toast from '@/lib/toast';
import {
    X, Download, Upload, FileSpreadsheet, CheckCircle2,
    AlertCircle, AlertTriangle, ChevronDown, ChevronRight, Loader2, Info
} from 'lucide-react';

// ── Constants ─────────────────────────────────────────────────────────────────
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const BATCH_SIZE     = 500;
const WARN_ROWS      = 1000;

// ── Types ─────────────────────────────────────────────────────────────────────
interface ParsedRow {
    itemCode: string;
    itemNameEN: string;
    itemNameAR: string;
    group: string;
    category: string;
    brand: string;
    taxRate: number;
    itemStatus: string;
    unitName: string;
    unitCode: string;
    isBaseUnit: string;
    fraction: number;
    salePrice: number;
    costPrice: number;
    minNegPrice: number | '';
    unitStatus: string;
    flavorBarcode1: string;
    flavorBarcode2: string;
    flavorBarcode3: string;
    // validation
    _rowErrors: string[];
    _rowWarnings: string[];
}

interface GroupedItem {
    itemCode: string;
    itemNameEN: string;
    category: string;
    group: string;
    units: ParsedRow[];
    errors: string[];
    warnings: string[];
    expanded: boolean;
}

// ── Column map ────────────────────────────────────────────────────────────────
const COL = [
    'itemCode', 'itemNameEN', 'itemNameAR', 'group', 'category', 'brand',
    'taxRate', 'itemStatus', 'unitName', 'unitCode', 'isBaseUnit', 'fraction',
    'salePrice', 'costPrice', 'minNegPrice', 'unitStatus',
    'flavorBarcode1', 'flavorBarcode2', 'flavorBarcode3',
] as const;

type ColumnKey = (typeof COL)[number];

const HEADER_ALIASES: Record<ColumnKey, string[]> = {
    itemCode: ['item code', 'itemcode', 'code'],
    itemNameEN: ['item name (en)', 'item name en', 'item name', 'name', 'english name'],
    itemNameAR: ['item name (ar)', 'item name ar', 'arabic name', 'name arabic'],
    group: ['group', 'item group'],
    category: ['category'],
    brand: ['brand'],
    taxRate: ['tax rate %', 'tax rate', 'tax %', 'vat %', 'vat rate'],
    itemStatus: ['item status', 'status'],
    unitName: ['unit name'],
    unitCode: ['unit code', 'primary barcode', 'barcode'],
    isBaseUnit: ['is base unit', 'base unit'],
    fraction: ['fraction', 'ratio', 'qty in base unit', 'quantity in base unit'],
    salePrice: ['sale price', 'sell price', 'selling price', 'sales price', 'item sell price'],
    costPrice: ['cost price', 'purchase price'],
    minNegPrice: ['min neg price', 'minimum negotiation price', 'min negotiation price', 'minimum price'],
    unitStatus: ['unit status'],
    flavorBarcode1: ['flavor barcode 1', 'flavour barcode 1', 'flavor 1', 'barcode 1'],
    flavorBarcode2: ['flavor barcode 2', 'flavour barcode 2', 'flavor 2', 'barcode 2'],
    flavorBarcode3: ['flavor barcode 3', 'flavour barcode 3', 'flavor 3', 'barcode 3'],
};

const NUMERIC_KEYS = new Set<ColumnKey>(['taxRate', 'fraction', 'salePrice', 'costPrice', 'minNegPrice']);

function normalizeHeader(val: unknown): string {
    return String(val ?? '')
        .trim()
        .toLowerCase()
        .replace(/[%()[\]_-]+/g, ' ')
        .replace(/\s+/g, ' ');
}

function normalizeNumericText(val: string): string {
    return val
        .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
        .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
        .replace(/[\u066C\u060C]/g, ',')
        .replace(/\u066B/g, '.')
        .replace(/[^\d,.\-]/g, '');
}

function parseExcelNumber(val: unknown): number | '' {
    if (val == null) return '';
    if (typeof val === 'number') return Number.isFinite(val) ? val : NaN;

    const raw = String(val).trim();
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

    return COL.map((key, fallbackIndex) => {
        const aliases = HEADER_ALIASES[key];
        const matchedIndex = normalizedHeader.findIndex((header) => aliases.includes(header));
        return matchedIndex >= 0 ? matchedIndex : fallbackIndex;
    });
}

/** Accepts YES / Y / TRUE / 1 (case-insensitive) */
function isYes(val: any): boolean {
    const s = String(val ?? '').trim().toUpperCase();
    return s === 'YES' || s === 'Y' || s === 'TRUE' || s === '1';
}

function parseSheet(ws: XLSX.WorkSheet): { rows: ParsedRow[]; truncated: boolean } {
    const raw = XLSX.utils.sheet_to_json<any>(ws, { header: 1, defval: '' });
    const headerRow = raw[0] || [];
    const columnIndexes = resolveColumnIndexes(headerRow);
    const allDataRows = raw.slice(1).filter((r: any[]) => r.some((c: any) => String(c).trim() !== ''));
    
    // We no longer truncate, we process all rows.
    const dataRows = allDataRows;
    const truncated = false;

    const rows = dataRows.map((r: any[]) => {
            const row: any = {};
            COL.forEach((key, i) => {
                const sourceValue = r[columnIndexes[i]] ?? '';
                row[key] = NUMERIC_KEYS.has(key) ? parseExcelNumber(sourceValue) : sourceValue;
            });
            const errors: string[] = [];
            const warnings: string[] = [];
            const code = String(row.itemCode || '').trim();
            if (!/^\d{1,32}$/.test(code)) errors.push('Item Code must be 1\u201332 digits (numbers only)');
            if (!String(row.itemNameEN || '').trim()) errors.push('Item Name (EN) is required');
            if (!String(row.unitCode || '').trim()) errors.push('Unit Code is required');
            if (!String(row.unitName || '').trim()) warnings.push('Unit Name is empty, will use "Piece"');
            if (!String(row.category || '').trim()) errors.push('Category is required');
            if (!String(row.group || '').trim()) errors.push('Group is required');
            // Sale price
            const sp = Number(row.salePrice);
            if (isNaN(sp) || sp < 0) errors.push('Sale Price must be a non-negative number');
            // Fraction must be a positive number
            const frac = Number(row.fraction);
            if (isNaN(frac) || frac <= 0) errors.push('Fraction must be a positive number (≥1)');
            // minNegPrice ≤ salePrice when provided
            const mnp = row.minNegPrice !== '' ? Number(row.minNegPrice) : null;
            if (mnp !== null && !isNaN(mnp) && !isNaN(sp) && mnp > sp) {
                errors.push('Min Neg Price cannot exceed Sale Price');
            }
            return { ...row, _rowErrors: errors, _rowWarnings: warnings } as ParsedRow;
        });
    return { rows, truncated };
}

function groupRows(rows: ParsedRow[]): GroupedItem[] {
    const map = new Map<string, GroupedItem>();
    // Check duplicate unit codes across entire file
    const allUnitCodes = new Map<string, string>(); // unitCode -> itemCode
    rows.forEach(r => {
        const uc = String(r.unitCode || '').trim().toUpperCase();
        const ic = String(r.itemCode || '').trim();
        if (uc) {
            if (allUnitCodes.has(uc) && allUnitCodes.get(uc) !== ic) {
                r._rowErrors.push(`Unit Code "${uc}" appears in multiple items`);
            } else {
                allUnitCodes.set(uc, ic);
            }
        }
        // Check flavor barcodes
        [r.flavorBarcode1, r.flavorBarcode2, r.flavorBarcode3].forEach(bc => {
            const b = String(bc || '').trim().toUpperCase();
            if (b) {
                if (allUnitCodes.has(b) && allUnitCodes.get(b) !== ic) {
                    r._rowErrors.push(`Flavor barcode "${b}" conflicts with another item's Unit Code`);
                } else if (!allUnitCodes.has(b)) {
                    allUnitCodes.set(b, ic);
                }
            }
        });
    });

    rows.forEach(r => {
        const ic = String(r.itemCode || '').trim() || '__empty__';
        if (!map.has(ic)) {
            map.set(ic, {
                itemCode: ic,
                itemNameEN: r.itemNameEN,
                category: r.category,
                group: r.group,
                units: [],
                errors: [],
                warnings: [],
                expanded: false,
            });
        }
        const item = map.get(ic)!;
        item.units.push(r);
        item.errors.push(...r._rowErrors);
        item.warnings.push(...r._rowWarnings);
    });

    // Deduplicate errors per item
    map.forEach(item => {
        item.errors = Array.from(new Set(item.errors));
        item.warnings = Array.from(new Set(item.warnings));
    });

    return Array.from(map.values());
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props { onClose: () => void; }

export default function ItemImportModal({ onClose }: Props) {
    const qc = useQueryClient();
    const fileRef = useRef<HTMLInputElement>(null);
    const [items, setItems] = useState<GroupedItem[]>([]);
    const [fileName, setFileName] = useState('');
    const [fileWarning, setFileWarning] = useState('');
    const [dupStrategy, setDupStrategy] = useState<'skip' | 'overwrite'>('skip');
    const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'done'>('upload');
    const [result, setResult] = useState<any>(null);
    const [parseError, setParseError] = useState('');
    const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
    
    // Timeout Resilience states and refs
    const [importStatus, setImportStatus] = useState<string>('Ready to start');
    const [importLogs, setImportLogs] = useState<string[]>([]);
    const [currentBatchSize, setCurrentBatchSize] = useState<number>(100);
    const [paused, setPaused] = useState(false);
    const isPausedRef = useRef(false);
    const isCancelledRef = useRef(false);
    const logEndRef = useRef<HTMLDivElement>(null);

    const addLog = useCallback((msg: string) => {
        const time = new Date().toLocaleTimeString();
        setImportLogs(prev => [...prev, `[${time}] ${msg}`]);
    }, []);

    useEffect(() => {
        if (logEndRef.current) {
            logEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [importLogs]);

    const togglePause = useCallback(() => {
        isPausedRef.current = !isPausedRef.current;
        setPaused(isPausedRef.current);
        addLog(isPausedRef.current ? 'Import paused by user.' : 'Import resumed.');
    }, [addLog]);

    const validItems = items.filter(i => i.errors.length === 0);
    const invalidItems = items.filter(i => i.errors.length > 0);

    // ── Parse file ────────────────────────────────────────────────────────────
    const handleFile = useCallback((file: File) => {
        if (!file) return;
        setParseError('');
        setFileWarning('');

        // ── Guard: file type
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (ext !== 'xlsx') {
            toast.error('Only .xlsx files are supported. Please export as Excel Workbook (.xlsx).');
            return;
        }
        // ── Guard: file size
        if (file.size > MAX_FILE_BYTES) {
            toast.error(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum allowed is 10 MB.`);
            return;
        }

        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const wb = XLSX.read(e.target?.result, { type: 'array' });
                const warns: string[] = [];
                const ws = wb.Sheets['Items'] ?? wb.Sheets[wb.SheetNames[0]];
                if (!ws) {
                    setParseError('The file has no sheets. Make sure you are using the correct file.');
                    return;
                }
                if (!wb.Sheets['Items'] && wb.SheetNames[0]) {
                    warns.push(`Sheet "Items" not found — reading from sheet "${wb.SheetNames[0]}" instead.`);
                }
                const { rows, truncated } = parseSheet(ws);
                if (rows.length === 0) {
                    setParseError('No data rows found. The sheet appears empty. Fill in data below the header row.');
                    return;
                }
                if (rows.length > WARN_ROWS) warns.push(`Large file: ${rows.length} rows detected. It will be imported in batches.`);
                setFileWarning(warns.join(' | '));
                const grouped = groupRows(rows);
                // Per-item: check that exactly one base unit row exists
                grouped.forEach(item => {
                    // Normalise isBaseUnit to 'YES'/'NO' after detecting truthy values
                    item.units.forEach(u => { u.isBaseUnit = isYes(u.isBaseUnit) ? 'YES' : 'NO'; });
                    const baseCount = item.units.filter(u => u.isBaseUnit === 'YES').length;
                    if (baseCount === 0) item.errors.push('No base unit row (Is Base Unit = YES / Y / TRUE / 1) found for this item');
                    if (baseCount > 1) item.errors.push(`Multiple base unit rows found (${baseCount}). Exactly one must be YES`);
                });
                setItems(grouped);
                setStep('preview');
            } catch (err: any) {
                const msg = err?.message ? `: ${err.message}` : '';
                setParseError(`Failed to parse the file${msg}. Make sure it is a valid, non-corrupted .xlsx file.`);
            }
        };
        reader.onerror = () => setParseError('File could not be read. It may be corrupted or locked by another program.');
        reader.readAsArrayBuffer(file);
    }, []);

    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    }, [handleFile]);

    // ── Toggle item expand ────────────────────────────────────────────────────
    const toggleExpand = (idx: number) => {
        setItems(prev => prev.map((item, i) => i === idx ? { ...item, expanded: !item.expanded } : item));
    };

    const importMut = useMutation({
        onMutate: () => {
            setStep('importing');
            isPausedRef.current = false;
            isCancelledRef.current = false;
            setPaused(false);
            setImportLogs([]);
        },
        mutationFn: async () => {
            if (validItems.length === 0) throw new Error('No valid items to import');
            
            const allRows = validItems.flatMap(item => item.units.map(u => ({
                itemCode: u.itemCode,
                itemNameEN: u.itemNameEN,
                itemNameAR: u.itemNameAR,
                group: u.group,
                category: u.category,
                brand: u.brand,
                taxRate: Number(u.taxRate) || 0,
                itemStatus: u.itemStatus,
                unitName: u.unitName,
                unitCode: u.unitCode,
                isBaseUnit: u.isBaseUnit,
                fraction: Number(u.fraction) || 1,
                salePrice: Number(u.salePrice) || 0,
                costPrice: Number(u.costPrice) || 0,
                minNegPrice: u.minNegPrice,
                unitStatus: u.unitStatus,
                flavorBarcode1: u.flavorBarcode1,
                flavorBarcode2: u.flavorBarcode2,
                flavorBarcode3: u.flavorBarcode3,
            })));

            const totalRows = allRows.length;
            setImportProgress({ current: 0, total: totalRows });

            const finalResult = { imported: 0, skipped: 0, overwritten: 0, total: 0, errors: [] as string[] };
            
            let currentIndex = 0;
            let batchSize = 100;
            const MIN_BATCH = 10;
            const MAX_BATCH = 300;
            const MAX_RETRIES = 3;

            addLog(`Starting Excel import of ${totalRows} rows...`);

            while (currentIndex < totalRows) {
                if (isCancelledRef.current) {
                    addLog('Import cancelled by user. Finalizing imported items...');
                    break;
                }

                if (isPausedRef.current) {
                    setImportStatus('Paused');
                    await new Promise(resolve => setTimeout(resolve, 500));
                    continue;
                }

                setImportStatus('Importing');
                const batchEnd = Math.min(currentIndex + batchSize, totalRows);
                const chunk = allRows.slice(currentIndex, batchEnd);

                addLog(`Importing rows ${currentIndex + 1} to ${batchEnd} (Batch size: ${chunk.length})...`);
                setCurrentBatchSize(chunk.length);

                let success = false;
                let retries = 0;

                while (!success && retries < MAX_RETRIES) {
                    if (isCancelledRef.current || isPausedRef.current) {
                        break;
                    }

                    const startTime = Date.now();
                    try {
                        const res = await api.post('/products/import-excel', { 
                            rows: chunk, 
                            duplicateStrategy: dupStrategy 
                        });
                        const data = res.data.data;
                        
                        finalResult.imported += data.imported || 0;
                        finalResult.skipped += data.skipped || 0;
                        finalResult.overwritten += data.overwritten || 0;
                        finalResult.total += data.total || 0;
                        if (data.errors) {
                            finalResult.errors.push(...data.errors);
                            if (data.errors.length > 0) {
                                addLog(`Batch completed with ${data.errors.length} item error(s).`);
                            }
                        }
                        
                        success = true;
                        const duration = Date.now() - startTime;
                        addLog(`Batch successful! Took ${((duration) / 1000).toFixed(1)}s.`);
                        
                        // Dynamically adjust batch size based on speed
                        if (duration < 2500 && batchSize < MAX_BATCH) {
                            const prevSize = batchSize;
                            batchSize = Math.min(batchSize + 20, MAX_BATCH);
                            addLog(`Fast response. Increasing next batch size: ${prevSize} → ${batchSize}.`);
                        } else if (duration > 6500 && batchSize > MIN_BATCH) {
                            const prevSize = batchSize;
                            batchSize = Math.max(batchSize - 20, MIN_BATCH);
                            addLog(`Slow response. Decreasing next batch size: ${prevSize} → ${batchSize}.`);
                        }
                        
                        currentIndex = batchEnd;
                        setImportProgress({ current: currentIndex, total: totalRows });
                    } catch (error: any) {
                        retries++;
                        const status = error.response?.status;
                        const isTimeout = error.code === 'ECONNABORTED' || 
                                          error.message?.includes('timeout') || 
                                          status === 504 || 
                                          status === 502 ||
                                          status === 408;
                        
                        addLog(`Batch error: ${error.response?.data?.error?.message || error.message}`);
                        
                        if (retries < MAX_RETRIES) {
                            if (isTimeout) {
                                const prevSize = batchSize;
                                batchSize = Math.max(Math.floor(batchSize / 2), MIN_BATCH);
                                addLog(`Timeout/gateway issue. Shrinking batch size: ${prevSize} → ${batchSize} for retry.`);
                            }
                            const delay = 1000 * Math.pow(2, retries);
                            addLog(`Retrying batch in ${(delay / 1000).toFixed(0)}s (Retry ${retries}/${MAX_RETRIES})...`);
                            
                            // wait delay with responsive pause checks
                            for (let d = 0; d < delay; d += 200) {
                                if (isCancelledRef.current || isPausedRef.current) break;
                                await new Promise(resolve => setTimeout(resolve, 200));
                            }
                        }
                    }
                }

                // If batch failed completely, isolate each item sequentially
                if (!success && !isCancelledRef.current && !isPausedRef.current) {
                    addLog(`Batch failed after ${MAX_RETRIES} attempts. Isolating and importing items individually...`);

                    const itemGroups = new Map<string, any[]>();
                    for (const row of chunk) {
                        if (!itemGroups.has(row.itemCode)) {
                            itemGroups.set(row.itemCode, []);
                        }
                        itemGroups.get(row.itemCode)!.push(row);
                    }

                    addLog(`Found ${itemGroups.size} unique items in this batch. Processing one-by-one...`);

                    let resolvedCount = 0;
                    for (const [itemCode, itemRows] of itemGroups.entries()) {
                        if (isCancelledRef.current) {
                            break;
                        }

                        while (isPausedRef.current) {
                            setImportStatus('Paused');
                            await new Promise(resolve => setTimeout(resolve, 500));
                        }
                        setImportStatus('Importing');

                        resolvedCount++;
                        addLog(`[Item ${resolvedCount}/${itemGroups.size}] Importing item ${itemCode} individually...`);

                        let itemSuccess = false;
                        let itemRetries = 0;
                        while (!itemSuccess && itemRetries < 2) {
                            try {
                                const res = await api.post('/products/import-excel', { 
                                    rows: itemRows, 
                                    duplicateStrategy: dupStrategy 
                                });
                                const data = res.data.data;
                                finalResult.imported += data.imported || 0;
                                finalResult.skipped += data.skipped || 0;
                                finalResult.overwritten += data.overwritten || 0;
                                finalResult.total += data.total || 0;
                                if (data.errors) {
                                    finalResult.errors.push(...data.errors);
                                    if (data.errors.length > 0) {
                                        addLog(`Item ${itemCode} failed: ${data.errors.join(', ')}`);
                                    } else {
                                        addLog(`Item ${itemCode} imported successfully.`);
                                    }
                                } else {
                                    addLog(`Item ${itemCode} imported successfully.`);
                                }
                                itemSuccess = true;
                            } catch (itemErr: any) {
                                itemRetries++;
                                if (itemRetries >= 2) {
                                    const errMsg = itemErr.response?.data?.error?.message || itemErr.message || 'Import failed';
                                    addLog(`Item ${itemCode} failed completely: ${errMsg}`);
                                    finalResult.errors.push(`Item ${itemCode}: ${errMsg}`);
                                    finalResult.skipped += 1;
                                    finalResult.total += 1;
                                } else {
                                    await new Promise(resolve => setTimeout(resolve, 1000));
                                }
                            }
                        }

                        currentIndex += itemRows.length;
                        setImportProgress({ current: Math.min(currentIndex, totalRows), total: totalRows });
                    }

                    // Reset index to end of batch to align correctly
                    currentIndex = batchEnd;
                    setImportProgress({ current: currentIndex, total: totalRows });
                }
            }

            addLog('Import process completed!');
            return finalResult;
        },
        onSuccess: (data) => {
            setResult(data);
            setStep('done');
            qc.removeQueries({ queryKey: ['products'] });
            toast.success(`Import complete: ${data.imported} imported, ${data.skipped} skipped`);
        },
        onError: (err: any) => {
            setStep('preview');
            toast.error(err.response?.data?.error?.message || err.message || 'Import failed');
        },
    });

    // ── Download template ─────────────────────────────────────────────────────
    const downloadTemplate = async () => {
        try {
            const res = await api.get('/products/import-template', { responseType: 'blob' });
            const url = URL.createObjectURL(res.data);
            const a = document.createElement('a');
            a.href = url; a.download = 'items-import-template.xlsx'; a.click();
            URL.revokeObjectURL(url);
        } catch {
            toast.error('Failed to download template');
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-600 to-indigo-600">
                    <div className="flex items-center gap-3 text-white">
                        <FileSpreadsheet size={22} />
                        <div>
                            <h2 className="font-semibold text-lg">Import Items from Excel</h2>
                            <p className="text-blue-100 text-xs">Upload your filled template to bulk-import items</p>
                        </div>
                    </div>
                    {step !== 'importing' && (
                        <button onClick={onClose} className="text-white/80 hover:text-white transition-colors">
                            <X size={20} />
                        </button>
                    )}
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto">

                    {/* ── STEP: UPLOAD ─────────────────────────────────── */}
                    {step === 'upload' && (
                        <div className="p-8 space-y-6">
                            {/* Download template */}
                            <div className="rounded-xl border border-blue-100 bg-blue-50 p-5 flex items-start gap-4">
                                <Download size={22} className="text-blue-600 mt-0.5 shrink-0" />
                                <div className="flex-1">
                                    <p className="font-medium text-gray-800">Step 1 — Download the template</p>
                                    <p className="text-sm text-gray-500 mt-0.5">
                                        Fill in your item data. Each row = one unit. Multiple units share the same Item Code.
                                        Flavor barcodes go in the last 3 columns.
                                    </p>
                                    <button
                                        onClick={downloadTemplate}
                                        className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-medium transition-colors"
                                    >
                                        <Download size={15} /> Download Template (.xlsx)
                                    </button>
                                </div>
                            </div>

                            {/* Column guide */}
                            <div className="rounded-xl border border-gray-200 overflow-hidden">
                                <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                                    <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Template Columns</p>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-0">
                                    {[
                                        ['Item Code', '16 digits — same for all rows of same item', '🔴'],
                                        ['Item Name (EN)', 'English name', '🔴'],
                                        ['Item Name (AR)', 'Arabic name', '⚪'],
                                        ['Group', 'Must match existing group name', '🔴'],
                                        ['Category', 'Must match existing category name', '🔴'],
                                        ['Brand', 'Must match existing brand name', '⚪'],
                                        ['Tax Rate %', 'e.g. 15', '⚪'],
                                        ['Item Status', 'ACTIVE or INACTIVE', '⚪'],
                                        ['Unit Name', 'e.g. Piece, Box, Carton', '🔴'],
                                        ['Unit Code', 'Primary barcode — globally unique', '🔴'],
                                        ['Is Base Unit', 'YES for first unit row only', '🔴'],
                                        ['Fraction', 'e.g. Box of 12 → enter 12', '🔴'],
                                        ['Sale Price', 'Number', '🔴'],
                                        ['Cost Price', 'Number', '⚪'],
                                        ['Min Neg Price', 'Optional floor price', '⚪'],
                                        ['Unit Status', 'ACTIVE or INACTIVE', '⚪'],
                                        ['Flavor Barcode 1–3', 'Extra barcodes for this unit/flavor', '⚪'],
                                    ].map(([col, desc, req]) => (
                                        <div key={col} className="flex items-start gap-2 px-4 py-2 border-b border-gray-100">
                                            <span className="text-xs mt-0.5">{req}</span>
                                            <div>
                                                <p className="text-xs font-medium text-gray-800">{col}</p>
                                                <p className="text-[11px] text-gray-400">{desc}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Drop zone */}
                            <div
                                onDrop={onDrop}
                                onDragOver={e => e.preventDefault()}
                                onClick={() => fileRef.current?.click()}
                                className="border-2 border-dashed border-blue-300 rounded-xl p-10 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50/50 transition-all"
                            >
                                <Upload size={36} className="mx-auto text-blue-400 mb-3" />
                                <p className="font-medium text-gray-700">Step 2 — Upload your filled template</p>
                                <p className="text-sm text-gray-400 mt-1">Drag & drop or click to browse</p>
                                <p className="text-xs text-gray-300 mt-2">.xlsx files only · max 10 MB</p>
                            </div>
                            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); e.target.value = ''; }} />
                            {parseError && (
                                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
                                    <AlertCircle size={18} className="text-red-500 mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-sm font-semibold text-red-700">Could not read file</p>
                                        <p className="text-xs text-red-600 mt-0.5">{parseError}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── STEP: PREVIEW ────────────────────────────────── */}
                    {step === 'preview' && (
                        <div className="p-6 space-y-4">
                            {/* Summary bar */}
                            <div className="flex flex-wrap gap-3">
                                <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-100">
                                    <FileSpreadsheet size={16} className="text-gray-600" />
                                    <span className="text-sm font-medium text-gray-700">{fileName}</span>
                                </div>
                                <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-50 border border-green-200">
                                    <CheckCircle2 size={15} className="text-green-600" />
                                    <span className="text-sm font-medium text-green-700">{validItems.length} items ready</span>
                                </div>
                                {invalidItems.length > 0 && (
                                    <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-50 border border-red-200">
                                        <AlertCircle size={15} className="text-red-600" />
                                        <span className="text-sm font-medium text-red-700">{invalidItems.length} items have errors — will be skipped</span>
                                    </div>
                                )}
                                {fileWarning && (
                                    <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-50 border border-amber-200">
                                        <Info size={15} className="text-amber-600" />
                                        <span className="text-sm text-amber-700">{fileWarning}</span>
                                    </div>
                                )}
                            </div>

                            {/* Duplicate strategy */}
                            <div className="flex items-center gap-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                                <AlertTriangle size={18} className="text-amber-600 shrink-0" />
                                <div className="flex-1">
                                    <p className="text-sm font-medium text-gray-800">If an item with the same Item Code already exists:</p>
                                    <div className="flex gap-4 mt-2">
                                        {(['skip', 'overwrite'] as const).map(s => (
                                            <label key={s} className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="radio" name="dupStrategy" value={s}
                                                    checked={dupStrategy === s}
                                                    onChange={() => setDupStrategy(s)}
                                                    className="accent-blue-600"
                                                />
                                                <span className="text-sm text-gray-700 capitalize">
                                                    {s === 'skip' ? '⏭ Skip (keep existing)' : '♻️ Overwrite (replace units & prices)'}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Items table */}
                            <div className="rounded-xl border border-gray-200 overflow-hidden">
                                <div className="bg-gray-50 grid grid-cols-[2fr_2fr_1.5fr_1.5fr_1fr_auto] gap-0 px-4 py-2 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                    <span>Item Code</span><span>Name</span><span>Group</span><span>Category</span><span>Units</span><span>Status</span>
                                </div>
                                <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
                                    {items.slice(0, 100).map((item, idx) => (
                                        <div key={idx}>
                                            <div
                                                className={`grid grid-cols-[2fr_2fr_1.5fr_1.5fr_1fr_auto] gap-0 px-4 py-3 items-center cursor-pointer hover:bg-gray-50 transition-colors ${item.errors.length > 0 ? 'bg-red-50/60' : ''}`}
                                                onClick={() => toggleExpand(idx)}
                                            >
                                                <span className="font-mono text-xs text-gray-700">{item.itemCode}</span>
                                                <span className="text-sm text-gray-800 truncate">{item.itemNameEN}</span>
                                                <span className="text-xs text-gray-500">{item.group}</span>
                                                <span className="text-xs text-gray-500">{item.category}</span>
                                                <span className="text-xs text-gray-600">{item.units.length} unit{item.units.length !== 1 ? 's' : ''}</span>
                                                <div className="flex items-center gap-2">
                                                    {item.errors.length > 0
                                                        ? <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium"><AlertCircle size={13} /> {item.errors.length} error{item.errors.length !== 1 ? 's' : ''}</span>
                                                        : item.warnings.length > 0
                                                            ? <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium"><AlertTriangle size={13} /> warn</span>
                                                            : <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium"><CheckCircle2 size={13} /> OK</span>
                                                    }
                                                    {item.expanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                                                </div>
                                            </div>

                                            {/* Expanded details */}
                                            {item.expanded && (
                                                <div className="bg-gray-50 px-6 pb-4 pt-2 space-y-2 border-t border-gray-100">
                                                    {item.errors.map((e, i) => (
                                                        <p key={i} className="text-xs text-red-600 flex items-start gap-1.5"><AlertCircle size={12} className="mt-0.5 shrink-0" />{e}</p>
                                                    ))}
                                                    {item.warnings.map((w, i) => (
                                                        <p key={i} className="text-xs text-amber-600 flex items-start gap-1.5"><AlertTriangle size={12} className="mt-0.5 shrink-0" />{w}</p>
                                                    ))}
                                                    <div className="mt-2 overflow-x-auto rounded border border-gray-200">
                                                        <table className="text-xs w-full">
                                                            <thead className="bg-gray-100">
                                                                <tr>
                                                                    {['Unit Name', 'Unit Code', 'Base?', 'Fraction', 'Sale Price', 'Cost Price', 'Flavor BCs'].map(h => (
                                                                        <th key={h} className="px-3 py-1.5 text-left font-medium text-gray-500">{h}</th>
                                                                    ))}
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-gray-100 bg-white">
                                                                {item.units.map((u, ui) => (
                                                                    <tr key={ui} className={u._rowErrors.length > 0 ? 'bg-red-50' : ''}>
                                                                        <td className="px-3 py-1.5">{u.unitName || '—'}</td>
                                                                        <td className="px-3 py-1.5 font-mono">{u.unitCode || '—'}</td>
                                                                        <td className="px-3 py-1.5">{String(u.isBaseUnit).toUpperCase() === 'YES' ? '✅' : '—'}</td>
                                                                        <td className="px-3 py-1.5">{u.fraction}</td>
                                                                        <td className="px-3 py-1.5">{u.salePrice}</td>
                                                                        <td className="px-3 py-1.5">{u.costPrice}</td>
                                                                        <td className="px-3 py-1.5 font-mono text-blue-600">
                                                                            {[u.flavorBarcode1, u.flavorBarcode2, u.flavorBarcode3].filter(Boolean).join(', ') || '—'}
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    {items.length > 100 && (
                                        <div className="p-4 text-center text-sm font-semibold text-gray-500 bg-gray-50 border-t border-gray-100">
                                            + {items.length - 100} more items loaded and ready to import (hidden for browser performance).
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── STEP: IMPORTING ────────────────────────────── */}
                    {step === 'importing' && (
                        <div className="p-8 space-y-6 flex flex-col h-[50vh]">
                            <div className="text-center space-y-2">
                                <h3 className="text-lg font-semibold text-gray-800">
                                    {paused ? 'Import Paused' : 'Importing Items...'}
                                </h3>
                                <p className="text-sm text-gray-500">
                                    Please keep this window open while the import runs.
                                </p>
                            </div>

                            {/* Progress bar */}
                            <div className="space-y-2">
                                <div className="flex justify-between text-xs text-gray-500 font-medium">
                                    <span>Progress: {importProgress.current} / {importProgress.total} rows</span>
                                    <span>{importProgress.total > 0 ? Math.round((importProgress.current / importProgress.total) * 100) : 0}%</span>
                                </div>
                                <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                                    <div 
                                        className="bg-blue-600 h-full transition-all duration-300 rounded-full" 
                                        style={{ width: `${importProgress.total > 0 ? (importProgress.current / importProgress.total) * 100 : 0}%` }}
                                    />
                                </div>
                            </div>

                            {/* Dynamic stats */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 flex flex-col justify-center items-center text-center">
                                    <span className="text-xs text-gray-400 font-medium uppercase">Current Batch Size</span>
                                    <span className="text-lg font-bold text-gray-700 mt-1">{currentBatchSize} rows</span>
                                </div>
                                <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 flex flex-col justify-center items-center text-center">
                                    <span className="text-xs text-gray-400 font-medium uppercase">Status</span>
                                    <span className={`text-lg font-bold mt-1 ${paused ? 'text-amber-500' : 'text-blue-500 animate-pulse'}`}>
                                        {paused ? 'Paused' : importStatus}
                                    </span>
                                </div>
                            </div>

                            {/* Log console */}
                            <div className="flex-1 flex flex-col min-h-0">
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Import Logs</p>
                                <div className="flex-1 bg-gray-950 rounded-xl p-4 font-mono text-xs text-gray-300 overflow-y-auto space-y-1 select-text">
                                    {importLogs.map((log, index) => {
                                        let colorClass = 'text-gray-300';
                                        if (log.includes('successful') || log.includes('success') || log.includes('completed')) {
                                            colorClass = 'text-emerald-400';
                                        } else if (log.includes('error') || log.includes('failed')) {
                                            colorClass = 'text-rose-400 font-bold';
                                        } else if (log.includes('paused') || log.includes('Retry') || log.includes('Timeout')) {
                                            colorClass = 'text-amber-400';
                                        } else if (log.includes('cancelled')) {
                                            colorClass = 'text-red-400';
                                        }
                                        return (
                                            <div key={index} className={colorClass}>
                                                {log}
                                            </div>
                                        );
                                    })}
                                    <div ref={logEndRef} />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── STEP: DONE ───────────────────────────────────── */}
                    {step === 'done' && result && (
                        <div className="p-10 text-center space-y-6">
                            {result.imported === 0 && result.overwritten === 0
                                ? <AlertTriangle size={60} className="mx-auto text-amber-400" />
                                : <CheckCircle2 size={60} className="mx-auto text-green-500" />}
                            <h3 className="text-xl font-semibold text-gray-800">
                                {result.imported === 0 && result.overwritten === 0 ? 'Nothing Imported' : 'Import Complete!'}
                            </h3>
                            <div className="flex justify-center gap-4 flex-wrap">
                                <div className="px-6 py-4 bg-green-50 border border-green-200 rounded-xl">
                                    <p className="text-2xl font-bold text-green-600">{result.imported}</p>
                                    <p className="text-sm text-gray-600">Created</p>
                                </div>
                                <div className="px-6 py-4 bg-blue-50 border border-blue-200 rounded-xl">
                                    <p className="text-2xl font-bold text-blue-600">{result.overwritten ?? 0}</p>
                                    <p className="text-sm text-gray-600">Overwritten</p>
                                </div>
                                <div className="px-6 py-4 bg-gray-50 border border-gray-200 rounded-xl">
                                    <p className="text-2xl font-bold text-gray-600">{result.skipped}</p>
                                    <p className="text-sm text-gray-600">Skipped</p>
                                </div>
                                {result.errors?.length > 0 && (
                                    <div className="px-6 py-4 bg-red-50 border border-red-200 rounded-xl">
                                        <p className="text-2xl font-bold text-red-600">{result.errors.length}</p>
                                        <p className="text-sm text-gray-600">Failed</p>
                                    </div>
                                )}
                            </div>
                            {result.errors?.length > 0 && (
                                <div className="text-left rounded-xl border border-red-200 bg-red-50 p-4 max-h-48 overflow-y-auto">
                                    <p className="text-sm font-semibold text-red-700 mb-2">⚠ Items that could not be imported ({result.errors.length}):</p>
                                    {result.errors.map((e: string, i: number) => (
                                        <p key={i} className="text-xs text-red-600 flex items-start gap-1.5 mb-1 font-mono">
                                            <AlertCircle size={11} className="mt-0.5 shrink-0" />{e}
                                        </p>
                                    ))}
                                </div>
                            )}
                            <p className="text-xs text-gray-400">Total processed: {result.total ?? (result.imported + result.skipped + (result.overwritten ?? 0) + (result.errors?.length ?? 0))} items</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50">
                    <div>
                        {step === 'preview' && (
                            <button onClick={() => { setStep('upload'); setItems([]); setFileName(''); setParseError(''); setFileWarning(''); }} className="text-sm text-gray-500 hover:text-gray-700">
                                ← Change file
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        {step === 'importing' ? (
                            <>
                                <button
                                    onClick={() => {
                                        if (confirm('Are you sure you want to stop the import? Any items imported so far will remain in the database.')) {
                                            isCancelledRef.current = true;
                                            isPausedRef.current = false;
                                            setPaused(false);
                                        }
                                    }}
                                    className="px-4 py-2 text-sm text-red-600 hover:text-red-800 font-medium transition-colors"
                                >
                                    Cancel Import
                                </button>
                                <button
                                    onClick={togglePause}
                                    className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm text-white ${paused ? 'bg-green-600 hover:bg-green-700' : 'bg-amber-500 hover:bg-amber-600'}`}
                                >
                                    {paused ? '▶ Resume Import' : '⏸ Pause Import'}
                                </button>
                            </>
                        ) : (
                            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors">
                                {step === 'done' ? 'Close' : 'Cancel'}
                            </button>
                        )}
                        {step === 'preview' && validItems.length > 0 && (
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => importMut.mutate()}
                                    disabled={importMut.isPending}
                                    className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors shadow-sm"
                                >
                                    {importMut.isPending
                                        ? <><Loader2 size={15} className="animate-spin" /> Importing...</>
                                        : <><Upload size={15} /> Import {validItems.length} item{validItems.length !== 1 ? 's' : ''}</>
                                    }
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
