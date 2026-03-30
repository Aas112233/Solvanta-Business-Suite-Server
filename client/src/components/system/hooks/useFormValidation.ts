import { useState, useCallback, useMemo } from 'react';
import type { ValidationRule } from '../types';

interface FieldState {
  value: any;
  error: string | null;
  touched: boolean;
  dirty: boolean;
}

interface FormState {
  fields: Record<string, FieldState>;
  isSubmitting: boolean;
  isValid: boolean;
  isDirty: boolean;
}

interface UseFormValidationOptions {
  initialValues: Record<string, any>;
  validationRules?: Record<string, ValidationRule>;
  onSubmit?: (values: Record<string, any>) => void | Promise<void>;
}

/**
 * Hook for form validation with consistent behavior across the application.
 * 
 * @example
 * ```tsx
 * const form = useFormValidation({
 *   initialValues: { email: '', password: '' },
 *   validationRules: {
 *     email: { 
 *       required: 'Email is required',
 *       pattern: { value: /\S+@\S+\.\S+/, message: 'Invalid email' }
 *     },
 *     password: { required: true, minLength: 8 }
 *   },
 *   onSubmit: async (values) => {
 *     await api.login(values);
 *   }
 * });
 * ```
 */
export function useFormValidation(options: UseFormValidationOptions) {
  const { initialValues, validationRules = {}, onSubmit } = options;

  const createInitialState = useCallback((): Record<string, FieldState> => {
    return Object.keys(initialValues).reduce((acc, key) => {
      acc[key] = {
        value: initialValues[key],
        error: null,
        touched: false,
        dirty: false,
      };
      return acc;
    }, {} as Record<string, FieldState>);
  }, [initialValues]);

  const [fields, setFields] = useState<Record<string, FieldState>>(createInitialState);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateField = useCallback((name: string, value: any): string | null => {
    const rules = validationRules[name];
    if (!rules) return null;

    // Required check
    if (rules.required) {
      const isEmpty = value === undefined || value === null || value === '' ||
        (Array.isArray(value) && value.length === 0);
      if (isEmpty) {
        return typeof rules.required === 'string' ? rules.required : `${name} is required`;
      }
    }

    // Skip other validations if value is empty and not required
    if (value === undefined || value === null || value === '') {
      return null;
    }

    // Min length
    if (rules.minLength !== undefined) {
      const min = typeof rules.minLength === 'number' ? rules.minLength : rules.minLength.value;
      const message = typeof rules.minLength === 'number' 
        ? `Minimum ${min} characters required` 
        : rules.minLength.message;
      if (String(value).length < min) return message;
    }

    // Max length
    if (rules.maxLength !== undefined) {
      const max = typeof rules.maxLength === 'number' ? rules.maxLength : rules.maxLength.value;
      const message = typeof rules.maxLength === 'number'
        ? `Maximum ${max} characters allowed`
        : rules.maxLength.message;
      if (String(value).length > max) return message;
    }

    // Min value
    if (rules.min !== undefined) {
      const min = typeof rules.min === 'number' ? rules.min : rules.min.value;
      const message = typeof rules.min === 'number'
        ? `Minimum value is ${min}`
        : rules.min.message;
      if (Number(value) < min) return message;
    }

    // Max value
    if (rules.max !== undefined) {
      const max = typeof rules.max === 'number' ? rules.max : rules.max.value;
      const message = typeof rules.max === 'number'
        ? `Maximum value is ${max}`
        : rules.max.message;
      if (Number(value) > max) return message;
    }

    // Pattern
    if (rules.pattern) {
      const pattern = rules.pattern instanceof RegExp ? rules.pattern : rules.pattern.value;
      const message = rules.pattern instanceof RegExp
        ? 'Invalid format'
        : rules.pattern.message;
      if (!pattern.test(String(value))) return message;
    }

    // Custom validate
    if (rules.validate) {
      const result = rules.validate(value);
      if (result instanceof Promise) return null;
      if (result !== true) return result;
    }

    return null;
  }, [validationRules]);

  const setValue = useCallback((name: string, value: any) => {
    setFields(prev => {
      const field = prev[name];
      const error = field?.touched ? validateField(name, value) : field?.error ?? null;
      
      return {
        ...prev,
        [name]: {
          value,
          error,
          touched: field?.touched ?? false,
          dirty: true,
        },
      };
    });
  }, [validateField]);

  const setTouched = useCallback((name: string, touched: boolean = true) => {
    setFields(prev => {
      const field = prev[name];
      if (!field) return prev;

      return {
        ...prev,
        [name]: {
          ...field,
          touched,
          error: touched ? validateField(name, field.value) : field.error,
        },
      };
    });
  }, [validateField]);

  const validateAll = useCallback((): boolean => {
    let isValid = true;
    const newFields = { ...fields };

    Object.keys(fields).forEach(name => {
      const error = validateField(name, fields[name].value);
      newFields[name] = {
        ...fields[name],
        touched: true,
        error,
      };
      if (error) isValid = false;
    });

    setFields(newFields);
    return isValid;
  }, [fields, validateField]);

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (!validateAll()) return;

    if (onSubmit) {
      setIsSubmitting(true);
      try {
        const values = Object.entries(fields).reduce((acc, [key, field]) => {
          acc[key] = field.value;
          return acc;
        }, {} as Record<string, any>);
        
        await onSubmit(values);
      } finally {
        setIsSubmitting(false);
      }
    }
  }, [fields, onSubmit, validateAll]);

  const reset = useCallback(() => {
    setFields(createInitialState());
    setIsSubmitting(false);
  }, [createInitialState]);

  const values = useMemo(() => {
    return Object.entries(fields).reduce((acc, [key, field]) => {
      acc[key] = field.value;
      return acc;
    }, {} as Record<string, any>);
  }, [fields]);

  const errors = useMemo(() => {
    return Object.entries(fields).reduce((acc, [key, field]) => {
      if (field.error) acc[key] = field.error;
      return acc;
    }, {} as Record<string, string>);
  }, [fields]);

  const isValid = useMemo(() => {
    return Object.values(fields).every(field => !field.error);
  }, [fields]);

  const isDirty = useMemo(() => {
    return Object.values(fields).some(field => field.dirty);
  }, [fields]);

  return {
    fields,
    values,
    errors,
    isSubmitting,
    isValid,
    isDirty,
    setValue,
    setTouched,
    validateAll,
    handleSubmit,
    reset,
    getFieldProps: (name: string) => ({
      name,
      value: fields[name]?.value ?? '',
      error: fields[name]?.error,
      touched: fields[name]?.touched ?? false,
      onChange: (value: any) => setValue(name, value),
      onBlur: () => setTouched(name, true),
    }),
  };
}

export default useFormValidation;
