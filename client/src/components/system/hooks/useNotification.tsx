import toast from '@/lib/toast';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
  type LucideIcon
} from 'lucide-react';
import React from 'react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastOptions {
  duration?: number;
  position?: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
  id?: string;
  dismissible?: boolean;
}

interface ToastConfig {
  icon: LucideIcon;
  iconClass: string;
  duration: number;
}

const toastConfigs: Record<ToastType, ToastConfig> = {
  success: {
    icon: CheckCircle,
    iconClass: 'text-success',
    duration: 3000,
  },
  error: {
    icon: XCircle,
    iconClass: 'text-danger',
    duration: 5000,
  },
  warning: {
    icon: AlertTriangle,
    iconClass: 'text-warning',
    duration: 4000,
  },
  info: {
    icon: Info,
    iconClass: 'text-text-brand',
    duration: 3000,
  },
};

function createToastContent(
  message: string,
  title: string | undefined,
  type: ToastType
): React.ReactElement {
  const config = toastConfigs[type];
  const Icon = config.icon;

  return (
    <div className="flex items-start gap-3">
      <Icon className={`w-5 h-5 mt-0.5 ${config.iconClass}`} />
      <div className="flex-1">
        {title && (
          <p className="font-semibold text-sm text-text-primary">
            {title}
          </p>
        )}
        <p className={`text-sm ${title ? 'text-text-secondary' : 'text-text-primary'}`}>
          {message}
        </p>
      </div>
    </div>
  );
}

/**
 * Hook for displaying consistent toast notifications throughout the application.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const notify = useNotification();
 *
 *   const handleSave = async () => {
 *     try {
 *       await saveData();
 *       notify.success('Data saved successfully');
 *     } catch (error) {
 *       notify.error('Failed to save data', 'Please try again later');
 *     }
 *   };
 * }
 * ```
 */
export function useNotification() {
  const show = (
    type: ToastType,
    message: string,
    title?: string,
    options: ToastOptions = {}
  ): string => {
    const config = toastConfigs[type];
    const content = createToastContent(message, title, type);

    return toast(content, {
      duration: options.duration ?? config.duration,
      position: options.position ?? 'top-right',
      id: options.id,
    });
  };

  return {
    success: (message: string, title?: string, options?: ToastOptions) =>
      show('success', message, title, options),

    error: (message: string, title?: string, options?: ToastOptions) =>
      show('error', message, title ?? 'Error', options),

    warning: (message: string, title?: string, options?: ToastOptions) =>
      show('warning', message, title, options),

    info: (message: string, title?: string, options?: ToastOptions) =>
      show('info', message, title, options),

    dismiss: (toastId: string) => toast.dismiss(toastId),

    dismissAll: () => toast.dismiss(),

    promise: <T,>(
      promise: Promise<T>,
      messages: {
        loading: string;
        success: string | ((data: T) => string);
        error: string | ((error: any) => string);
      },
      options?: ToastOptions
    ): Promise<T> => {
      return toast.promise(
        promise,
        {
          loading: messages.loading,
          success: messages.success,
          error: messages.error,
        },
        {
          position: options?.position ?? 'top-right',
        }
      );
    },
  };
}

export default useNotification;
