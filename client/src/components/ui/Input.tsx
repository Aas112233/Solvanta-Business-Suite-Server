import { InputHTMLAttributes, forwardRef, ReactNode } from 'react';
import { clsx } from 'clsx';

// ── Input ────────────────────────────────────────────────────────────
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    error?: boolean;
    icon?: ReactNode;
    iconPosition?: 'left' | 'right';
    fullWidth?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
    (
        {
            className,
            type = 'text',
            error = false,
            icon,
            iconPosition = 'left',
            fullWidth = false,
            disabled,
            ...props
        },
        ref
    ) => {
        // Ensure critical autofill attributes are passed through
        const inputProps = {
            ...props,
            type,
            ref,
            disabled,
        };

        return (
            <div className={clsx('relative', fullWidth && 'w-full')}>
                {icon && iconPosition === 'left' && (
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary">
                        {icon}
                    </div>
                )}
                <input
                    {...inputProps}
                    className={clsx(
                        // Base styles
                        'rounded-lg',
                        'border border-border',
                        'bg-background-card',
                        'text-text-primary',
                        'placeholder:text-text-tertiary',
                        'transition-all duration-200',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 focus-visible:border-brand',
                        'disabled:cursor-not-allowed disabled:bg-background-subtle disabled:text-text-tertiary',
                        // Sizing
                        'h-10',
                        icon ? 'pl-10 pr-3' : 'px-3',
                        // Error state
                        error && 'border-danger focus-visible:ring-red-200 focus-visible:border-danger',
                        // Full width
                        fullWidth && 'w-full',
                        // Custom className
                        className
                    )}
                />
                {icon && iconPosition === 'right' && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary">
                        {icon}
                    </div>
                )}
            </div>
        );
    }
);

Input.displayName = 'Input';

export default Input;
