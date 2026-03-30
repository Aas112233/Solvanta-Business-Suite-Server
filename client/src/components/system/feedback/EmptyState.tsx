import React from 'react';
import { clsx } from 'clsx';
import { Inbox, Search, AlertCircle, FileX } from 'lucide-react';
import type { BaseComponentProps } from '../types';

// ============================================================================
// Empty State Component
// ============================================================================

export type EmptyStateVariant = 'default' | 'search' | 'error' | 'filtered';

export interface EmptyStateProps extends BaseComponentProps {
  /** Visual style variant */
  variant?: EmptyStateVariant;
  /** Custom icon (overrides variant icon) */
  icon?: React.ReactNode;
  /** Main title text */
  title?: string;
  /** Description text */
  description?: string;
  /** Primary action button */
  action?: React.ReactNode;
  /** Secondary action button */
  secondaryAction?: React.ReactNode;
  /** Compact mode for inline usage */
  compact?: boolean;
}

const variantConfig: Record<EmptyStateVariant, { icon: React.ElementType; defaultTitle: string; defaultDescription: string }> = {
  default: {
    icon: Inbox,
    defaultTitle: 'No items yet',
    defaultDescription: 'Get started by creating your first item.',
  },
  search: {
    icon: Search,
    defaultTitle: 'No results found',
    defaultDescription: 'Try adjusting your search terms or filters.',
  },
  error: {
    icon: AlertCircle,
    defaultTitle: 'Something went wrong',
    defaultDescription: 'We encountered an error while loading the data.',
  },
  filtered: {
    icon: FileX,
    defaultTitle: 'No matching items',
    defaultDescription: 'Try adjusting your filters to see more results.',
  },
};

/**
 * EmptyState - Displayed when there's no data to show.
 * 
 * Provides consistent messaging and styling for empty states across the application.
 * Supports multiple variants for different scenarios (search, error, etc.).
 * 
 * @example
 * ```tsx
 * <EmptyState
 *   variant="search"
 *   title="No customers found"
 *   description="Try searching with a different name or email"
 *   action={<Button>Clear Search</Button>}
 * />
 * ```
 */
export function EmptyState({
  variant = 'default',
  icon: customIcon,
  title: customTitle,
  description: customDescription,
  action,
  secondaryAction,
  compact = false,
  className,
  id,
  'data-testid': dataTestId,
}: EmptyStateProps) {
  const config = variantConfig[variant];
  const Icon = config.icon;
  const title = customTitle || config.defaultTitle;
  const description = customDescription || config.defaultDescription;

  if (compact) {
    return (
      <div
        className={clsx(
          'flex items-center gap-3 p-4',
          'bg-gray-50 dark:bg-gray-800/50 rounded-lg',
          className
        )}
        id={id}
        data-testid={dataTestId}
      >
        <div className="text-gray-400 dark:text-gray-500">
          {customIcon || <Icon className="w-5 h-5" />}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {title}
          </p>
          {description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {description}
            </p>
          )}
        </div>
        {(action || secondaryAction) && (
          <div className="flex items-center gap-2">
            {secondaryAction}
            {action}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center text-center',
        'p-8 md:p-12',
        className
      )}
      id={id}
      data-testid={dataTestId}
    >
      <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
        <div className="text-gray-400 dark:text-gray-500">
          {customIcon || <Icon className="w-8 h-8" />}
        </div>
      </div>

      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        {title}
      </h3>

      {description && (
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mb-6">
          {description}
        </p>
      )}

      {(action || secondaryAction) && (
        <div className="flex flex-col sm:flex-row items-center gap-3">
          {secondaryAction}
          {action}
        </div>
      )}
    </div>
  );
}

export default EmptyState;
