import { Loader2, AlertTriangle, Trash2, Info } from 'lucide-react';
import Modal from './Modal';

interface ConfirmActionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    isPending?: boolean;
    variant?: 'danger' | 'warning' | 'info';
}

export default function ConfirmActionModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    isPending = false,
    variant = 'danger'
}: ConfirmActionModalProps) {

    const variants = {
        danger: {
            icon: <Trash2 size={24} className="text-danger" />,
            iconBg: 'bg-red-100',
            buttonClass: 'bg-danger hover:bg-red-700 text-white focus:ring-red-500'
        },
        warning: {
            icon: <AlertTriangle size={24} className="text-warning" />,
            iconBg: 'bg-amber-100',
            buttonClass: 'bg-amber-600 hover:bg-amber-700 text-white focus:ring-amber-500'
        },
        info: {
            icon: <Info size={24} className="text-info" />,
            iconBg: 'bg-blue-100',
            buttonClass: 'bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-500'
        }
    };

    const currentVariant = variants[variant];

    return (
        <Modal
            isOpen={isOpen}
            onClose={isPending ? () => { } : onClose}
            maxWidth="sm"
            closeOnOutsideClick={!isPending}
        >
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 text-center sm:text-left">
                <div className={`p-3 rounded-full flex-shrink-0 ${currentVariant.iconBg}`}>
                    {currentVariant.icon}
                </div>
                <div className="pt-1 w-full flex-1">
                    <h3 className="text-lg font-bold text-text-primary mb-2">{title}</h3>
                    <p className="text-sm text-text-secondary leading-relaxed mb-6">
                        {message}
                    </p>

                    <div className="flex gap-3 justify-end w-full">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isPending}
                            className="px-4 py-2 text-sm font-semibold rounded-lg text-text-secondary bg-white border border-border hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-200 transition-colors"
                        >
                            {cancelText}
                        </button>
                        <button
                            type="button"
                            onClick={onConfirm}
                            disabled={isPending}
                            className={`px-4 py-2 text-sm font-semibold rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors flex items-center justify-center min-w-[100px] disabled:opacity-50 disabled:cursor-not-allowed ${currentVariant.buttonClass}`}
                        >
                            {isPending ? <Loader2 size={16} className="animate-spin" /> : confirmText}
                        </button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}
