import { clsx } from 'clsx';

// ── Skeleton ─────────────────────────────────────────────────────────
export interface SkeletonProps {
    variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
    width?: string | number;
    height?: string | number;
    className?: string;
    animation?: 'pulse' | 'wave' | 'none';
}

export function Skeleton({
    variant = 'text',
    width,
    height,
    className,
    animation = 'pulse',
}: SkeletonProps) {
    const baseStyles = clsx(
        'bg-background-subtle',
        animation === 'pulse' && 'animate-pulse',
        animation === 'wave' && 'animate-shimmer',
        className
    );

    const variantStyles = {
        text: 'rounded',
        circular: 'rounded-full',
        rectangular: 'rounded-md',
        rounded: 'rounded-lg',
    };

    return (
        <span
            className={clsx(baseStyles, variantStyles[variant])}
            style={{
                width,
                height,
                minWidth: width,
                minHeight: height,
            }}
        />
    );
}

// ── Skeleton Text ────────────────────────────────────────────────────
export interface SkeletonTextProps {
    lines?: number;
    spacing?: 'sm' | 'md' | 'lg';
    className?: string;
}

export function SkeletonText({ lines = 1, spacing = 'sm', className }: SkeletonTextProps) {
    const spacingStyles = {
        sm: 'space-y-1',
        md: 'space-y-2',
        lg: 'space-y-3',
    };

    return (
        <div className={clsx(spacingStyles[spacing], className)}>
            {Array.from({ length: lines }).map((_, i) => (
                <Skeleton
                    key={i}
                    variant="text"
                    height={16}
                    className={clsx(
                        i === lines - 1 && 'w-3/4',
                        i === 0 && 'w-full',
                        lines > 1 && i > 0 && i < lines - 1 && 'w-11/12'
                    )}
                />
            ))}
        </div>
    );
}

// ── Skeleton Card ────────────────────────────────────────────────────
export interface SkeletonCardProps {
    showImage?: boolean;
    showTitle?: boolean;
    showDescription?: boolean;
    showFooter?: boolean;
    className?: string;
}

export function SkeletonCard({
    showImage = true,
    showTitle = true,
    showDescription = true,
    showFooter = false,
    className,
}: SkeletonCardProps) {
    return (
        <div className={clsx('p-4 rounded-lg border border-border bg-background-card', className)}>
            {showImage && (
                <Skeleton variant="rounded" className="mb-4" height={160} />
            )}
            {showTitle && (
                <Skeleton variant="text" height={20} className="mb-2 w-3/4" />
            )}
            {showDescription && (
                <SkeletonText lines={2} spacing="sm" className="mb-4" />
            )}
            {showFooter && (
                <div className="flex gap-2">
                    <Skeleton variant="rounded" height={32} className="flex-1" />
                    <Skeleton variant="rounded" height={32} className="flex-1" />
                </div>
            )}
        </div>
    );
}

// ── Skeleton Table ───────────────────────────────────────────────────
export interface SkeletonTableProps {
    rows?: number;
    columns?: number;
    showHeader?: boolean;
    className?: string;
}

export function SkeletonTable({
    rows = 5,
    columns = 4,
    showHeader = true,
    className,
}: SkeletonTableProps) {
    return (
        <div className={clsx('rounded-lg border border-border bg-background-card overflow-hidden', className)}>
            {showHeader && (
                <div className="flex border-b border-border-subtle">
                    {Array.from({ length: columns }).map((_, i) => (
                        <Skeleton
                            key={i}
                            variant="text"
                            height={40}
                            className="flex-1 mx-2 mt-3"
                        />
                    ))}
                </div>
            )}
            <div>
                {Array.from({ length: rows }).map((_, rowIndex) => (
                    <div
                        key={rowIndex}
                        className="flex border-b border-border-subtle last:border-b-0"
                    >
                        {Array.from({ length: columns }).map((_, colIndex) => (
                            <Skeleton
                                key={colIndex}
                                variant="text"
                                height={48}
                                className="flex-1 mx-2 my-2"
                            />
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Skeleton Avatar ──────────────────────────────────────────────────
export interface SkeletonAvatarProps {
    size?: 'sm' | 'md' | 'lg' | 'xl';
    className?: string;
}

export function SkeletonAvatar({ size = 'md', className }: SkeletonAvatarProps) {
    const sizeMap = {
        sm: 32,
        md: 40,
        lg: 48,
        xl: 64,
    };

    return (
        <Skeleton
            variant="circular"
            width={sizeMap[size]}
            height={sizeMap[size]}
            className={className}
        />
    );
}

// ── CSS for shimmer animation ────────────────────────────────────────
const shimmerStyles = `
@keyframes shimmer {
    0% {
        background-position: -1000px 0;
    }
    100% {
        background-position: 1000px 0;
    }
}

.animate-shimmer {
    animation: shimmer 2s infinite linear;
    background: linear-gradient(
        90deg,
        var(--color-background-subtle) 0%,
        var(--color-border-subtle) 50%,
        var(--color-background-subtle) 100%
    );
    background-size: 1000px 100%;
}
`;

// Inject shimmer styles
if (typeof document !== 'undefined') {
    const styleId = 'skeleton-shimmer-styles';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = shimmerStyles;
        document.head.appendChild(style);
    }
}

export default Skeleton;
