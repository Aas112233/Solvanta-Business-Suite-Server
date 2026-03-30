import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';
import { clsx } from 'clsx';


export interface DropdownOption {
    value: string;
    label: string;
    disabled?: boolean;
}

interface AppDropdownProps {
    value: string;
    onChange: (value: string) => void;
    options: DropdownOption[];
    placeholder?: string;
    disabled?: boolean;
    searchable?: boolean;
    noOptionsText?: string;
    className?: string;
}

export default function AppDropdown({
    value,
    onChange,
    options,
    placeholder = 'Select',
    disabled = false,
    searchable = false,
    noOptionsText = 'No options found',
    className = '',
}: AppDropdownProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const dropdownRef = useRef<HTMLDivElement | null>(null);
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

    const selected = options.find((option) => option.value === value);
    const filtered = useMemo(() => {
        if (!searchable || !search.trim()) return options;
        const key = search.trim().toLowerCase();
        return options.filter((option) => option.label.toLowerCase().includes(key));
    }, [options, search, searchable]);

    useEffect(() => {
        const handleClick = (event: MouseEvent) => {
            if (
                containerRef.current?.contains(event.target as Node) ||
                dropdownRef.current?.contains(event.target as Node)
            ) {
                return;
            }
            setOpen(false);
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const updatePosition = () => {
        if (open && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;

            // rough estimate of dropdown height is ~280px max
            const needsFlip = spaceBelow < 280 && spaceAbove > spaceBelow;

            setDropdownStyle({
                position: 'fixed',
                top: needsFlip ? `${rect.top - 4}px` : `${rect.bottom + 4}px`,
                left: `${rect.left}px`,
                width: `${rect.width}px`,
                transform: needsFlip ? 'translateY(-100%)' : 'none',
                zIndex: 99999,
            });
        }
    };

    useEffect(() => {
        if (open) {
            updatePosition();
            window.addEventListener('scroll', updatePosition, true);
            window.addEventListener('resize', updatePosition);
        }
        return () => {
            window.removeEventListener('scroll', updatePosition, true);
            window.removeEventListener('resize', updatePosition);
        };
    }, [open]);

    return (
        <div ref={containerRef} className={clsx('relative', className)}>
            <button
                type="button"
                disabled={disabled}
                onClick={() => setOpen((prev) => !prev)}
                className={clsx(
                    'w-full flex items-center justify-between',
                    'rounded-lg border px-3 py-2 text-left text-sm',
                    'transition-colors duration-200',
                    disabled
                        ? 'bg-background-subtle text-text-tertiary border-border cursor-not-allowed'
                        : 'bg-background-card text-text-primary border-border hover:border-brand-300',
                    open && 'ring-2 ring-brand-200 border-brand',
                    className
                )}
            >
                <span className={selected ? 'text-text-primary' : 'text-text-tertiary'}>
                    {selected?.label || placeholder}
                </span>
                <ChevronDown size={16} className={clsx('text-text-secondary transition-transform', open ? 'rotate-180' : '')} />
            </button>

            {open && createPortal(
                <div ref={dropdownRef} className="rounded-lg border border-border bg-background-card shadow-lg" style={dropdownStyle}>
                    {searchable && (
                        <div className="p-2 border-b border-border-subtle">
                            <div className="relative">
                                <Search size={14} className="absolute left-2.5 top-2.5 text-text-tertiary" />
                                <input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Search..."
                                    className="w-full rounded-lg border border-border py-1.5 pl-8 pr-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand"
                                />
                            </div>
                        </div>
                    )}

                    <div className="max-h-56 overflow-auto py-1">
                        {filtered.length === 0 && (
                            <div className="px-3 py-2 text-sm text-text-tertiary">{noOptionsText}</div>
                        )}
                        {filtered.map((option) => {
                            const isSelected = option.value === value;
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    disabled={option.disabled}
                                    onClick={() => {
                                        if (option.disabled) return;
                                        onChange(option.value);
                                        setOpen(false);
                                        setSearch('');
                                    }}
                                    className={clsx(
                                        'w-full flex items-center justify-between px-3 py-2 text-sm text-left',
                                        option.disabled
                                            ? 'text-text-tertiary cursor-not-allowed'
                                            : isSelected
                                                ? 'bg-brand-50 text-brand dark:bg-brand-500/10 dark:text-brand-300'
                                                : 'text-text-primary hover:bg-brand-50 dark:hover:bg-brand-500/10'
                                    )}
                                >
                                    <span>{option.label}</span>
                                    {isSelected && <Check size={14} className="text-brand" />}
                                </button>
                            );
                        })}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}

