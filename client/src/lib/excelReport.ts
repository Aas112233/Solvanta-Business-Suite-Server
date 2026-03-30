import ExcelJS from 'exceljs';

type CellType = 'text' | 'number' | 'currency' | 'date' | 'datetime';

export interface ExcelColumn {
    key: string;
    header: string;
    type?: CellType;
    width?: number;
    split?: boolean; // If true and type is datetime, splits into Date and Time columns
}

export interface ExcelReportOptions {
    fileName: string;
    sheetName: string;
    title: string;
    columns: ExcelColumn[];
    rows: Record<string, unknown>[];
    companyName?: string;
    creatorName?: string;
    branchName?: string;
    branchCode?: string;
    filters?: Record<string, string | number | boolean | undefined | null>;
    customMeta?: Record<string, string>; // Extra info for the header
}

const COLORS = {
    primary: '0F172A',       // Slate 900
    accent: '2563EB',        // Blue 600
    textMain: '1E293B',      // Slate 800
    textMuted: '64748B',     // Slate 500
    bgHeader: 'F8FAFC',      // Slate 50
    bgZebraEven: 'F1F5F9',   // Slate 100
    borderMain: 'CBD5E1',    // Slate 300
    borderLight: 'E2E8F0',   // Slate 200
    white: 'FFFFFF'
};

