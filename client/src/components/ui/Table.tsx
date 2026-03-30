import { ReactNode } from 'react';
import { clsx } from 'clsx';
import { Loader2 } from 'lucide-react';

// ── Table ───────────────────────────────────────────────────────────
interface TableProps {
    children: ReactNode;
    className?: string;
    striped?: boolean;
    hoverable?: boolean;
    compact?: boolean;
}

export function Table({ children, className, striped = false, hoverable = true, compact = false }: TableProps) {
    return (
        <div className={clsx('overflow-x-auto', className)}>
            <table
                className={clsx(
                    'w-full',
                    'text-left',
                    compact ? 'text-sm' : 'text-base'
                )}
            >
                {children}
            </table>
        </div>
    );
}

// ── Table Header ─────────────────────────────────────────────────────
interface TableHeaderProps {
    children: ReactNode;
    className?: string;
}

export function TableHeader({ children, className }: TableHeaderProps) {
    return (
        <thead className={clsx('border-b border-border', className)}>
            {children}
        </thead>
    );
}

// ── Table Header Row ─────────────────────────────────────────────────
interface TableRowProps {
    children: ReactNode;
    className?: string;
    onClick?: () => void;
    selected?: boolean;
}

export function TableRow({ children, className, onClick, selected }: TableRowProps) {
    return (
        <tr
            className={clsx(
                'border-b border-border-subtle last:border-b-0',
                onClick && 'cursor-pointer transition-colors',
                onClick && !selected && 'hover:bg-background-subtle',
                selected && 'bg-background-subtle',
                className
            )}
            onClick={onClick}
        >
            {children}
        </tr>
    );
}

// ── Table Head Cell ──────────────────────────────────────────────────
interface TableHeadProps {
    children: ReactNode;
    className?: string;
    align?: 'left' | 'center' | 'right';
    width?: string | number;
    sortable?: boolean;
    sortDirection?: 'asc' | 'desc' | null;
    onSort?: () => void;
}

export function TableHead({
    children,
    className,
    align = 'left',
    width,
    sortable = false,
    sortDirection = null,
    onSort,
}: TableHeadProps) {
    return (
        <th
            className={clsx(
                'px-5 py-3.5',
                'text-xs font-semibold uppercase tracking-wider',
                'text-text-tertiary',
                'bg-background-subtle',
                align === 'left' && 'text-left',
                align === 'center' && 'text-center',
                align === 'right' && 'text-right',
                sortable && 'cursor-pointer hover:bg-border-subtle select-none',
                className
            )}
            style={width ? { width } : undefined}
            onClick={sortable ? onSort : undefined}
            role={sortable ? 'button' : undefined}
            tabIndex={sortable ? 0 : undefined}
            aria-sort={sortable && sortDirection ? (sortDirection === 'asc' ? 'ascending' : 'descending') : undefined}
        >
            <div className={clsx('flex items-center gap-2', align === 'right' && 'justify-end', align === 'center' && 'justify-center')}>
                {children}
                {sortable && (
                    <span className="text-text-tertiary">
                        {sortDirection === 'asc' && '↑'}
                        {sortDirection === 'desc' && '↓'}
                        {!sortDirection && '⇅'}
                    </span>
                )}
            </div>
        </th>
    );
}

// ── Table Body ───────────────────────────────────────────────────────
interface TableBodyProps {
    children: ReactNode;
    className?: string;
}

export function TableBody({ children, className }: TableBodyProps) {
    return <tbody className={className}>{children}</tbody>;
}

// ── Table Cell ───────────────────────────────────────────────────────
interface TableCellProps {
    children: ReactNode;
    className?: string;
    align?: 'left' | 'center' | 'right';
    valign?: 'top' | 'middle' | 'bottom';
    colSpan?: number;
    rowSpan?: number;
}

export function TableCell({
    children,
    className,
    align = 'left',
    valign = 'middle',
    colSpan,
    rowSpan,
}: TableCellProps) {
    return (
        <td
            className={clsx(
                'px-5 py-4',
                'text-text-secondary',
                align === 'left' && 'text-left',
                align === 'center' && 'text-center',
                align === 'right' && 'text-right',
                valign === 'top' && 'align-top',
                valign === 'middle' && 'align-middle',
                valign === 'bottom' && 'align-bottom',
                className
            )}
            colSpan={colSpan}
            rowSpan={rowSpan}
        >
            {children}
        </td>
    );
}

// ── Table Loading State ──────────────────────────────────────────────
interface TableLoadingProps {
    colSpan: number;
    message?: string;
}

export function TableLoading({ colSpan, message = 'Loading...' }: TableLoadingProps) {
    return (
        <tr>
            <td colSpan={colSpan} className="px-5 py-12">
                <div className="flex flex-col items-center justify-center gap-3">
                    <Loader2 size={32} className="animate-spin text-brand" />
                    {message && <p className="text-sm text-text-tertiary">{message}</p>}
                </div>
            </td>
        </tr>
    );
}

// ── Table Empty State ────────────────────────────────────────────────
interface TableEmptyProps {
    colSpan: number;
    message?: string;
    icon?: ReactNode;
}

export function TableEmpty({ colSpan, message = 'No data available', icon }: TableEmptyProps) {
    return (
        <tr>
            <td colSpan={colSpan} className="px-5 py-12">
                <div className="flex flex-col items-center justify-center gap-3">
                    {icon || (
                        <svg
                            className="text-text-tertiary"
                            width="48"
                            height="48"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                        >
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <line x1="3" y1="9" x2="21" y2="9" />
                            <line x1="9" y1="21" x2="9" y2="9" />
                        </svg>
                    )}
                    {message && <p className="text-sm text-text-tertiary">{message}</p>}
                </div>
            </td>
        </tr>
    );
}

export default Table;
