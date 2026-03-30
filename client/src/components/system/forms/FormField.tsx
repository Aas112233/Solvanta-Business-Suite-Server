import React, { useId } from 'react';
import { clsx } from 'clsx';
import { AlertCircle } from 'lucide-react';
import type { BaseComponentProps, FieldSize } from '../types';

export interface FormFieldProps extends BaseComponentProps {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  size?: FieldSize;
  children: React.ReactElement;
  labelPosition?: 'top' | 'left';
  labelWidth?: string;
}

export function FormField({
  label,
  error,
  hint,
  required = false,
  size = 'md',
  children,
  labelPosition = 'top',
  labelWidth = '200px',
  className,
}: FormFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  const sizeClasses = {
    sm: 'space-y-1',
    md: 'space-y-1.5',
    lg: 'space-y-2',
  };

  const labelSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  const childWithProps = React.cloneElement(children, {
    id,
    'aria-invalid': !!error,
    'aria-describedby': error ? errorId : hint ? hintId : undefined,
    error: !!error,
  } as any);

  if (labelPosition === 'left') {
    return (
      <div
        className={clsx(
          'flex items-start gap-4',
          className
        )}
      >
        {label && (
          <label
            htmlFor={id}
            className={clsx(
              'font-medium text-text-secondary dark:text-gray-300 shrink-0 pt-2',
              labelSizeClasses[size]
            )}
            style={{ width: labelWidth }}
          >
            {label}
            {required && <span className="ml-1 text-danger">*</span>}
          </label>
        )}
        <div className="flex-1 space-y-1">
          {childWithProps}
          {error && (
            <p id={errorId} className="text-sm text-danger dark:text-red-400 flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />
              {error}
            </p>
          )}
          {!error && hint && (
            <p id={hintId} className="text-sm text-text-tertiary dark:text-gray-400">
              {hint}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={clsx(sizeClasses[size], className)}>
      {label && (
        <label
          htmlFor={id}
          className={clsx(
            'block font-medium text-text-secondary dark:text-gray-300',
            labelSizeClasses[size]
          )}
        >
          {label}
          {required && <span className="ml-1 text-danger">*</span>}
        </label>
      )}
      {childWithProps}
      {error && (
        <p id={errorId} className="text-sm text-danger dark:text-red-400 flex items-center gap-1">
          <AlertCircle className="w-4 h-4" />
          {error}
        </p>
      )}
      {!error && hint && (
        <p id={hintId} className="text-sm text-text-tertiary dark:text-gray-400">
          {hint}
        </p>
      )}
    </div>
  );
}

export interface FormSectionProps extends BaseComponentProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  columns?: 1 | 2 | 3 | 4;
  gap?: 'sm' | 'md' | 'lg';
}

export function FormSection({
  title,
  description,
  children,
  columns = 1,
  gap = 'md',
  className,
}: FormSectionProps) {
  const gridCols = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
  };

  const gapClasses = {
    sm: 'gap-4',
    md: 'gap-6',
    lg: 'gap-8',
  };

  return (
    <div className={clsx('space-y-4', className)}>
      {(title || description) && (
        <div>
          {title && (
            <h3 className="text-lg font-medium text-text-primary dark:text-white">
              {title}
            </h3>
          )}
          {description && (
            <p className="mt-1 text-sm text-text-tertiary dark:text-gray-400">
              {description}
            </p>
          )}
        </div>
      )}
      <div className={clsx('grid', gridCols[columns], gapClasses[gap])}>
        {children}
      </div>
    </div>
  );
}

export interface FormActionsProps extends BaseComponentProps {
  children: React.ReactNode;
  align?: 'left' | 'center' | 'right';
  border?: boolean;
}

export function FormActions({
  children,
  align = 'right',
  border = true,
  className,
}: FormActionsProps) {
  const alignClasses = {
    left: 'justify-start',
    center: 'justify-center',
    right: 'justify-end',
  };

  return (
    <div
      className={clsx(
        'flex items-center gap-3',
        alignClasses[align],
        border && 'pt-6 border-t border-border dark:border-gray-700',
        className
      )}
    >
      {children}
    </div>
  );
}

export default FormField;
