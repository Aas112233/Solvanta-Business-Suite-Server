/**
 * Shared types for the component system
 */

// ============================================================================
// Base Types
// ============================================================================

export type Size = 'sm' | 'md' | 'lg';
export type Variant = 'default' | 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
export type Status = 'idle' | 'loading' | 'success' | 'error';
export type Align = 'left' | 'center' | 'right';
export type VerticalAlign = 'top' | 'middle' | 'bottom';

// ============================================================================
// Layout Types
// ============================================================================

export interface BreadcrumbItem {
  label: string;
  href?: string;
  icon?: React.ComponentType<{ className?: string }>;
}

export interface ActionItem {
  label: string;
  onClick: () => void;
  icon?: React.ComponentType<{ className?: string }>;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
}

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  badge?: number | string;
  disabled?: boolean;
}

// ============================================================================
// Data Types
// ============================================================================

export type SortDirection = 'asc' | 'desc' | null;

export interface Column<T = any> {
  key: string;
  header: string;
  width?: string | number;
  align?: Align;
  sortable?: boolean;
  render?: (row: T, index: number) => React.ReactNode;
  accessor?: (row: T) => any;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

// ============================================================================
// Form Types
// ============================================================================

export type FieldSize = 'sm' | 'md' | 'lg';
export type FieldStatus = 'default' | 'error' | 'success' | 'warning';

export interface ValidationRule {
  required?: boolean | string;
  min?: number | { value: number; message: string };
  max?: number | { value: number; message: string };
  minLength?: number | { value: number; message: string };
  maxLength?: number | { value: number; message: string };
  pattern?: RegExp | { value: RegExp; message: string };
  validate?: (value: any) => string | true | Promise<string | true>;
}

export interface FieldOption {
  value: string;
  label: string;
  disabled?: boolean;
  description?: string;
}

// ============================================================================
// API Types
// ============================================================================

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
  errors?: Record<string, string[]>;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    pagination: PaginationInfo;
  };
}

// ============================================================================
// Component Base Props
// ============================================================================

export interface BaseComponentProps {
  className?: string;
  id?: string;
  'data-testid'?: string;
}

export interface InteractiveProps {
  disabled?: boolean;
  loading?: boolean;
  onClick?: (event: React.MouseEvent) => void;
}

export interface AccessibleProps {
  ariaLabel?: string;
  ariaDescribedBy?: string;
  ariaExpanded?: boolean;
  ariaHidden?: boolean;
  role?: string;
}
