import hotToast, { ToastOptions, Toast, Renderable } from 'react-hot-toast';

type ToastFunction = {
    (message: Renderable, options?: ToastOptions): string;
    success: (message: Renderable, options?: ToastOptions) => string;
    error: (message: Renderable, options?: ToastOptions) => string;
    loading: (message: Renderable, options?: ToastOptions) => string;
    dismiss: (toastId?: string) => void;
    remove: (toastId?: string) => void;
    promise: <T>(
        promise: Promise<T>,
        msgs: {
            loading: Renderable;
            success: Renderable | ((data: T) => Renderable);
            error: Renderable | ((err: any) => Renderable);
        },
        opts?: ToastOptions
    ) => Promise<T>;
    custom: any;
};

// Wrapper around react-hot-toast to prevent duplicate toast messages.
// It sets the toast ID to the message content by default if it's a string.
const toastWrapper: ToastFunction = Object.assign(
    (message: Renderable, options?: ToastOptions) => {
        const id = typeof message === 'string' ? message : undefined;
        return hotToast(message, { id, ...options });
    },
    {
        success: (message: Renderable, options?: ToastOptions) => {
            const id = typeof message === 'string' ? message : undefined;
            return hotToast.success(message, { id, ...options });
        },
        error: (message: Renderable, options?: ToastOptions) => {
            const id = typeof message === 'string' ? message : undefined;
            return hotToast.error(message, { id, ...options });
        },
        loading: (message: Renderable, options?: ToastOptions) => {
            const id = typeof message === 'string' ? message : undefined;
            return hotToast.loading(message, { id, ...options });
        },
        dismiss: hotToast.dismiss,
        remove: hotToast.remove,
        promise: hotToast.promise as any,
        custom: hotToast.custom,
    }
);

export default toastWrapper;
