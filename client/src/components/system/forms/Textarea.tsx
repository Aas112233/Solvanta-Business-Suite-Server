import React, { forwardRef } from 'react';
import { clsx } from 'clsx';
import type { BaseComponentProps, FieldSize } from '../types';

export interface TextareaProps extends BaseComponentProps, React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  size?: FieldSize;
  error?: boolean;
  fullWidth?: boolean;
  variant?: 'default' | 'filled';
  rows?: number;
  resize?: 'none' | 'vertical' | 'horizontal' | 'both';
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    {
      size = 'md',
      error = false,
      fullWidth = true,
      variant = 'default',
      rows = 4,
      resize = 'vertical',
      className,
      disabled,
      ...props
    },
    ref
  ) {
    const sizeClasses = {
      sm: 'px-3 py-2 text-sm',
      md: 'px-4 py-3 text-sm',
      lg: 'px-4 py-3 text-base',
    };

    const resizeClasses = {
      none: 'resize-none',
      vertical: 'resize-y',
      horizontal: 'resize-x',
      both: 'resize',
    };

    const variantClasses = {
      default: clsx(
        'bg-white dark:bg-gray-800',
        'border border-gray-300 dark:border-gray-600',
        'rounded-lg',
        'focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500',
        error && 'border-red-500 focus:ring-red-500/20 focus:border-red-500',
        disabled && 'bg-gray-100 dark:bg-gray-900 text-gray-500'
      ),
      filled: clsx(
        'bg-gray-100 dark:bg-gray-800',
        'border-2 border-transparent',
        'rounded-lg',
        'focus:bg-white dark:focus:bg-gray-900 focus:border-blue-500',
        error && 'border-red-500 focus:border-red-500',
        disabled && 'bg-gray-200 dark:bg-gray-900 text-gray-500'
      ),
    };

    return (
      <textarea
        ref={ref}
        rows={rows}
        disabled={disabled}
        className={clsx(
          'block transition-colors duration-200',
          'placeholder:text-gray-400 dark:placeholder:text-gray-600',
          'text-gray-900 dark:text-white',
          'disabled:cursor-not-allowed',
          sizeClasses[size],
          resizeClasses[resize],
          variantClasses[variant],
          fullWidth && 'w-full',
          className
        )}
        {...props}
      />
    );
  }
);

Textarea.displayName = 'Textarea';

export default Textarea;
