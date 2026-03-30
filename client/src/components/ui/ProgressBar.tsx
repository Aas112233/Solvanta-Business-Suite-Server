import { clsx } from 'clsx';

// ── Progress Bar ─────────────────────────────────────────────────────
export interface ProgressBarProps {
    value: number;
    max?: number;
    variant?: 'default' | 'success' | 'warning' | 'danger' | 'brand';
    size?: 'sm' | 'md' | 'lg';
    showLabel?: boolean;
    label?: string;
    animated?: boolean;
    className?: string;
}

const sizeStyles = {
    sm: 'h-1.5',
    md: 'h-2.5',
    lg: 'h-4',
};

const variantStyles = {
    default: 'bg-brand-500',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
    brand: 'bg-gradient-brand',
};

export function ProgressBar({
    value,
    max = 100,
    variant = 'default',
    size = 'md',
    showLabel = false,
    label,
    animated = false,
    className,
}: ProgressBarProps) {
    const percentage = Math.min(100, Math.max(0, (value / max) * 100));

    return (
        <div className={clsx('w-full', className)}>
            {(showLabel || label) && (
                <div className="flex items-center justify-between mb-1">
                    {label && (
                        <span className="text-sm font-medium text-text-secondary">
                            {label}
                        </span>
                    )}
                    {showLabel && (
                        <span className="text-sm font-medium text-text-tertiary">
                            {Math.round(percentage)}%
                        </span>
                    )}
                </div>
            )}
            <div
                className={clsx(
                    'w-full rounded-full bg-background-subtle overflow-hidden',
                    sizeStyles[size]
                )}
                role="progressbar"
                aria-valuenow={percentage}
                aria-valuemin={0}
                aria-valuemax={100}
            >
                <div
                    className={clsx(
                        'h-full rounded-full transition-all duration-500 ease-out',
                        variantStyles[variant],
                        animated && 'animate-progress'
                    )}
                    style={{ width: `${percentage}%` }}
                />
            </div>
        </div>
    );
}

// ── Circular Progress ────────────────────────────────────────────────
export interface CircularProgressProps {
    value: number;
    max?: number;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    variant?: 'default' | 'success' | 'warning' | 'danger' | 'brand';
    showLabel?: boolean;
    label?: string;
    strokeWidth?: number;
    className?: string;
}

const circularSizeMap = {
    sm: 48,
    md: 64,
    lg: 80,
    xl: 100,
};

const circularStrokeWidthMap = {
    sm: 4,
    md: 5,
    lg: 6,
    xl: 8,
};

const circularVariantColors = {
    default: '#2D7FF9',
    success: '#1FAF8F',
    warning: '#D97706',
    danger: '#DC2626',
    brand: '#0F1E2E',
};

