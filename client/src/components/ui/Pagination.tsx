import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { clsx } from 'clsx';
import Select from './Select';

interface PaginationProps {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
    onPageChange: (page: number) => void;
    onItemsPerPageChange: (limit: number) => void;
    isLoading?: boolean;
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export default function Pagination({
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    onPageChange,
    onItemsPerPageChange,
    isLoading
}: PaginationProps) {
    const startItem = (currentPage - 1) * itemsPerPage + 1;
    const endItem = Math.min(currentPage * itemsPerPage, totalItems);

    return (
        <div className="flex flex-col gap-4 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between bg-background-card">
            <div className="flex items-center gap-2 text-sm text-text-secondary">
                <span>Rows per page:</span>
                <Select
                    value={String(itemsPerPage)}
                    onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
                    options={PAGE_SIZE_OPTIONS.map((size) => ({ value: String(size), label: String(size) }))}
                    placeholder=""
                    className="w-20"
                />
            </div>

            <div className="text-sm text-text-secondary font-medium">
                Showing {totalItems > 0 ? startItem : 0} - {endItem} of {totalItems}
            </div>

            <div className="flex items-center gap-1">
                <button
                    type="button"
                    onClick={() => onPageChange(1)}
                    disabled={currentPage === 1 || isLoading}
                    className={clsx(
                        'rounded-lg p-1.5 transition-colors',
                        currentPage === 1 || isLoading
                            ? 'text-text-tertiary cursor-not-allowed'
                            : 'text-text-secondary hover:bg-background-subtle hover:text-text-primary'
                    )}
                    title="First Page"
                >
                    <ChevronsLeft size={18} />
                </button>
                <button
                    type="button"
                    onClick={() => onPageChange(currentPage - 1)}
                    disabled={currentPage === 1 || isLoading}
                    className={clsx(
                        'rounded-lg p-1.5 transition-colors',
                        currentPage === 1 || isLoading
                            ? 'text-text-tertiary cursor-not-allowed'
                            : 'text-text-secondary hover:bg-background-subtle hover:text-text-primary'
                    )}
                    title="Previous Page"
                >
                    <ChevronLeft size={18} />
                </button>

                <span className="mx-2 text-sm font-medium min-w-[3rem] text-center text-text-primary">
                    Page {currentPage} of {Math.max(1, totalPages)}
                </span>

                <button
                    type="button"
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={currentPage >= totalPages || isLoading}
                    className={clsx(
                        'rounded-lg p-1.5 transition-colors',
                        currentPage >= totalPages || isLoading
                            ? 'text-text-tertiary cursor-not-allowed'
                            : 'text-text-secondary hover:bg-background-subtle hover:text-text-primary'
                    )}
                    title="Next Page"
                >
                    <ChevronRight size={18} />
                </button>
                <button
                    type="button"
                    onClick={() => onPageChange(totalPages)}
                    disabled={currentPage >= totalPages || isLoading}
                    className={clsx(
                        'rounded-lg p-1.5 transition-colors',
                        currentPage >= totalPages || isLoading
                            ? 'text-text-tertiary cursor-not-allowed'
                            : 'text-text-secondary hover:bg-background-subtle hover:text-text-primary'
                    )}
                    title="Last Page"
                >
                    <ChevronsRight size={18} />
                </button>
            </div>
        </div>
    );
}
