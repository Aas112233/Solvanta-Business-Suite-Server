import { clsx } from 'clsx';
import { Inbox, FileText, Users, Package, ShoppingCart, AlertCircle } from 'lucide-react';
import { ReactNode } from 'react';

// ── Empty State ──────────────────────────────────────────────────────
export interface EmptyStateProps {
    icon?: ReactNode;
    title: string;
    description?: string;
    action?: ReactNode;
    variant?: 'default' | 'data' | 'search' | 'error';
    className?: string;
}

const variantConfig = {
    default: {
        icon: <Inbox size={48} />,
        title: 'No items yet',
    },
    data: {
        icon: <FileText size={48} />,
        title: 'No data available',
    },
    search: {
        icon: <AlertCircle size={48} />,
        title: 'No results found',
    },
    error: {
        icon: <AlertCircle size={48} />,
        title: 'Something went wrong',
    },
};

export function EmptyState({
    icon,
    title,
    description,
    action,
    variant = 'default',
    className,
}: EmptyStateProps) {
    const config = variantConfig[variant];

    return (
        <div
            className={clsx(
                'flex flex-col items-center justify-center',
                'p-12',
                'text-center',
                className
            )}
        >
            <div className="text-text-tertiary mb-4">
                {icon || config.icon}
            </div>
            <h3 className="text-lg font-semibold text-text-primary">
                {title}
            </h3>
            {description && (
                <p className="mt-2 text-sm text-text-secondary max-w-md">
                    {description}
                </p>
            )}
            {action && (
                <div className="mt-6">{action}</div>
            )}
        </div>
    );
}

// ── Preset Empty States ──────────────────────────────────────────────
export function EmptyDataState({ description, action, className }: Omit<EmptyStateProps, 'variant' | 'title' | 'icon'>) {
    return (
        <EmptyState
            variant="data"
            title="No data available"
            description={description}
            action={action}
            className={className}
        />
    );
}

export function EmptySearchState({ searchTerm, action, className }: Omit<EmptyStateProps, 'variant' | 'title' | 'icon'> & { searchTerm?: string }) {
    return (
        <EmptyState
            variant="search"
            title="No results found"
            description={searchTerm ? `No results found for "${searchTerm}". Try a different search term.` : 'Try adjusting your search or filters'}
            action={action}
            className={className}
        />
    );
}

export function EmptyCustomersState({ action, className }: Omit<EmptyStateProps, 'variant' | 'title' | 'icon'>) {
    return (
        <EmptyState
            icon={<Users size={48} />}
            title="No customers yet"
            description="Get started by adding your first customer"
            action={action}
            className={className}
        />
    );
}

export function EmptyProductsState({ action, className }: Omit<EmptyStateProps, 'variant' | 'title' | 'icon'>) {
    return (
        <EmptyState
            icon={<Package size={48} />}
            title="No products yet"
            description="Add your first product to get started"
            action={action}
            className={className}
        />
    );
}

export function EmptyOrdersState({ action, className }: Omit<EmptyStateProps, 'variant' | 'title' | 'icon'>) {
    return (
        <EmptyState
            icon={<ShoppingCart size={48} />}
            title="No orders yet"
            description="Orders will appear here once customers start purchasing"
            action={action}
            className={className}
        />
    );
}

export default EmptyState;
