import { useState, useEffect, useRef } from 'react';
import { clsx } from 'clsx';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';

// ── Date Picker ──────────────────────────────────────────────────────
export interface DatePickerProps {
    value?: Date | null;
    onChange: (date: Date | null) => void;
    placeholder?: string;
    disabled?: boolean;
    minDate?: Date;
    maxDate?: Date;
    format?: string;
    className?: string;
    error?: boolean;
    fullWidth?: boolean;
}

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseDate(dateStr: string): Date | null {
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
}

export function DatePicker({
    value,
    onChange,
    placeholder = 'Select date',
    disabled = false,
    minDate,
    maxDate,
    format = 'YYYY-MM-DD',
    className,
    error = false,
    fullWidth = false,
}: DatePickerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [viewDate, setViewDate] = useState(value || new Date());
    const [inputValue, setInputValue] = useState(value ? formatDate(value) : '');
    const wrapperRef = useRef<HTMLDivElement>(null);

    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (value) {
            setInputValue(formatDate(value));
            setViewDate(value);
        }
    }, [value]);

    const getDaysInMonth = (year: number, month: number) => {
        return new Date(year, month + 1, 0).getDate();
    };

    const getFirstDayOfMonth = (year: number, month: number) => {
        return new Date(year, month, 1).getDay();
    };

    const handlePrevMonth = () => {
        setViewDate(new Date(year, month - 1, 1));
    };

    const handleNextMonth = () => {
        setViewDate(new Date(year, month + 1, 1));
    };

    const handleSelectDate = (day: number) => {
        const newDate = new Date(year, month, day);
        onChange(newDate);
        setInputValue(formatDate(newDate));
        setIsOpen(false);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setInputValue(val);
        const parsed = parseDate(val);
        if (parsed) {
            onChange(parsed);
            setViewDate(parsed);
        }
    };

    const isToday = (day: number) => {
        const today = new Date();
        return (
            day === today.getDate() &&
            month === today.getMonth() &&
            year === today.getFullYear()
        );
    };

    const isSelected = (day: number) => {
        return value &&
            day === value.getDate() &&
            month === value.getMonth() &&
            year === value.getFullYear();
    };

    const isDisabled = (day: number) => {
        const date = new Date(year, month, day);
        if (minDate && date < minDate) return true;
        if (maxDate && date > maxDate) return true;
        return false;
    };

    const renderDays = () => {
        const daysInMonth = getDaysInMonth(year, month);
        const firstDay = getFirstDayOfMonth(year, month);
        const days = [];

        // Empty cells for days before the first day of the month
        for (let i = 0; i < firstDay; i++) {
            days.push(<div key={`empty-${i}`} className="h-9" />);
        }

        // Days of the month
        for (let day = 1; day <= daysInMonth; day++) {
            const disabled = isDisabled(day);
            const selected = isSelected(day);
            const today = isToday(day);

            days.push(
                <button
                    key={day}
                    type="button"
                    onClick={() => !disabled && handleSelectDate(day)}
                    disabled={disabled}
                    className={clsx(
                        'h-9 w-9 rounded-full text-sm font-medium transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200',
                        disabled && 'text-text-tertiary cursor-not-allowed',
                        !disabled && !selected && 'hover:bg-background-subtle',
                        selected && 'bg-brand-500 text-white hover:bg-brand-600',
                        !selected && !disabled && today && 'text-brand-600 font-semibold',
                        !disabled && !today && !selected && 'text-text-primary'
                    )}
                >
                    {day}
                </button>
            );
        }

        return days;
    };

    return (
        <div className={clsx('relative', fullWidth && 'w-full', className)} ref={wrapperRef}>
            <div className="relative">
                <input
                    type="text"
                    value={inputValue}
                    onChange={handleInputChange}
                    onFocus={() => !disabled && setIsOpen(true)}
                    placeholder={placeholder}
                    disabled={disabled}
                    className={clsx(
                        'h-10 rounded-lg border bg-background-card pr-10 pl-3',
                        'text-text-primary placeholder:text-text-tertiary',
                        'transition-all duration-200',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 focus-visible:border-brand',
                        'disabled:cursor-not-allowed disabled:bg-background-subtle disabled:text-text-tertiary',
                        error && 'border-danger focus-visible:ring-red-200 focus-visible:border-danger',
                        !error && 'border-border',
                        fullWidth && 'w-full'
                    )}
                />
                <CalendarIcon
                    size={16}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none"
                />
            </div>

            {isOpen && (
                <div className={clsx(
                    'absolute z-[100] mt-2 p-4 rounded-lg bg-background-card',
                    'border border-border shadow-lg',
                    'animate-scale-in'
                )}>
                    <div className="flex items-center justify-between mb-4">
                        <button
                            type="button"
                            onClick={handlePrevMonth}
                            className="p-2 rounded-lg hover:bg-background-subtle transition-colors"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <span className="text-sm font-semibold text-text-primary">
                            {MONTH_NAMES[month]} {year}
                        </span>
                        <button
                            type="button"
                            onClick={handleNextMonth}
                            className="p-2 rounded-lg hover:bg-background-subtle transition-colors"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>

                    <div className="grid grid-cols-7 gap-1 mb-2">
                        {DAY_NAMES.map((day) => (
                            <div
                                key={day}
                                className="h-9 flex items-center justify-center text-xs font-medium text-text-tertiary"
                            >
                                {day}
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-7 gap-1">
                        {renderDays()}
                    </div>

                    <div className="mt-4 pt-3 border-t border-border-subtle">
                        <button
                            type="button"
                            onClick={() => {
                                const today = new Date();
                                onChange(today);
                                setInputValue(formatDate(today));
                                setIsOpen(false);
                            }}
                            className="w-full py-2 text-sm font-medium text-brand-600 hover:bg-background-subtle rounded-lg transition-colors"
                        >
                            Today
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Date Range Picker ────────────────────────────────────────────────
export interface DateRangePickerProps {
    startDate?: Date | null;
    endDate?: Date | null;
    onChange: (startDate: Date | null, endDate: Date | null) => void;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
    error?: boolean;
    fullWidth?: boolean;
}

export function DateRangePicker({
    startDate,
    endDate,
    onChange,
    placeholder = 'Select date range',
    disabled = false,
    className,
    error = false,
    fullWidth = false,
}: DateRangePickerProps) {
    const formatRange = () => {
        if (!startDate && !endDate) return '';
        const start = startDate ? formatDate(startDate) : '...';
        const end = endDate ? formatDate(endDate) : '...';
        return `${start} - ${end}`;
    };

    return (
        <div className={clsx('flex gap-2', fullWidth && 'w-full', className)}>
            <DatePicker
                value={startDate}
                onChange={(date) => onChange(date ?? null, endDate ?? null)}
                placeholder={`Start ${placeholder}`}
                disabled={disabled}
                maxDate={endDate ?? undefined}
                error={error}
            />
            <DatePicker
                value={endDate}
                onChange={(date) => onChange(startDate ?? null, date ?? null)}
                placeholder={`End ${placeholder}`}
                disabled={disabled}
                minDate={startDate ?? undefined}
                error={error}
            />
        </div>
    );
}

export default DatePicker;
