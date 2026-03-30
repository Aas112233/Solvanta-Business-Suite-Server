import { ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';
import { clsx } from 'clsx';

export interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: ReactNode;
    children: ReactNode;
    maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | 'fit' | 'full';
    closeOnOutsideClick?: boolean;
    className?: string;
}

export default function Modal({
    isOpen,
    onClose,
    title,
    children,
    maxWidth = 'md',
    closeOnOutsideClick = true,
    className
}: ModalProps) {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('keydown', handleKeyDown);
            document.body.style.overflow = 'hidden';
        }

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const maxWidthClasses = {
        sm: 'max-w-sm',
        md: 'max-w-md',
        lg: 'max-w-lg',
        xl: 'max-w-xl',
        '2xl': 'max-w-2xl',
        '3xl': 'max-w-3xl',
        '4xl': 'max-w-4xl',
        '5xl': 'max-w-5xl',
        'fit': 'max-w-fit',
        'full': 'max-w-full m-4'
    };

    return (
        <div
            className="fixed inset-0 z-[999] flex items-center justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={closeOnOutsideClick ? onClose : undefined}
            aria-modal="true"
            role="dialog"
        >
            <div
                className={clsx(
                    'relative w-full',
                    maxWidthClasses[maxWidth],
                    'bg-background-card',
                    'rounded-lg',
                    'shadow-2xl',
                    'flex flex-col',
                    'max-h-[90vh]',
                    'overflow-hidden',
                    'animate-in slide-in-from-bottom-4 duration-300',
                    className
                )}
                onClick={(e) => e.stopPropagation()}
            >
                {title && (
                    <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle flex-shrink-0">
                        <h2 className="text-lg font-bold text-text-primary">{title}</h2>
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-full text-text-tertiary hover:text-text-secondary hover:bg-background-subtle transition-colors"
                            aria-label="Close modal"
                        >
                            <X size={20} />
                        </button>
                    </div>
                )}
                {!title && (
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-1.5 rounded-full text-text-tertiary hover:text-text-secondary hover:bg-background-subtle transition-colors z-10"
                        aria-label="Close modal"
                    >
                        <X size={20} />
                    </button>
                )}

                <div className="overflow-y-auto w-full flex-grow p-6">
                    {children}
                </div>
            </div>
        </div>
    );
}
