import { ReactNode } from 'react';
import { clsx } from 'clsx';

// ── Card ─────────────────────────────────────────────────────────────
interface CardProps {
    children: ReactNode;
    className?: string;
    padding?: 'none' | 'sm' | 'md' | 'lg';
    hoverable?: boolean;
    selected?: boolean;
}

export function Card({ children, className, padding = 'md', hoverable = false, selected = false }: CardProps) {
    return (
        <div
            className={clsx(
                'rounded-lg',
                'bg-background-card',
                'border border-border',
                'shadow-sm',
                hoverable && 'transition-all duration-200 hover:shadow-md hover:border-brand-200',
                selected && 'border-brand-300 ring-2 ring-brand-100',
                padding === 'none' && 'p-0',
                padding === 'sm' && 'p-3',
                padding === 'md' && 'p-5',
                padding === 'lg' && 'p-6',
                className
            )}
        >
            {children}
        </div>
    );
}

// ── Card Header ──────────────────────────────────────────────────────
interface CardHeaderProps {
    children: ReactNode;
    className?: string;
    border?: boolean;
}

export function CardHeader({ children, className, border = true }: CardHeaderProps) {
    return (
        <div
            className={clsx(
                'flex items-center justify-between',
                border && 'border-b border-border-subtle mb-4 pb-4',
                className
            )}
        >
            {children}
        </div>
    );
}

// ── Card Title ───────────────────────────────────────────────────────
interface CardTitleProps {
    children: ReactNode;
    className?: string;
    as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
}

export function CardTitle({ children, className, as = 'h3' }: CardTitleProps) {
    const Component = as;
    return (
        <Component
            className={clsx(
                'text-lg font-bold text-text-primary',
                className
            )}
        >
            {children}
        </Component>
    );
}

// ── Card Description ─────────────────────────────────────────────────
interface CardDescriptionProps {
    children: ReactNode;
    className?: string;
}

export function CardDescription({ children, className }: CardDescriptionProps) {
    return (
        <p className={clsx('text-sm text-text-secondary mt-1', className)}>
            {children}
        </p>
    );
}

// ── Card Content ─────────────────────────────────────────────────────
interface CardContentProps {
    children: ReactNode;
    className?: string;
}

export function CardContent({ children, className }: CardContentProps) {
    return <div className={clsx('', className)}>{children}</div>;
}

// ── Card Footer ──────────────────────────────────────────────────────
interface CardFooterProps {
    children: ReactNode;
    className?: string;
    border?: boolean;
    align?: 'left' | 'center' | 'right';
}

export function CardFooter({ children, className, border = false, align = 'right' }: CardFooterProps) {
    return (
        <div
            className={clsx(
                'flex items-center gap-3',
                border && 'border-t border-border-subtle mt-4 pt-4',
                align === 'left' && 'justify-start',
                align === 'center' && 'justify-center',
                align === 'right' && 'justify-end',
                className
            )}
        >
            {children}
        </div>
    );
}

// ── Stat Card ────────────────────────────────────────────────────────
interface StatCardProps {
    label: string;
    value: string | number;
    sub?: string;
    icon?: ReactNode;
    trend?: string;
    trendDirection?: 'up' | 'down' | 'neutral';
    className?: string;
}

export function StatCard({
    label,
    value,
    sub,
    icon,
    trend,
    trendDirection = 'neutral',
    className,
}: StatCardProps) {
    const trendColors = {
        up: 'text-success',
        down: 'text-danger',
        neutral: 'text-text-tertiary',
    };

    const trendIcons = {
        up: '↑',
        down: '↓',
        neutral: '→',
    };

    return (
        <Card className={clsx('relative overflow-hidden', className)}>
            <div className="absolute right-0 top-0 -mr-4 -mt-4 h-24 w-24 rounded-full bg-gradient-to-br from-border-subtle to-transparent opacity-60" />
            <div className="relative">
                <div className="flex items-start justify-between">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                            {label}
                        </p>
                        <p className="mt-2 text-2xl font-bold tracking-tight text-text-primary">
                            {value}
                        </p>
                        {sub && (
                            <p className="mt-1 text-xs text-text-tertiary">{sub}</p>
                        )}
                    </div>
                    {icon && (
                        <div className="rounded-lg bg-background-subtle p-3 text-brand">
                            {icon}
                        </div>
                    )}
                </div>
                {trend && (
                    <div className="mt-4 flex items-center gap-2">
                        <span className={clsx('text-sm font-medium', trendColors[trendDirection])}>
                            {trendIcons[trendDirection]} {trend}
                        </span>
                        <span className="text-xs text-text-tertiary">vs last period</span>
                    </div>
                )}
            </div>
        </Card>
    );
}

// ── Stats Grid ───────────────────────────────────────────────────────
interface StatsGridProps {
    children: ReactNode;
    className?: string;
    columns?: 1 | 2 | 3 | 4 | 5 | 6;
}

export function StatsGrid({ children, className, columns = 4 }: StatsGridProps) {
    const gridCols = {
        1: 'grid-cols-1',
        2: 'grid-cols-1 sm:grid-cols-2',
        3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
        4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
        5: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-5',
        6: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-6',
    };

    return (
        <div className={clsx('grid gap-4', gridCols[columns], className)}>
            {children}
        </div>
    );
}

export default Card;
