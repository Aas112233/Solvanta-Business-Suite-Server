import React, { forwardRef } from 'react';
import { clsx } from 'clsx';
import { ChevronDown } from 'lucide-react';
import type { BaseComponentProps, FieldSize, FieldOption } from '../types';

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'>, BaseComponentProps {
  size?: FieldSize;
  error?: boolean;
  options: FieldOption[];
  placeholder?: string;
  fullWidth?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({
    className,
    size = 'md',
    error = false,
    options,
    placeholder,
    fullWidth = false,
    disabled,
    children,
    ...props
  }, ref) => {
    const sizeClasses = {
      sm: 'h-8 pl-2.5 pr-8 text-xs',
      md: 'h-10 pl-3 pr-10 text-sm',
      lg: 'h-12 pl-4 pr-12 text-base',
    };

    const iconClasses = {
      sm: 'w-4 h-4 right-2',
      md: 'w-5 h-5 right-3',
      lg: 'w-6 h-6 right-4',
    };

    return (
      <div className={clsx('relative', fullWidth && 'w-full')}>
        <select
          ref={ref}
          disabled={disabled}
          className={clsx(
            'block rounded-lg border bg-background-card appearance-none',
            'text-text-primary',
            'focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand',
            'disabled:bg-background-subtle disabled:text-text-tertiary disabled:cursor-not-allowed',
            'transition-colors duration-200',
            sizeClasses[size],
            error
              ? 'border-danger focus:border-danger focus:ring-danger/20'
              : 'border-border hover:border-border-active',
            fullWidth && 'w-full',
            className
          )}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </option>
          ))}
          {children}
        </select>
        <ChevronDown
          className={clsx(
            'absolute top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none',
            iconClasses[size]
          )}
        />
      </div>
    );
  }
);

Select.displayName = 'Select';

export default Select;
