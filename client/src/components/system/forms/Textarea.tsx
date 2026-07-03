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
        'bg-background-card',
        'border border-border',
        'rounded-lg',
        'focus:ring-2 focus:ring-brand-200 focus:border-brand',
        error && 'border-danger focus:ring-danger/20 focus:border-danger',
        disabled && 'bg-background-subtle text-text-tertiary'
      ),
      filled: clsx(
        'bg-background-subtle',
        'border-2 border-transparent',
        'rounded-lg',
        'focus:bg-background-card focus:border-brand',
        error && 'border-danger focus:border-danger',
        disabled && 'bg-background-subtle text-text-tertiary'
      ),
    };

    return (
      <textarea
        ref={ref}
        rows={rows}
        disabled={disabled}
        className={clsx(
          'block transition-colors duration-200',
          'placeholder:text-text-tertiary',
          'text-text-primary',
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
