import React, { useCallback } from 'react';
import { clsx } from 'clsx';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { BaseComponentProps, Column, PaginationInfo, SortDirection } from '../types';
import { Skeleton } from '../core/Skeleton';

// ============================================================================
// Table Head
// ============================================================================

interface TableHeadProps {
  column: Column;
  sortDirection?: SortDirection;
  onSort?: () => void;
}

function TableHead({ column, sortDirection, onSort }: TableHeadProps) {
  const alignClasses = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  };

  return (
    <th
      className={clsx(
        'px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-tertiary',
        'bg-background-subtle',
        column.sortable && 'cursor-pointer select-none hover:bg-border-subtle',
        alignClasses[column.align || 'left']
      )}
      style={{ width: column.width }}
      onClick={column.sortable ? onSort : undefined}
      aria-sort={
        sortDirection === 'asc'
          ? 'ascending'
          : sortDirection === 'desc'
            ? 'descending'
            : undefined
      }
    >
      <div className={clsx('flex items-center gap-1', column.align === 'right' && 'justify-end')}>
        {column.header}
        {column.sortable && (
          <span className="inline-flex flex-col">
            <ChevronUp
              className={clsx(
                'w-3 h-3 -mb-1',
                sortDirection === 'asc' ? 'text-text-primary' : 'text-text-tertiary'
              )}
            />
            <ChevronDown
              className={clsx(
                'w-3 h-3',
                sortDirection === 'desc' ? 'text-text-primary' : 'text-text-tertiary'
              )}
            />
          </span>
        )}
      </div>
    </th>
  );
}

// ============================================================================
// Table Cell
// ============================================================================

interface TableCellProps {
  children: React.ReactNode;
  align?: 'left' | 'center' | 'right';
}

function TableCell({ children, align = 'left' }: TableCellProps) {
  const alignClasses = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  };

  return (
    <td className={clsx('px-4 py-3 text-sm text-text-primary', alignClasses[align])}>
      {children}
    </td>
  );
}

// ============================================================================
// Pagination
// ============================================================================

interface PaginationProps {
  pagination: PaginationInfo;
  onPageChange: (page: number) => void;
  onLimitChange?: (limit: number) => void;
  limitOptions?: number[];
}