export async function downloadExcelReport(options: ExcelReportOptions): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = options.creatorName || 'SOLVANTA ERP';
    workbook.lastModifiedBy = options.creatorName || 'SOLVANTA ERP';
    workbook.created = new Date();
    workbook.modified = new Date();

    const sheet = workbook.addWorksheet(options.sheetName);

    // 1. DYNAMIC COLUMN EXPANSION (Handle Date/Time Split)
    // ---------------------------------------------------------
    const finalColumns: ExcelColumn[] = [];
    options.columns.forEach(col => {
        if (col.type === 'datetime' && col.split) {
            finalColumns.push({ ...col, key: `${col.key}_date`, header: `${col.header} Date`, type: 'date', width: 14 });
            finalColumns.push({ ...col, key: `${col.key}_time`, header: `${col.header} Time`, type: 'text', width: 12 });
        } else {
            finalColumns.push(col);
        }
    });

    const totalCols = finalColumns.length;
    let currentRow = 1;
    const metaParts: string[] = [];
    if (options.branchName) metaParts.push(`Warehouse: ${options.branchName}`);
    if (options.creatorName) metaParts.push(`Reported by: ${options.creatorName}`);
    metaParts.push(`Printed: ${new Date().toLocaleString()}`);

    // 2. REPORT HEADER (Title & Branding)
    // ---------------------------------------------------------
    // Professional header with merged title
    sheet.mergeCells(currentRow, 1, currentRow + 1, totalCols);
    const titleRow = sheet.getRow(currentRow);
    titleRow.height = 25;
    const titleCell = sheet.getCell(currentRow, 1);
    titleCell.value = options.title.toUpperCase();
    titleCell.font = { name: 'Segoe UI', size: 18, bold: true, color: { argb: COLORS.accent } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    currentRow += 2;
    // Spacer below title
    currentRow++;

    // 3. PARAMETERS / FILTERS SECTION
    // ---------------------------------------------------------
    const activeFilters = Object.entries(options.filters || {})
        .filter(([, val]) => val !== undefined && val !== null && val !== '')
        .map(([key, val]) => `${key}: ${val}`);

    const extraMeta = Object.entries(options.customMeta || {})
        .map(([key, val]) => `${key}: ${val}`);

    const allSelections = [...activeFilters, ...extraMeta];

    if (allSelections.length > 0) {
        sheet.mergeCells(currentRow, 1, currentRow, totalCols);
        const selectionHeader = sheet.getCell(currentRow, 1);
        selectionHeader.value = 'Selection Criteria & Report Context';
        selectionHeader.font = { bold: true, size: 10, color: { argb: COLORS.primary } };
        selectionHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.bgHeader } };
        currentRow++;

        // Chunk filters into rows of 3 for space efficiency
        for (let i = 0; i < allSelections.length; i += 3) {
            sheet.mergeCells(currentRow, 1, currentRow, totalCols);
            const rowVal = allSelections.slice(i, i + 3).join('    |    ');
            const fCell = sheet.getCell(currentRow, 1);
            fCell.value = rowVal;
            fCell.font = { name: 'Segoe UI', size: 9, italic: true, color: { argb: COLORS.textMuted } };
            currentRow++;
        }
        currentRow++; // Spacer
    }

    // 4. DATA TABLE HEADER
    // ---------------------------------------------------------
    const headerRowIdx = currentRow;
    const headerRow = sheet.getRow(headerRowIdx);
    headerRow.height = 25;

    finalColumns.forEach((col, idx) => {
        const cell = headerRow.getCell(idx + 1);
        cell.value = col.header;
        cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: COLORS.white } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.primary } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
            top: { style: 'medium', color: { argb: COLORS.primary } },
            bottom: { style: 'medium', color: { argb: COLORS.primary } },
            left: { style: 'thin', color: { argb: '40FFFFFF' } },
            right: { style: 'thin', color: { argb: '40FFFFFF' } }
        };
    });
    currentRow++;

    // 5. DATA ROWS
    // ---------------------------------------------------------
    const colWidths = finalColumns.map(c => Math.max(12, c.header.length + 3));

    options.rows.forEach((rowObj, rowIdx) => {
        const rowNode = sheet.getRow(currentRow);
        const isEven = rowIdx % 2 !== 0;

        finalColumns.forEach((col, colIdx) => {
            const cell = rowNode.getCell(colIdx + 1);

            let rawVal: any;
            if (col.key.endsWith('_date') || col.key.endsWith('_time')) {
                // Handle split date/time keys
                const baseKey = col.key.replace(/_(date|time)$/, '');
                rawVal = rowObj[baseKey];
            } else {
                rawVal = rowObj[col.key];
            }

            const normalized = normalizeCellValue(rawVal, col.type, col.key.endsWith('_time'));
            cell.value = normalized;

            cell.font = { name: 'Segoe UI', size: 10, color: { argb: COLORS.textMain } };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };

            // Borders (Full)
            cell.border = {
                top: { style: 'thin', color: { argb: COLORS.borderLight } },
                bottom: { style: 'thin', color: { argb: COLORS.borderLight } },
                left: { style: 'thin', color: { argb: COLORS.borderLight } },
                right: { style: 'thin', color: { argb: COLORS.borderLight } }
            };

            // Zebra styling
            if (isEven) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.bgZebraEven } };
            }

            // Number/Date Formatting
            if (col.type === 'currency') cell.numFmt = '#,##0.00';
            if (col.type === 'number') cell.numFmt = '#,##0.00';
            if (col.type === 'date') cell.numFmt = 'dd/mm/yyyy';
            if (col.type === 'datetime') cell.numFmt = 'dd/mm/yyyy hh:mm AM/PM';

            // Track content length for width
            const displayVal = normalized instanceof Date ? '10/10/2024' : String(normalized);
            if (displayVal.length > colWidths[colIdx]) {
                colWidths[colIdx] = Math.min(displayVal.length + 2, 60);
            }
        });

        rowNode.height = 20;
        currentRow++;
    });

    // Apply column widths
    sheet.columns = finalColumns.map((c, i) => ({
        key: c.key,
        width: c.width || colWidths[i]
    }));

    // 6. FOOTER
    // ---------------------------------------------------------
    currentRow++;
    sheet.mergeCells(currentRow, 1, currentRow, totalCols);
    const footer = sheet.getCell(currentRow, 1);
    footer.value = `*** End of Report (${options.rows.length} records) ***`;
    footer.font = { italic: true, size: 9, color: { argb: COLORS.textMuted } };
    footer.alignment = { horizontal: 'center' };

    // Company block moved under end-of-report row
    currentRow += 2;
    sheet.mergeCells(currentRow, 1, currentRow, totalCols);
    const companyCell = sheet.getCell(currentRow, 1);
    companyCell.value = options.companyName || 'SOLVANTA ERP SYSTEM';
    companyCell.font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: COLORS.primary } };
    companyCell.alignment = { vertical: 'middle', horizontal: 'center' };
    sheet.getRow(currentRow).height = 20;

    currentRow++;
    sheet.mergeCells(currentRow, 1, currentRow, totalCols);
    const metaCell = sheet.getCell(currentRow, 1);
    metaCell.value = metaParts.join('  |  ');
    metaCell.font = { name: 'Segoe UI', size: 10, color: { argb: COLORS.textMuted } };
    metaCell.alignment = { vertical: 'middle', horizontal: 'center' };

    // Auto-filter
    sheet.autoFilter = {
        from: { row: headerRowIdx, column: 1 },
        to: { row: headerRowIdx, column: totalCols }
    };

    // Freeze plane below header
    sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: headerRowIdx }];

    // GENERATE FILE
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = sanitizeFileName(options.fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function normalizeCellValue(value: unknown, type?: CellType, isTimeSplit?: boolean): string | number | Date {
    if (value === null || value === undefined) return '';

    if (type === 'date' || type === 'datetime') {
        const date = value instanceof Date ? value : new Date(String(value));
        if (Number.isNaN(date.getTime())) return String(value);
        if (isTimeSplit) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
        }
        return date;
    }

    if (type === 'number' || type === 'currency') {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : 0;
    }

    return String(value);
}

function sanitizeFileName(name: string): string {
    const safe = name.trim().replace(/[<>:"/\\|?*]+/g, '-');
    return safe.toLowerCase().endsWith('.xlsx') ? safe : `${safe}.xlsx`;
}
