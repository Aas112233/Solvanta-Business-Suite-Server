import { SelectHTMLAttributes, forwardRef } from 'react';
import { clsx } from 'clsx';
import { ChevronDown } from 'lucide-react';

// ── Select ───────────────────────────────────────────────────────────
export interface SelectOption {
    value: string;
    label: string;
    disabled?: boolean;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
    options: SelectOption[];
    placeholder?: string;
    error?: boolean;
    fullWidth?: boolean;
}

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
            ...props
        },
        ref
    ) => {
        return (
            <div className={clsx('relative', fullWidth && 'w-full')}>
                <select
                    ref={ref}
                    className={clsx(
                        // Base styles
                        'h-10',
                        'rounded-lg',
                        'border border-border',
                        'bg-background-card',
                        'text-text-primary',
                        'transition-all duration-200',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 focus-visible:border-brand',
                        'disabled:cursor-not-allowed disabled:bg-background-subtle disabled:text-text-tertiary',
                        // Padding for custom arrow
                        'pr-10 pl-3',
                        // Error state
                        error && 'border-danger focus-visible:ring-red-200 focus-visible:border-danger',
                        // Full width
                        fullWidth && 'w-full',
                        // Custom className
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
                {/* Custom dropdown arrow */}
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
