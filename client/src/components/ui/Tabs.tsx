import { ReactNode, useState } from 'react';
import { clsx } from 'clsx';

// ── Tabs ─────────────────────────────────────────────────────────────
export interface TabItem {
    value: string;
    label: string;
    icon?: ReactNode;
    disabled?: boolean;
    badge?: string | number;
}

export interface TabsProps {
    tabs: TabItem[];
    activeTab: string;
    onChange: (value: string) => void;
    variant?: 'default' | 'pills' | 'underline';
    size?: 'sm' | 'md' | 'lg';
    fullWidth?: boolean;
    className?: string;
}

export function Tabs({
    tabs,
    activeTab,
    onChange,
    variant = 'default',
    size = 'md',
    fullWidth = false,
    className,
}: TabsProps) {
    const variantStyles = {
        default: 'bg-background-subtle p-1 rounded-lg',
        pills: 'gap-2',
        underline: 'gap-6 border-b border-border',
    };

    const tabSizeStyles = {
        sm: 'h-8 text-xs',
        md: 'h-10 text-sm',
        lg: 'h-12 text-base',
    };

    return (
        <div
            className={clsx(
                'flex',
                variantStyles[variant],
                fullWidth && 'w-full',
                className
            )}
        >
            {tabs.map((tab) => {
                const isActive = activeTab === tab.value;
                const isDisabled = tab.disabled;

                return (
                    <button
                        key={tab.value}
                        onClick={() => !isDisabled && onChange(tab.value)}
                        disabled={isDisabled}
                        className={clsx(
                            // Base styles
                            'inline-flex items-center gap-2',
                            'font-medium',
                            'transition-all duration-200',
                            'disabled:cursor-not-allowed disabled:opacity-50',
                            tabSizeStyles[size],
                            // Variant styles
                            variant === 'default' && clsx(
                                'px-4 rounded-lg',
                                isActive
                                    ? 'bg-background-card text-text-primary shadow-sm'
                                    : 'text-text-secondary hover:text-text-primary'
                            ),
                            variant === 'pills' && clsx(
                                'px-4 rounded-full border',
                                isActive
                                    ? 'bg-brand-50 border-brand-200 text-brand-600 dark:bg-brand-500/10 dark:border-brand-700 dark:text-brand-400'
                                    : 'border-border text-text-secondary hover:border-brand-200 hover:text-text-primary'
                            ),
                            variant === 'underline' && clsx(
                                'px-2 border-b-2 -mb-px',
                                isActive
                                    ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                                    : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border'
                            ),
                            fullWidth && 'flex-1 justify-center'
                        )}
                    >
                        {tab.icon && <span className="shrink-0">{tab.icon}</span>}
                        {tab.label}
                        {tab.badge !== undefined && (
                            <span className={clsx(
                                'inline-flex items-center justify-center rounded-full px-1.5 text-xs font-medium',
                                isActive
                                    ? 'bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300'
                                    : 'bg-background-subtle text-text-tertiary'
                            )}>
                                {tab.badge}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}

// ── Tab Panel ────────────────────────────────────────────────────────
export interface TabPanelProps {
    activeTab: string;
    tabValue: string;
    children: ReactNode;
    className?: string;
}

export function TabPanel({ activeTab, tabValue, children, className }: TabPanelProps) {
    if (activeTab !== tabValue) return null;

    return (
        <div className={clsx('animate-scale-in', className)}>
            {children}
        </div>
    );
}

export default Tabs;
