// Design System Components - SOLVANTA Business Suite
// Unified UI component library for consistent design

// Hooks
export { useAppTranslation } from '../../hooks/useAppTranslation';

// Buttons
export { default as Button } from './Button';
export type { ButtonProps } from './Button';

// Tables
export {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
    TableLoading,
    TableEmpty,
} from './Table';

// Cards
export {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
    CardFooter,
    StatCard,
    StatsGrid,
} from './Card';

// Forms
export { default as Input } from './Input';
export type { InputProps } from './Input';
export { default as Select } from './Select';
export type { SelectOption, SelectProps } from './Select';
export {
    FormField,
    FormGroup,
    FormActions,
} from './FormField';
export { DatePicker, DateRangePicker } from './DatePicker';

// Badges
export {
    Badge,
    StatusBadge,
} from './Badge';
export type { BadgeProps, BadgeVariant, BadgeSize } from './Badge';

// Layout
export {
    PageHeader,
    PageContent,
    PageLayout,
    SectionHeader,
    SearchInput,
    FilterBar,
} from './PageHeader';

// Tabs
export { Tabs, TabPanel } from './Tabs';
export type { TabItem, TabsProps, TabPanelProps } from './Tabs';

// Toast
export {
    default as ToastContainer,
    useToast,
    toast,
} from './Toast';
export type { Toast, ToastType } from './Toast';

// Empty State
export {
    EmptyState,
    EmptyDataState,
    EmptySearchState,
    EmptyCustomersState,
    EmptyProductsState,
    EmptyOrdersState,
} from './EmptyState';
export type { EmptyStateProps } from './EmptyState';

// Skeleton
export {
    Skeleton,
    SkeletonText,
    SkeletonCard,
    SkeletonTable,
    SkeletonAvatar,
} from './Skeleton';
export type { SkeletonProps, SkeletonTextProps, SkeletonCardProps, SkeletonTableProps, SkeletonAvatarProps } from './Skeleton';

// Avatar
export { Avatar, AvatarGroup } from './Avatar';
export type { AvatarProps, AvatarGroupProps } from './Avatar';

// Progress
export {
    ProgressBar,
    CircularProgress,
    Stepper,
} from './ProgressBar';
export type {
    ProgressBarProps,
    CircularProgressProps,
    StepperProps,
    Step,
} from './ProgressBar';

// System Components (New Architecture)
export * from '../system';

// Existing Components (Updated)
export { default as Modal } from './Modal';
export type { ModalProps } from './Modal';
export { default as AppDropdown } from './AppDropdown';
export type { DropdownOption } from './AppDropdown';
export { default as Pagination } from './Pagination';
export { default as AppLoader } from './AppLoader';
export { default as DateRangeFilter } from './DateRangeFilter';
export { default as ConfirmActionModal } from './ConfirmActionModal';
export { default as LanguageSwitcher } from './LanguageSwitcher';
