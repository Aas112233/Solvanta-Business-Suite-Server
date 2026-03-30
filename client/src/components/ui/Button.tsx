import { ButtonHTMLAttributes, forwardRef } from 'react';
import { clsx } from 'clsx';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    loading?: boolean;
    icon?: React.ReactNode;
    iconPosition?: 'left' | 'right';
    fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
    primary: clsx(
        'bg-gradient-brand text-white',
        'border border-transparent',
        'hover:opacity-90',
        'focus-visible:ring-brand-200',
        'shadow-lg shadow-brand-500/20'
    ),
    secondary: clsx(
        'bg-white text-text-primary',
        'border border-border hover:border-brand-300',
        'hover:bg-background-subtle',
        'focus-visible:ring-brand-200',
        'shadow-sm'
    ),
    outline: clsx(
        'bg-transparent text-text-primary',
        'border border-border hover:border-brand-300',
        'hover:bg-background-subtle',
        'focus-visible:ring-brand-200'
    ),
    ghost: clsx(
        'bg-transparent text-text-secondary',
        'border border-transparent',
        'hover:bg-background-subtle hover:text-text-primary',
        'focus-visible:ring-brand-200'
    ),
    danger: clsx(
        'bg-danger text-white',
        'border border-transparent',
        'hover:bg-opacity-90',
        'focus-visible:ring-red-200'
    ),
    success: clsx(
        'bg-success text-white',
        'border border-transparent',
        'hover:bg-opacity-90',
        'focus-visible:ring-emerald-200'
    ),
};

const sizeStyles: Record<ButtonSize, string> = {
    sm: 'h-8 px-3 text-xs',
    md: 'h-10 px-4 text-sm',
    lg: 'h-12 px-6 text-base',
};

const iconSizeMap: Record<ButtonSize, number> = {
    sm: 14,
    md: 16,
    lg: 18,
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    (
        {
            className,
            variant = 'primary',
            size = 'md',
            loading = false,
            icon,
            iconPosition = 'left',
            fullWidth = false,
            disabled,
            children,
            ...props
        },
        ref
    ) => {
        const isDisabled = disabled || loading;

        return (
            <button
                ref={ref}
                className={clsx(
                    // Base styles
                    'inline-flex items-center justify-center gap-2',
                    'rounded-lg',
                    'font-medium',
                    'transition-all duration-200',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    // Variant and size
                    variantStyles[variant],
                    sizeStyles[size],
                    // Full width
                    fullWidth && 'w-full',
                    // Custom className
                    className
                )}
                disabled={isDisabled}
                {...props}
            >
                {loading && (
                    <Loader2
                        size={iconSizeMap[size]}
                        className="animate-spin"
                    />
                )}
                {!loading && icon && iconPosition === 'left' && (
                    <span className="shrink-0">{icon}</span>
                )}
                {children}
                {!loading && icon && iconPosition === 'right' && (
                    <span className="shrink-0">{icon}</span>
                )}
            </button>
        );
    }
);

Button.displayName = 'Button';

export default Button;
