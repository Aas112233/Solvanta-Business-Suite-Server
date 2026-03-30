import { ReactNode } from 'react';
import { clsx } from 'clsx';

// ── Page Header ──────────────────────────────────────────────────────
interface PageHeaderProps {
    title: string;
    subtitle?: string;
    action?: ReactNode;
    breadcrumb?: Array<{ label: string; href?: string }>;
    className?: string;
}

export function PageHeader({
    title,
    subtitle,
    action,
    breadcrumb,
    className,
}: PageHeaderProps) {
    return (
        <div className={clsx('space-y-1', className)}>
            {breadcrumb && breadcrumb.length > 0 && (
                <nav className="flex items-center gap-2 text-sm text-text-tertiary">
                    {breadcrumb.map((item, index) => (
                        <span key={index} className="flex items-center gap-2">
                            {index > 0 && <span className="text-text-tertiary">/</span>}
                            {item.href ? (
                                <a
                                    href={item.href}
                                    className="text-text-secondary hover:text-brand transition-colors"
                                >
                                    {item.label}
                                </a>
                            ) : (
                                <span className="text-text-primary font-medium">{item.label}</span>
                            )}
                        </span>
                    ))}
                </nav>
            )}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-text-primary">{title}</h1>
                    {subtitle && (
                        <p className="mt-1 text-sm text-text-secondary">{subtitle}</p>
                    )}
                </div>
                {action && <div className="shrink-0">{action}</div>}
            </div>
        </div>
    );
}

// ── Page Content ─────────────────────────────────────────────────────
interface PageContentProps {
    children: ReactNode;
    className?: string;
    padding?: 'none' | 'sm' | 'md' | 'lg';
}

export function PageContent({ children, className, padding = 'md' }: PageContentProps) {
    const paddingStyles = {
        none: '',
        sm: 'p-4',
        md: 'p-6',
        lg: 'p-8',
    };

    return (
        <div className={clsx('flex-1 overflow-auto', paddingStyles[padding], className)}>
            {children}
        </div>
    );
}

// ── Page Layout ──────────────────────────────────────────────────────
interface PageLayoutProps {
    children: ReactNode;
    className?: string;
    fullWidth?: boolean;
}

export function PageLayout({ children, className, fullWidth = false }: PageLayoutProps) {
    return (
        <div
            className={clsx(
                'h-full',
                'flex flex-col',
                'bg-background-app',
                fullWidth ? '' : 'max-w-7xl mx-auto',
                className
            )}
        >
            {children}
        </div>
    );
}

// ── Section Header ───────────────────────────────────────────────────
interface SectionHeaderProps {
    title: string;
    description?: string;
    action?: ReactNode;
    className?: string;
}

export function SectionHeader({ title, description, action, className }: SectionHeaderProps) {
    return (
        <div className={clsx('flex items-start justify-between gap-4 mb-6', className)}>
            <div>
                <h2 className="text-lg font-bold text-text-primary">{title}</h2>
                {description && (
                    <p className="mt-1 text-sm text-text-secondary">{description}</p>
                )}
            </div>
            {action && <div className="shrink-0">{action}</div>}
        </div>
    );
}

// ── Search Input ─────────────────────────────────────────────────────
interface SearchInputProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    fullWidth?: boolean;
    disabled?: boolean;
}

import { Search, X } from 'lucide-react';
import Input from './Input';

export function SearchInput({
    value,
    onChange,
    placeholder = 'Search...',
    className,
    fullWidth = true,
    disabled,
}: SearchInputProps) {
    return (
        <div className={clsx('relative', fullWidth && 'w-full', className)}>
            <Input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                icon={<Search size={16} />}
                fullWidth={fullWidth}
                disabled={disabled}
                className="pr-10"
            />
            {value && (
                <button
                    onClick={() => onChange('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors"
                    type="button"
                    aria-label="Clear search"
                >
                    <X size={14} />
                </button>
            )}
        </div>
    );
}

// ── Filter Bar ───────────────────────────────────────────────────────
interface FilterBarProps {
    children: ReactNode;
    className?: string;
}

export function FilterBar({ children, className }: FilterBarProps) {
    return (
        <div
            className={clsx(
                'flex flex-wrap items-center gap-3',
                'p-4',
                'bg-background-card',
                'border border-border',
                'rounded-lg',
                className
            )}
        >
            {children}
        </div>
    );
}

export default PageHeader;
