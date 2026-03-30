import { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from 'lucide-react';

// ── Toast Types ──────────────────────────────────────────────────────
export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
    id: string;
    type: ToastType;
    title: string;
    message?: string;
    duration?: number;
}

// ── Toast Context ────────────────────────────────────────────────────
let toastListeners: Set<(toasts: Toast[]) => void> = new Set();
let currentToasts: Toast[] = [];

export const toast = {
    success: (title: string, message?: string, duration?: number) =>
        addToast({ type: 'success', title, message, duration }),
    error: (title: string, message?: string, duration?: number) =>
        addToast({ type: 'error', title, message, duration }),
    warning: (title: string, message?: string, duration?: number) =>
        addToast({ type: 'warning', title, message, duration }),
    info: (title: string, message?: string, duration?: number) =>
        addToast({ type: 'info', title, message, duration }),
    dismiss: (id: string) => removeToast(id),
    dismissAll: () => clearToasts(),
};

function addToast(toastData: Omit<Toast, 'id'>) {
    const id = Math.random().toString(36).slice(2);
    const newToast: Toast = {
        id,
        duration: 5000,
        ...toastData,
    };
    currentToasts = [...currentToasts, newToast];
    notifyListeners();

    if (newToast.duration) {
        setTimeout(() => removeToast(id), newToast.duration);
    }

    return id;
}

function removeToast(id: string) {
    currentToasts = currentToasts.filter((t) => t.id !== id);
    notifyListeners();
}

function clearToasts() {
    currentToasts = [];
    notifyListeners();
}

function notifyListeners() {
    toastListeners.forEach((listener) => listener(currentToasts));
}

export function useToast() {
    useEffect(() => {
        return () => {
            toastListeners.clear();
        };
    }, []);
    return toast;
}

// ── Toast Container ──────────────────────────────────────────────────
export function ToastContainer() {
    const [toasts, setToasts] = useState<Toast[]>([]);

    useEffect(() => {
        const listener = (newToasts: Toast[]) => {
            setToasts([...newToasts]);
        };
        toastListeners.add(listener);
        setToasts(currentToasts);

        return () => {
            toastListeners.delete(listener);
        };
    }, []);

    if (toasts.length === 0) return null;

    return (
        <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2">
            {toasts.map((toastItem) => (
                <ToastItem
                    key={toastItem.id}
                    toast={toastItem}
                    onDismiss={() => toast.dismiss(toastItem.id)}
                />
            ))}
        </div>
    );
}

// ── Toast Item ───────────────────────────────────────────────────────
interface ToastItemProps {
    toast: Toast;
    onDismiss: () => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
    const [isExiting, setIsExiting] = useState(false);

    const handleDismiss = () => {
        setIsExiting(true);
        setTimeout(onDismiss, 200);
    };

    const icons = {
        success: <CheckCircle2 size={20} className="text-success" />,
        error: <AlertCircle size={20} className="text-danger" />,
        warning: <AlertTriangle size={20} className="text-warning" />,
        info: <Info size={20} className="text-brand" />,
    };

    const bgColors = {
        success: 'bg-success-soft border-success/20',
        error: 'bg-danger-soft border-danger/20',
        warning: 'bg-warning-soft border-warning/20',
        info: 'bg-brand-50 border-brand/20 dark:bg-brand-500/10',
    };

    return (
        <div
            className={clsx(
                'flex items-start gap-3 p-4 rounded-lg border shadow-lg',
                'bg-background-card',
                'min-w-[320px] max-w-md',
                'animate-scale-in',
                isExiting && 'animate-out fade-out slide-out-to-right duration-200',
                bgColors[toast.type]
            )}
            role="alert"
        >
            <span className="shrink-0 mt-0.5">{icons[toast.type]}</span>
            <div className="flex-1 min-w-0">
                <p className="font-semibold text-text-primary text-sm">{toast.title}</p>
                {toast.message && (
                    <p className="mt-1 text-sm text-text-secondary">{toast.message}</p>
                )}
            </div>
            <button
                onClick={handleDismiss}
                className="shrink-0 p-1 text-text-tertiary hover:text-text-primary transition-colors"
            >
                <X size={16} />
            </button>
        </div>
    );
}

export default ToastContainer;
