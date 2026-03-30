import React from 'react';
import { clsx } from 'clsx';
import { ChevronRight, Home } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { BreadcrumbItem, BaseComponentProps } from '../types';
import { Skeleton } from './Skeleton';

// ============================================================================
// Breadcrumb Component
// ============================================================================

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

function Breadcrumb({ items, className }: BreadcrumbProps) {
  if (items.length === 0) return null;

  return (
    <nav 
      className={clsx('flex items-center gap-2 text-sm', className)}
      aria-label="Breadcrumb"
    >
      <Link
        to="/"
        className="flex items-center gap-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 transition-colors"
      >
        <Home className="w-4 h-4" />
        <span className="sr-only">Home</span>
      </Link>

      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        const Icon = item.icon;

        return (
          <React.Fragment key={index}>
            <ChevronRight className="w-4 h-4 text-gray-400" />
            {isLast || !item.href ? (
              <span 
                className={clsx(
                  'flex items-center gap-1',
                  isLast 
                    ? 'font-medium text-gray-900 dark:text-gray-100' 
                    : 'text-gray-500 dark:text-gray-400'
                )}
                aria-current={isLast ? 'page' : undefined}
              >
                {Icon && <Icon className="w-4 h-4" />}
                {item.label}
              </span>
            ) : (
              <Link
                to={item.href}
                className="flex items-center gap-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 transition-colors"
              >
                {Icon && <Icon className="w-4 h-4" />}
                {item.label}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

// ============================================================================
// Page Header Component
// ============================================================================

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumb?: BreadcrumbItem[];
  action?: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
}

function PageHeader({ 
  title, 
  subtitle, 
  breadcrumb, 
  action, 
  meta,
  className 
}: PageHeaderProps) {
  return (
    <div className={clsx('space-y-4', className)}>
      {breadcrumb && breadcrumb.length > 0 && (
        <Breadcrumb items={breadcrumb} />
      )}
      
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {subtitle}
            </p>
          )}
          {meta && (
            <div className="mt-2 flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
              {meta}
            </div>
          )}
        </div>
        
        {action && (
          <div className="flex items-center gap-2 shrink-0">
            {action}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Page Content Component
// ============================================================================

interface PageContentProps extends BaseComponentProps {
  children: React.ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
}

function PageContent({ 
  children, 
  className,
  padding = 'md',
  maxWidth = 'full'
}: PageContentProps) {
  const paddingClasses = {
    none: '',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  };

  const maxWidthClasses = {
    sm: 'max-w-3xl',
    md: 'max-w-4xl',
    lg: 'max-w-5xl',
    xl: 'max-w-6xl',
    '2xl': 'max-w-7xl',
    full: '',
  };

  return (
    <div 
      className={clsx(
        'flex-1',
        paddingClasses[padding],
        maxWidthClasses[maxWidth],
        maxWidth !== 'full' && 'mx-auto w-full',
        className
      )}
    >
      {children}
    </div>
  );
}

// ============================================================================
// Page Template Component
// ============================================================================

export interface PageTemplateProps extends BaseComponentProps {
  /** Page title displayed in header */
  title: string;
  /** Optional subtitle/description */
  subtitle?: string;
  /** Breadcrumb navigation items */
  breadcrumb?: BreadcrumbItem[];
  /** Primary action button(s) */
  action?: React.ReactNode;
  /** Additional metadata to display under subtitle */
  meta?: React.ReactNode;
  /** Page content */
  children: React.ReactNode;
  /** Loading state - shows skeleton instead of content */
  loading?: boolean;
  /** Error state message */
  error?: string | null;
  /** Callback to retry on error */
  onRetry?: () => void;
  /** Content padding size */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Maximum content width */
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  /** Space between header and content */
  gap?: 'sm' | 'md' | 'lg';
  /** Custom header component (replaces default) */
  customHeader?: React.ReactNode;
}

/**
 * PageTemplate - The main layout wrapper for all pages.
 * 
 * Provides consistent page structure including:
 * - Breadcrumb navigation
 * - Page header with title, subtitle, and actions
 * - Loading and error states
 * - Responsive content container
 * 
 * @example
 * ```tsx
 * <PageTemplate
 *   title="Customers"
 *   subtitle="Manage your customer relationships"
 *   breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Customers' }]}
 *   action={<Button>Add Customer</Button>}
 *   loading={isLoading}
 *   error={error}
 *   onRetry={refetch}
 * >
 *   <DataTable columns={columns} data={customers} />
 * </PageTemplate>
 * ```
 */
export function PageTemplate({
  title,
  subtitle,
  breadcrumb,
  action,
  meta,
  children,
  loading = false,
  error = null,
  onRetry,
  padding = 'md',
  maxWidth = 'full',
  gap = 'md',
  customHeader,
  className,
  id,
  'data-testid': dataTestId,
}: PageTemplateProps) {
  const gapClasses = {
    sm: 'space-y-4',
    md: 'space-y-6',
    lg: 'space-y-8',
  };

  // Loading state
  if (loading) {
    return (
      <div 
        className={clsx('min-h-full animate-pulse', className)}
        id={id}
        data-testid={dataTestId}
      >
        <PageContent padding={padding} maxWidth={maxWidth}>
          <div className={gapClasses[gap]}>
            {/* Header skeleton */}
            <div className="space-y-4">
              <Skeleton className="h-4 w-48" />
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <Skeleton className="h-8 w-64" />
                  <Skeleton className="h-4 w-96" />
                </div>
                <Skeleton className="h-10 w-32" />
              </div>
            </div>
            
            {/* Content skeleton */}
            <Skeleton className="h-96 w-full" />
          </div>
        </PageContent>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div 
        className={clsx('min-h-full', className)}
        id={id}
        data-testid={dataTestId}
      >
        <PageContent padding={padding} maxWidth={maxWidth}>
          <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-4">
              <svg 
                className="w-8 h-8 text-red-600 dark:text-red-400" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Failed to load
            </h3>
            <p className="text-gray-500 dark:text-gray-400 max-w-md mb-6">
              {error}
            </p>
            {onRetry && (
              <button
                onClick={onRetry}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Try Again
              </button>
            )}
          </div>
        </PageContent>
      </div>
    );
  }

  return (
    <div 
      className={clsx('min-h-full', className)}
      id={id}
      data-testid={dataTestId}
    >
      <PageContent padding={padding} maxWidth={maxWidth}>
        <div className={gapClasses[gap]}>
          {customHeader || (
            <PageHeader
              title={title}
              subtitle={subtitle}
              breadcrumb={breadcrumb}
              action={action}
              meta={meta}
            />
          )}
          
          <main role="main">
            {children}
          </main>
        </div>
      </PageContent>
    </div>
  );
}

export default PageTemplate;
