import { ReactNode, useId, cloneElement, ReactElement } from 'react';
import { clsx } from 'clsx';

// ── Form Field ───────────────────────────────────────────────────────
interface FormFieldProps {
    label?: string;
    error?: string | null;
    hint?: string;
    children: ReactElement<any>;
    className?: string;
    required?: boolean;
    id?: string;
}

export function FormField({
    label,
    error,
    hint,
    children,
    className,
    required = false,
    id,
}: FormFieldProps) {
    const generatedId = useId();
    const fieldId = id || generatedId;
    const errorId = `${fieldId}-error`;

    // Clone child to inject id and aria attributes
    const childWithProps = cloneElement(children, {
        id: fieldId,
        'aria-invalid': !!error,
        'aria-describedby': error ? errorId : hint ? `${fieldId}-hint` : undefined,
    } as any);

    return (
        <div className={clsx('space-y-1.5', className)}>
            {label && (
                <label
                    htmlFor={fieldId}
                    className="block text-sm font-medium text-text-secondary"
                >
                    {label}
                    {required && <span className="ml-1 text-danger">*</span>}
                </label>
            )}
            {childWithProps}
            {error && (
                <p id={errorId} className="text-sm text-danger" role="alert">
                    {error}
                </p>
            )}
            {!error && hint && (
                <p id={`${fieldId}-hint`} className="text-sm text-text-tertiary">
                    {hint}
                </p>
            )}
        </div>
    );
}

// ── Form Group ───────────────────────────────────────────────────────
interface FormGroupProps {
    children: ReactNode;
    className?: string;
}

export function FormGroup({ children, className }: FormGroupProps) {
    return <div className={clsx('space-y-4', className)}>{children}</div>;
}

// ── Form Actions ─────────────────────────────────────────────────────
interface FormActionsProps {
    children: ReactNode;
    className?: string;
    align?: 'left' | 'center' | 'right';
}

export function FormActions({ children, className, align = 'right' }: FormActionsProps) {
    return (
        <div
            className={clsx(
                'flex items-center gap-3',
                align === 'left' && 'justify-start',
                align === 'center' && 'justify-center',
                align === 'right' && 'justify-end',
                className
            )}
        >
            {children}
        </div>
    );
}

export default FormField;
