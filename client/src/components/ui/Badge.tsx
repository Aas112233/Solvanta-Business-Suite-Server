import { ReactNode } from 'react';
import { clsx } from 'clsx';

export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'brand';
export type BadgeSize = 'sm' | 'md';

// ── Badge ────────────────────────────────────────────────────────────
export interface BadgeProps {
    children: ReactNode;
    variant?: BadgeVariant;
    size?: BadgeSize;
    dot?: boolean;
    className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
    default: 'bg-background-subtle text-text-secondary',
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
    info: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
    brand: 'bg-brand-50 text-brand dark:bg-brand-500/10 dark:text-brand-300',
};

const sizeStyles: Record<BadgeSize, string> = {
    sm: 'h-5 px-2 text-xs',
    md: 'h-6 px-2.5 text-sm',
};

export function Badge({
    children,
    variant = 'default',
    size = 'md',
    dot = false,
    className,
}: BadgeProps) {
    return (
        <span
            className={clsx(
                // Base styles
                'inline-flex items-center gap-1.5',
                'rounded-full',
                'font-medium',
                'whitespace-nowrap',
                // Variant and size
                variantStyles[variant],
                sizeStyles[size],
                // Custom className
                className
            )}
        >
            {dot && (
                <span
                    className={clsx(
                        'h-1.5 w-1.5 rounded-full',
                        variant === 'default' && 'bg-text-secondary',
                        variant === 'success' && 'bg-success',
                        variant === 'warning' && 'bg-warning',
                        variant === 'danger' && 'bg-danger',
                        variant === 'info' && 'bg-blue-500',
                        variant === 'brand' && 'bg-brand'
                    )}
                />
            )}
            {children}
        </span>
    );
}

// ── Status Badge ─────────────────────────────────────────────────────
interface StatusBadgeProps {
    status: 'active' | 'inactive' | 'pending' | 'completed' | 'cancelled' | 'draft' | 'published';
    className?: string;
}

const statusConfig: Record<StatusBadgeProps['status'], { label: string; variant: BadgeVariant }> = {
    active: { label: 'Active', variant: 'success' },
    inactive: { label: 'Inactive', variant: 'default' },
    pending: { label: 'Pending', variant: 'warning' },
    completed: { label: 'Completed', variant: 'success' },
    cancelled: { label: 'Cancelled', variant: 'danger' },
    draft: { label: 'Draft', variant: 'default' },
    published: { label: 'Published', variant: 'brand' },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
    const config = statusConfig[status];
    return (
        <Badge variant={config.variant} dot className={className}>
            {config.label}
        </Badge>
    );
}

export default Badge;
