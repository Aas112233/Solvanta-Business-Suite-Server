import { clsx } from 'clsx';
import { User } from 'lucide-react';

// ── Avatar ───────────────────────────────────────────────────────────
export interface AvatarProps {
    src?: string;
    alt?: string;
    name?: string;
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
    variant?: 'image' | 'initials' | 'icon';
    status?: 'online' | 'offline' | 'busy' | 'away';
    className?: string;
}

const sizeMap = {
    xs: 'h-6 w-6 text-xs',
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-12 w-12 text-base',
    xl: 'h-14 w-14 text-lg',
    '2xl': 'h-16 w-16 text-xl',
};

const statusColors = {
    online: 'bg-success border-background-card',
    offline: 'bg-text-tertiary border-background-card',
    busy: 'bg-danger border-background-card',
    away: 'bg-warning border-background-card',
};

const statusSizeMap = {
    xs: 'h-1.5 w-1.5',
    sm: 'h-2 w-2',
    md: 'h-2.5 w-2.5',
    lg: 'h-3 w-3',
    xl: 'h-3.5 w-3.5',
    '2xl': 'h-4 w-4',
};

const avatarColors = [
    'bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300',
    'bg-success-soft text-success dark:bg-success/20 dark:text-success',
    'bg-warning-soft text-warning dark:bg-warning/20 dark:text-warning',
    'bg-danger-soft text-danger dark:bg-danger/20 dark:text-danger',
    'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300',
    'bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-300',
    'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300',
    'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300',
];

function getColorIndex(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash) % avatarColors.length;
}

function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({
    src,
    alt,
    name,
    size = 'md',
    variant = 'image',
    status,
    className,
}: AvatarProps) {
    const hasImage = src && variant !== 'icon';
    const showInitials = !hasImage && name && variant !== 'icon';
    const showIcon = !hasImage && !showInitials;

    const colorIndex = name ? getColorIndex(name) : 0;
    const bgColor = avatarColors[colorIndex];

    return (
        <div
            className={clsx(
                'relative inline-flex items-center justify-center rounded-full overflow-hidden',
                'font-semibold',
                sizeMap[size],
                hasImage ? 'bg-background-subtle' : bgColor,
                className
            )}
        >
            {hasImage && (
                <img
                    src={src}
                    alt={alt || name || ''}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                    }}
                />
            )}
            {showInitials && (
                <span>{getInitials(name)}</span>
            )}
            {showIcon && (
                <User size={16} className="opacity-60" />
            )}

            {status && (
                <span
                    className={clsx(
                        'absolute bottom-0 right-0 rounded-full border-2',
                        statusSizeMap[size],
                        statusColors[status]
                    )}
                />
            )}
        </div>
    );
}

// ── Avatar Group ─────────────────────────────────────────────────────
export interface AvatarGroupProps {
    avatars: Array<{
        src?: string;
        name?: string;
        status?: 'online' | 'offline' | 'busy' | 'away';
    }>;
    size?: 'sm' | 'md' | 'lg';
    max?: number;
    className?: string;
}

export function AvatarGroup({
    avatars,
    size = 'md',
    max = 5,
    className,
}: AvatarGroupProps) {
    const displayAvatars = avatars.slice(0, max);
    const remaining = avatars.length - max;

    return (
        <div
            className={clsx(
                'flex -space-x-2',
                className
            )}
        >
            {displayAvatars.map((avatar, index) => (
                <Avatar
                    key={index}
                    name={avatar.name}
                    src={avatar.src}
                    status={avatar.status}
                    size={size}
                    className="ring-2 ring-background-card"
                />
            ))}
            {remaining > 0 && (
                <div
                    className={clsx(
                        'flex items-center justify-center rounded-full bg-background-subtle font-semibold text-text-secondary',
                        sizeMap[size]
                    )}
                >
                    +{remaining}
                </div>
            )}
        </div>
    );
}

export default Avatar;
