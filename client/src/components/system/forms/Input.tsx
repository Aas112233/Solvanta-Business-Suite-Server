import React, { forwardRef } from 'react';
import { clsx } from 'clsx';
import type { BaseComponentProps, FieldSize } from '../types';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>, BaseComponentProps {
  size?: FieldSize;
  error?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ 
    className, 
    size = 'md', 
    error = false, 
    icon, 
    iconPosition = 'left',
    fullWidth = false,
    disabled,
    ...props 
  }, ref) => {
    const sizeClasses = {
      sm: 'h-8 px-2.5 text-xs',
      md: 'h-10 px-3 text-sm',
      lg: 'h-12 px-4 text-base',
    };

    const iconSizeClasses = {
      sm: iconPosition === 'left' ? 'pl-8' : 'pr-8',
      md: iconPosition === 'left' ? 'pl-10' : 'pr-10',
      lg: iconPosition === 'left' ? 'pl-12' : 'pr-12',
    };

    const iconClasses = {
      sm: 'w-4 h-4',
      md: 'w-5 h-5',
      lg: 'w-6 h-6',
    };

    const iconPositionClasses = {
      sm: iconPosition === 'left' ? 'left-2' : 'right-2',
      md: iconPosition === 'left' ? 'left-3' : 'right-3',
      lg: iconPosition === 'left' ? 'left-4' : 'right-4',
    };

    return (
      <div className={clsx('relative', fullWidth && 'w-full')}>
        {icon && (
          <div
            className={clsx(
              'absolute top-1/2 -translate-y-1/2 text-text-tertiary',
              iconClasses[size],
              iconPositionClasses[size]
            )}
          >
            {icon}
          </div>
        )}
        <input
          ref={ref}
          disabled={disabled}
          className={clsx(
            'block rounded-lg border bg-background-card dark:bg-gray-800',
            'text-text-primary dark:text-white',
            'placeholder:text-text-tertiary dark:placeholder:text-gray-500',
            'focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand',
            'disabled:bg-background-subtle disabled:text-text-tertiary disabled:cursor-not-allowed',
            'transition-colors duration-200',
            sizeClasses[size],
            icon && iconSizeClasses[size],
            error
              ? 'border-danger focus:border-danger focus:ring-danger/20'
              : 'border-border hover:border-slate-400 dark:border-gray-600 dark:hover:border-gray-500',
            fullWidth && 'w-full',
            className
          )}
          {...props}
        />
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