export function CircularProgress({
    value,
    max = 100,
    size = 'md',
    variant = 'default',
    showLabel = false,
    label,
    strokeWidth,
    className,
}: CircularProgressProps) {
    const percentage = Math.min(100, Math.max(0, (value / max) * 100));
    const dimension = circularSizeMap[size];
    const stroke = strokeWidth || circularStrokeWidthMap[size];
    const radius = (dimension - stroke) / 2;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (percentage / 100) * circumference;
    const color = circularVariantColors[variant];

    return (
        <div
            className={clsx('relative inline-flex items-center justify-center', className)}
            style={{ width: dimension, height: dimension }}
        >
            <svg
                className="transform -rotate-90"
                width={dimension}
                height={dimension}
            >
                {/* Background circle */}
                <circle
                    cx={dimension / 2}
                    cy={dimension / 2}
                    r={radius}
                    fill="none"
                    stroke="var(--color-background-subtle)"
                    strokeWidth={stroke}
                />
                {/* Progress circle */}
                <circle
                    cx={dimension / 2}
                    cy={dimension / 2}
                    r={radius}
                    fill="none"
                    stroke={color}
                    strokeWidth={stroke}
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    className="transition-all duration-500 ease-out"
                />
            </svg>
            {(showLabel || label) && (
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    {showLabel && (
                        <span className="text-lg font-bold text-text-primary">
                            {Math.round(percentage)}%
                        </span>
                    )}
                    {label && (
                        <span className="text-xs text-text-tertiary mt-0.5">
                            {label}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Stepper ──────────────────────────────────────────────────────────
export interface Step {
    id: string;
    label: string;
    description?: string;
    status?: 'pending' | 'current' | 'completed';
}

export interface StepperProps {
    steps: Step[];
    currentStep: number;
    onStepClick?: (stepIndex: number) => void;
    orientation?: 'horizontal' | 'vertical';
    className?: string;
}

export function Stepper({
    steps,
    currentStep,
    onStepClick,
    orientation = 'horizontal',
    className,
}: StepperProps) {
    const getStepStatus = (index: number): Step['status'] => {
        if (index < currentStep) return 'completed';
        if (index === currentStep) return 'current';
        return 'pending';
    };

    const stepContainerClass = orientation === 'horizontal'
        ? 'flex items-center'
        : 'flex flex-col';

    const connectorClass = orientation === 'horizontal'
        ? 'flex-1 h-0.5 mx-2'
        : 'w-0.5 h-full ml-5';

    return (
        <nav className={clsx(stepContainerClass, className)} aria-label="Progress">
            {steps.map((step, index) => {
                const status = getStepStatus(index);
                const isClickable = onStepClick && status !== 'pending';

                return (
                    <div key={step.id} className={clsx(
                        'relative',
                        orientation === 'horizontal' ? 'flex items-center' : 'flex items-start'
                    )}>
                        {/* Step Circle */}
                        <button
                            type="button"
                            onClick={() => isClickable && onStepClick(index)}
                            disabled={!isClickable}
                            className={clsx(
                                'relative flex items-center justify-center rounded-full transition-all duration-200',
                                'h-8 w-8 text-sm font-semibold',
                                status === 'completed' && 'bg-success text-white',
                                status === 'current' && 'bg-brand-500 text-white ring-4 ring-brand-100',
                                status === 'pending' && 'bg-background-subtle text-text-tertiary',
                                isClickable && 'cursor-pointer hover:opacity-80',
                                !isClickable && 'cursor-default'
                            )}
                        >
                            {status === 'completed' ? (
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            ) : (
                                <span>{index + 1}</span>
                            )}
                        </button>

                        {/* Connector */}
                        {index < steps.length - 1 && (
                            <div
                                className={clsx(
                                    connectorClass,
                                    status === 'completed' ? 'bg-success' : 'bg-background-subtle'
                                )}
                            />
                        )}

                        {/* Step Label */}
                        {(orientation === 'vertical' || status === 'current') && (
                            <div className={clsx(
                                orientation === 'horizontal' ? 'absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-6' : 'ml-3',
                                'text-center whitespace-nowrap'
                            )}>
                                <p className={clsx(
                                    'text-sm font-medium',
                                    status === 'current' ? 'text-text-primary' : 'text-text-tertiary'
                                )}>
                                    {step.label}
                                </p>
                                {step.description && status === 'current' && (
                                    <p className="text-xs text-text-tertiary mt-0.5">
                                        {step.description}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </nav>
    );
}

// Add progress animation
const progressAnimationStyles = `
@keyframes progress {
    0% {
        background-position: 0% 50%;
    }
    50% {
        background-position: 100% 50%;
    }
    100% {
        background-position: 0% 50%;
    }
}

.animate-progress {
    background-size: 200% 100%;
    animation: progress 2s ease-in-out infinite;
}
`;

if (typeof document !== 'undefined') {
    const styleId = 'progress-animation-styles';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = progressAnimationStyles;
        document.head.appendChild(style);
    }
}

export default ProgressBar;
