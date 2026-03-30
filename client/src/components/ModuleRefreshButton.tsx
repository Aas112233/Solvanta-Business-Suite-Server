import { useState } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import Button from './ui/Button';

interface ModuleRefreshButtonProps {
    queryKeys?: QueryKey[];
    className?: string;
}

export default function ModuleRefreshButton({ queryKeys, className }: ModuleRefreshButtonProps) {
    const queryClient = useQueryClient();
    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleRefresh = async () => {
        if (isRefreshing) return;
        setIsRefreshing(true);
        try {
            if (queryKeys && queryKeys.length > 0) {
                await Promise.all(
                    queryKeys.map((key) => queryClient.invalidateQueries({ queryKey: key }))
                );
            } else {
                await queryClient.invalidateQueries();
            }
            await queryClient.refetchQueries({ type: 'active' });
        } finally {
            setTimeout(() => setIsRefreshing(false), 250);
        }
    };

    return (
        <Button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            loading={isRefreshing}
            variant="secondary"
            icon={!isRefreshing ? <RefreshCw size={16} /> : undefined}
            className={className}
            title="Refresh data"
        >
            Refresh
        </Button>
    );
}
