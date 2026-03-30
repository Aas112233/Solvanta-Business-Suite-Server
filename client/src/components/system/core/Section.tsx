import React from 'react';
import { clsx } from 'clsx';
import type { BaseComponentProps } from '../types';

// ============================================================================
// Section Header Component
// ============================================================================

export interface SectionHeaderProps extends BaseComponentProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  border?: boolean;
}

export function SectionHeader({
  title,
  description,
  action,
  border = true,
  className,
}: SectionHeaderProps) {
  return (
    <div 
      className={clsx(
        'flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4',
        border && 'pb-4 border-b border-gray-200 dark:border-gray-700',
        className
      )}
    >
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {description}
          </p>
        )}
      </div>
      {action && (
        <div className="flex items-center gap-2 shrink-0">
          {action}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Section Component
// ============================================================================

export interface SectionProps extends BaseComponentProps {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  variant?: 'default' | 'card' | 'flat';
  headerBorder?: boolean;
  gap?: 'sm' | 'md' | 'lg';
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  onCollapseChange?: (collapsed: boolean) => void;
}

export function Section({
  title,
  description,
  action,
  children,
  variant = 'default',
  headerBorder = true,
  gap = 'md',
  collapsible = false,
  defaultCollapsed = false,
  onCollapseChange,
  className,
  id,
  'data-testid': dataTestId,
}: SectionProps) {
  const [isCollapsed, setIsCollapsed] = React.useState(defaultCollapsed);

  const handleToggle = React.useCallback(() => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    onCollapseChange?.(newState);
  }, [isCollapsed, onCollapseChange]);

  const gapClasses = {
    sm: 'space-y-3',
    md: 'space-y-4',
    lg: 'space-y-6',
  };

  const content = (
    <div className={gapClasses[gap]}>
      {(title || description || action) && (
        <SectionHeader
          title={title || ''}
          description={description}
          action={action}
          border={headerBorder}
        />
      )}
      
      {(!collapsible || !isCollapsed) && (
        <div className={clsx((title || description || action) && 'pt-2')}>
          {children}
        </div>
      )}
    </div>
  );

  if (variant === 'card') {
    return (
      <section
        className={clsx(
          'bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm',
          'p-6',
          className
        )}
        id={id}
        data-testid={dataTestId}
      >
        {content}
      </section>
    );
  }

  if (variant === 'flat') {
    return (
      <section
        className={clsx(className)}
        id={id}
        data-testid={dataTestId}
      >
        {content}
      </section>
    );
  }

  return (
    <section
      className={clsx(
        'bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700',
        className
      )}
      id={id}
      data-testid={dataTestId}
    >
      <div className="p-6">
        {content}
      </div>
    </section>
  );
}

export default Section;
