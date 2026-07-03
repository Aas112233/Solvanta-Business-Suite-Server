import { clsx } from 'clsx';
import type { BaseComponentProps } from '../types';

export interface SkeletonProps extends BaseComponentProps {
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
  width?: string | number;
  height?: string | number;
  animation?: 'pulse' | 'wave' | 'none';
}

export function Skeleton({
  variant = 'text',
  width,
  height,
  animation = 'pulse',
  className,
}: SkeletonProps) {
  const baseStyles = clsx(
    'bg-background-subtle',
    animation === 'pulse' && 'animate-pulse',
    className
  );

  const variantStyles = {
    text: 'rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-none',
    rounded: 'rounded-lg',
  };

  return (
    <span
      className={clsx(baseStyles, variantStyles[variant], 'block')}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
      }}
    />
  );
}

export interface SkeletonTextProps extends BaseComponentProps {
  lines?: number;
  spacing?: 'sm' | 'md' | 'lg';
}

export function SkeletonText({
  lines = 1,
  spacing = 'sm',
  className,
}: SkeletonTextProps) {
  const spacingClasses = {
    sm: 'space-y-1',
    md: 'space-y-2',
    lg: 'space-y-3',
  };

  return (
    <div className={clsx(spacingClasses[spacing], className)}>
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

export interface SkeletonCardProps extends BaseComponentProps {
  showHeader?: boolean;
  showContent?: boolean;
  showFooter?: boolean;
  lines?: number;
}

export function SkeletonCard({
  showHeader = true,
  showContent = true,
  showFooter = true,
  lines = 3,
  className,
}: SkeletonCardProps) {
  return (
    <div
      className={clsx(
        'bg-background-card rounded-lg border border-border',
        'p-6 space-y-4',
        className
      )}
    >
      {showHeader && (
        <div className="flex items-center gap-4">
          <Skeleton variant="circular" width={40} height={40} />
          <div className="flex-1 space-y-2">
            <Skeleton variant="text" height={20} className="w-1/3" />
            <Skeleton variant="text" height={14} className="w-1/4" />
          </div>
        </div>
      )}

      {showContent && <SkeletonText lines={lines} />}

      {showFooter && (
        <div className="flex gap-2 pt-4">
          <Skeleton variant="rounded" height={36} className="flex-1" />
          <Skeleton variant="rounded" height={36} className="flex-1" />
        </div>
      )}
    </div>
  );
}

export default Skeleton;
