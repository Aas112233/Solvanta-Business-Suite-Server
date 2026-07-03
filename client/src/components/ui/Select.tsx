import { SelectHTMLAttributes, forwardRef } from 'react';
import { clsx } from 'clsx';
import { ChevronDown } from 'lucide-react';

// ── Select ───────────────────────────────────────────────────────────
export interface SelectOption {
    value: string;
    label: string;
    disabled?: boolean;
}

export type SelectSize = 'sm' | 'md' | 'lg';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
    options: SelectOption[];
    placeholder?: string;
    error?: boolean;
    fullWidth?: boolean;
    /** Matches Button size: sm=32px, md=40px, lg=48px */
    fieldSize?: SelectSize;
}

const selectSizeClasses: Record<SelectSize, string> = {
    sm: 'h-8 pl-2.5 pr-8 text-xs',
    md: 'h-10 pl-3 pr-10 text-sm',
    lg: 'h-12 pl-4 pr-12 text-base',
};

const Select = forwardRef<HTMLSelectElement, SelectProps>(
    (
        {
            className,
            options,
            placeholder = 'Select an option',
            error = false,
            fullWidth = false,
            disabled,
            children,
            fieldSize = 'md',
            ...props
        },
        ref
    ) => {
        return (
            <div className={clsx('relative', fullWidth && 'w-full')}>
                <select
                    ref={ref}
                    className={clsx(
                        selectSizeClasses[fieldSize],
                        'rounded-lg',
                        'appearance-none',
                        'border border-border',
                        'bg-background-card',
                        'text-text-primary',
                        'transition-all duration-200',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 focus-visible:border-brand',
                        'disabled:cursor-not-allowed disabled:bg-background-subtle disabled:text-text-tertiary',
                        error && 'border-danger focus-visible:ring-red-200 focus-visible:border-danger',
                        fullWidth && 'w-full',
                        className
                    )}
                    disabled={disabled}
                    {...props}
                >
                    {placeholder && (
                        <option value="" disabled>
                            {placeholder}
                        </option>
                    )}
                    {options.map((option) => (
                        <option
                            key={option.value}
                            value={option.value}
                            disabled={option.disabled}
                        >
                            {option.label}
                        </option>
                    ))}
                    {children}
                </select>
                <ChevronDown
                    size={16}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none"
                />
            </div>
        );
    }
);

Select.displayName = 'Select';

export default Select;
