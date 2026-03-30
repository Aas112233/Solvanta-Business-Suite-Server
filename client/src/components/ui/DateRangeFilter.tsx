import { Calendar, X } from 'lucide-react';
import { clsx } from 'clsx';
import Input from './Input';
import Button from './Button';

interface DateRangeFilterProps {
    startDate: string;
    endDate: string;
    onChange: (start: string, end: string) => void;
    onClear?: () => void;
    className?: string;
}

export default function DateRangeFilter({
    startDate,
    endDate,
    onChange,
    onClear,
    className,
}: DateRangeFilterProps) {
    return (
        <div
            className={clsx(
                'flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background-card p-2',
                className
            )}
        >
            <div className="flex items-center gap-2 px-1 text-text-secondary">
                <Calendar size={16} />
                <span className="text-xs font-medium uppercase tracking-wide">Period</span>
            </div>

            <Input
                type="date"
                value={startDate}
                onChange={(e) => onChange(e.target.value, endDate)}
                className="min-w-[150px]"
            />
            <span className="text-sm text-text-tertiary">-</span>
            <Input
                type="date"
                value={endDate}
                onChange={(e) => onChange(startDate, e.target.value)}
                className="min-w-[150px]"
            />

            {(startDate || endDate) && onClear && (
                <Button
                    type="button"
                    onClick={onClear}
                    variant="ghost"
                    size="sm"
                    className="px-2 text-text-secondary"
                    title="Clear dates"
                    aria-label="Clear date range"
                >
                    <X size={14} />
                </Button>
            )}
        </div>
    );
}
