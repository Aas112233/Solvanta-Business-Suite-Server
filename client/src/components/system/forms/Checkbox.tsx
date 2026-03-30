import React, { forwardRef } from 'react';
import { clsx } from 'clsx';
import { Check } from 'lucide-react';
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
              'w-4 h-4 rounded border-gray-300 dark:border-gray-600',
              'text-blue-600 focus:ring-blue-500',
              'dark:bg-gray-800 dark:checked:bg-blue-600',
              error && 'border-red-500 text-red-600 focus:ring-red-500',
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
                    ? 'text-gray-400 dark:text-gray-600' 
                    : 'text-gray-700 dark:text-gray-300',
                  'cursor-pointer'
                )}
              >
                {label}
              </label>
            )}
            {description && (
              <p className="text-gray-500 dark:text-gray-400">
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
