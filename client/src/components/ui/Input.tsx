import { InputHTMLAttributes, forwardRef, ReactNode } from 'react';
import { clsx } from 'clsx';

// ── Input ────────────────────────────────────────────────────────────
export type InputSize = 'sm' | 'md' | 'lg';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    error?: boolean;
    icon?: ReactNode;
    iconPosition?: 'left' | 'right';
    fullWidth?: boolean;
    /** Matches Button size: sm=32px, md=40px, lg=48px */
    fieldSize?: InputSize;
}

const sizeClasses: Record<InputSize, { height: string; px: string; iconPl: string; iconPr: string }> = {
    sm: { height: 'h-8', px: 'px-2.5', iconPl: 'pl-8', iconPr: 'pr-8' },
    md: { height: 'h-10', px: 'px-3', iconPl: 'pl-10', iconPr: 'pr-10' },
    lg: { height: 'h-12', px: 'px-4', iconPl: 'pl-12', iconPr: 'pr-12' },
};

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
            fieldSize = 'md',
            ...props
        },
        ref
    ) => {
        const s = sizeClasses[fieldSize];

        return (
            <div className={clsx('relative', fullWidth && 'w-full')}>
                {icon && iconPosition === 'left' && (
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary">
                        {icon}
                    </div>
                )}
                <input
                    type={type}
                    ref={ref}
                    disabled={disabled}
                    {...props}
                    className={clsx(
                        'rounded-lg',
                        'border border-border',
                        'bg-background-card',
                        'text-text-primary',
                        'placeholder:text-text-tertiary',
                        'transition-all duration-200',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 focus-visible:border-brand',
                        'disabled:cursor-not-allowed disabled:bg-background-subtle disabled:text-text-tertiary',
                        s.height,
                        icon ? (iconPosition === 'left' ? s.iconPl : s.iconPr) : s.px,
                        error && 'border-danger focus-visible:ring-red-200 focus-visible:border-danger',
                        fullWidth && 'w-full',
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