function Pagination({
  pagination,
  onPageChange,
  onLimitChange,
  limitOptions = [10, 20, 50, 100],
}: PaginationProps) {
  const { page, limit, total, totalPages } = pagination;
  const startItem = (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, total);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 px-4 py-3 border-t border-border">
      <div className="flex items-center gap-2 text-sm text-text-tertiary">
        <span>Showing</span>
        <span className="font-medium text-text-primary">{startItem}</span>
        <span>to</span>
        <span className="font-medium text-text-primary">{endItem}</span>
        <span>of</span>
        <span className="font-medium text-text-primary">{total}</span>
        <span>results</span>

        {onLimitChange && (
          <select
            value={limit}
            onChange={(e) => onLimitChange(Number(e.target.value))}
            className="ml-2 h-8 px-2 text-sm border border-border rounded-md bg-background-card"
          >
            {limitOptions.map((opt) => (
              <option key={opt} value={opt}>{opt} / page</option>
            ))}
          </select>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="p-2 rounded-lg border border-border hover:bg-background-subtle disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-1">
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let pageNum: number;
            if (totalPages <= 5) {
              pageNum = i + 1;
            } else if (page <= 3) {
              pageNum = i + 1;
            } else if (page >= totalPages - 2) {
              pageNum = totalPages - 4 + i;
            } else {
              pageNum = page - 2 + i;
            }

            return (
              <button
                key={pageNum}
                onClick={() => onPageChange(pageNum)}
                className={clsx(
                  'min-w-[36px] h-9 px-3 rounded-lg text-sm font-medium transition-colors',
                  page === pageNum
                    ? 'bg-brand text-white'
                    : 'border border-border hover:bg-background-subtle text-text-secondary'
                )}
              >
                {pageNum}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="p-2 rounded-lg border border-border hover:bg-background-subtle disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label="Next page"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Empty State
// ============================================================================

interface EmptyStateProps {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}

function EmptyState({
  title = 'No data available',
  description = 'There are no items to display at this time.',
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-16 h-16 bg-background-subtle rounded-full flex items-center justify-center mb-4">
        <svg
          className="w-8 h-8 text-text-tertiary"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-text-primary mb-1">
        {title}
      </h3>
      <p className="text-sm text-text-tertiary max-w-sm mb-4">
        {description}
      </p>
      {action}
    </div>
  );
}

// ============================================================================
// Data Table Component
// ============================================================================

export interface DataTableProps<T = any> extends BaseComponentProps {
  /** Column definitions */
  columns: Column<T>[];
  /** Data to display */
  data: T[];
  /** Unique key accessor for rows */
  keyAccessor: (row: T) => string;
  /** Loading state */
  loading?: boolean;
  /** Number of skeleton rows to show when loading */
  skeletonRows?: number;
  /** Empty state configuration */
  emptyState?: EmptyStateProps;
  /** Pagination configuration */
  pagination?: PaginationInfo;
  /** Page change handler */
  onPageChange?: (page: number) => void;
  /** Limit change handler */
  onLimitChange?: (limit: number) => void;
  /** Sort configuration */
  sortColumn?: string;
  sortDirection?: SortDirection;
  onSort?: (column: string, direction: SortDirection) => void;
  /** Row click handler */
  onRowClick?: (row: T) => void;
  /** Whether rows are selectable */
  selectable?: boolean;
  /** Selected row keys */
  selectedRows?: string[];
  /** Selection change handler */
  onSelectionChange?: (selectedKeys: string[]) => void;
  /** Custom row className */
  rowClassName?: (row: T) => string;
  /** Table height for scrolling */
  scrollHeight?: string | number;
}

/**
 * DataTable - A comprehensive data table component with sorting, pagination,
 * selection, and loading states.
 *
 * @example
 * ```tsx
 * <DataTable
 *   columns={[
 *     { key: 'name', header: 'Name', sortable: true },
 *     { key: 'email', header: 'Email' },
 *     { key: 'status', header: 'Status', render: (row) => <Badge>{row.status}</Badge> },
 *   ]}
 *   data={customers}
 *   keyAccessor={(row) => row.id}
 *   pagination={pagination}
 *   onPageChange={setPage}
 *   sortColumn={sortColumn}
 *   sortDirection={sortDirection}
 *   onSort={handleSort}
 *   onRowClick={(row) => navigate(`/customers/${row.id}`)}
 * />
 * ```
 */
export function DataTable<T>({
  columns,
  data,
  keyAccessor,
  loading = false,
  skeletonRows = 5,
  emptyState,
  pagination,
  onPageChange,
  onLimitChange,
  sortColumn,
  sortDirection,
  onSort,
  onRowClick,
  selectable,
  selectedRows = [],
  onSelectionChange,
  rowClassName,
  scrollHeight,
  className,
}: DataTableProps<T>) {
  const handleSort = useCallback((column: Column<T>) => {
    if (!onSort || !column.sortable) return;

    let newDirection: SortDirection = 'asc';
    if (sortColumn === column.key) {
      if (sortDirection === 'asc') newDirection = 'desc';
      else if (sortDirection === 'desc') newDirection = null;
    }

    onSort(column.key, newDirection);
  }, [onSort, sortColumn, sortDirection]);

  const handleSelectAll = useCallback(() => {
    if (!onSelectionChange) return;

    if (selectedRows.length === data.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(data.map(keyAccessor));
    }
  }, [data, keyAccessor, onSelectionChange, selectedRows]);

  const handleSelectRow = useCallback((key: string) => {
    if (!onSelectionChange) return;

    if (selectedRows.includes(key)) {
      onSelectionChange(selectedRows.filter((k) => k !== key));
    } else {
      onSelectionChange([...selectedRows, key]);
    }
  }, [onSelectionChange, selectedRows]);

  const containerStyle = scrollHeight ? { maxHeight: scrollHeight, overflow: 'auto' } : undefined;

  return (
    <div className={clsx('bg-background-card rounded-lg border border-border', className)}>
      <div style={containerStyle}>
        <table className="w-full min-w-full divide-y divide-border">
          <thead className="sticky top-0 z-10">
            <tr>
              {selectable && (
                <th className="px-4 py-3 bg-background-subtle w-12">
                  <input
                    type="checkbox"
                    ref={(input) => {
                      if (input) {
                        input.indeterminate = selectedRows.length > 0 && selectedRows.length < data.length;
                      }
                    }}
                    checked={data.length > 0 && selectedRows.length === data.length}
                    onChange={handleSelectAll}
                    className="rounded border-border text-brand focus:ring-brand-200"
                  />
                </th>
              )}
              {columns.map((column) => (
                <TableHead
                  key={column.key}
                  column={column}
                  sortDirection={sortColumn === column.key ? sortDirection : undefined}
                  onSort={() => handleSort(column)}
                />
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-border">
            {loading ? (
              Array.from({ length: skeletonRows }).map((_, rowIndex) => (
                <tr key={rowIndex}>
                  {selectable && (
                    <td className="px-4 py-3">
                      <Skeleton variant="text" width={16} height={16} />
                    </td>
                  )}
                  {columns.map((column, colIndex) => (
                    <td key={column.key} className="px-4 py-3">
                      <Skeleton
                        variant="text"
                        width={colIndex === 0 ? '80%' : '60%'}
                        height={16}
                      />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0)}>
                  <EmptyState {...emptyState} />
                </td>
              </tr>
            ) : (
              data.map((row, rowIndex) => {
                const key = keyAccessor(row);
                const isSelected = selectedRows.includes(key);

                return (
                  <tr
                    key={key}
                    className={clsx(
                      'transition-colors',
                      onRowClick && 'cursor-pointer hover:bg-background-subtle',
                      isSelected && 'bg-accent-soft',
                      rowClassName?.(row)
                    )}
                    onClick={() => onRowClick?.(row)}
                  >
                    {selectable && (
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectRow(key)}
                          className="rounded border-border text-brand focus:ring-brand-200"
                        />
                      </td>
                    )}
                    {columns.map((column) => (
                      <TableCell key={column.key} align={column.align}>
                        {column.render
                          ? column.render(row, rowIndex)
                          : column.accessor
                          ? column.accessor(row)
                          : (row as any)[column.key]}
                      </TableCell>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {pagination && onPageChange && (
        <Pagination
          pagination={pagination}
          onPageChange={onPageChange}
          onLimitChange={onLimitChange}
        />
      )}
    </div>
  );
}

export default DataTable;
