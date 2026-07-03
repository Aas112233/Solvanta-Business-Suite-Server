import React, { forwardRef } from 'react';
import { clsx } from 'clsx';
import type { BaseComponentProps } from '../types';

export interface CheckboxProps extends BaseComponentProps, Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: string;
  description?: string;
  error?: boolean;
  indeterminate?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox(
    { label, description, error, indeterminate, className, id, ...props },
    ref
  ) {
    const checkboxId = id || `checkbox-${Math.random().toString(36).substr(2, 9)}`;

    return (
      <div className={clsx('flex items-start', className)}>
        <div className="flex items-center h-5">
          <input
            ref={ref}
            type="checkbox"
            id={checkboxId}
            className={clsx(
              'w-4 h-4 rounded border-border',
              'text-text-brand focus:ring-brand-200',
              'bg-background-card',
              error && 'border-danger text-danger focus:ring-danger/20',
              'cursor-pointer disabled:cursor-not-allowed disabled:opacity-50'
            )}
            {...props}
          />
        </div>
        {(label || description) && (
          <div className="ml-3 text-sm">
            {label && (
              <label
                htmlFor={checkboxId}
                className={clsx(
                  'font-medium',
                  props.disabled
                    ? 'text-text-tertiary'
                    : 'text-text-secondary',
                  'cursor-pointer'
                )}
              >
                {label}
              </label>
            )}
            {description && (
              <p className="text-text-tertiary">
                {description}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }
);

Checkbox.displayName = 'Checkbox';

export default Checkbox;
