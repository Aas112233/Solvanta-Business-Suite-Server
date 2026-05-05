import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { Lock, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { z } from 'zod';
import { Button, Card, Input } from '../components/ui';

const resetPasswordSchema = z.object({
    password: z.string()
        .min(8, 'Password must be at least 8 characters')
        .max(128, 'Password must be less than 128 characters')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number'),
    confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
});

export default function ResetPassword() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string }>({});

    const token = searchParams.get('token');

    useEffect(() => {
        if (!token) {
            toast.error('Invalid reset link');
            navigate('/login');
        }
    }, [token, navigate]);

    const getPasswordStrength = (pwd: string): { score: number; label: string; color: string } => {
        let score = 0;
        if (pwd.length >= 8) score++;
        if (pwd.length >= 12) score++;
        if (/[A-Z]/.test(pwd)) score++;
        if (/[a-z]/.test(pwd)) score++;
        if (/[0-9]/.test(pwd)) score++;
        if (/[^A-Za-z0-9]/.test(pwd)) score++;

        if (score <= 2) return { score, label: 'Weak', color: 'bg-danger' };
        if (score <= 4) return { score, label: 'Medium', color: 'bg-warning' };
        return { score, label: 'Strong', color: 'bg-success' };
    };

    const passwordStrength = getPasswordStrength(password);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const parsed = resetPasswordSchema.safeParse({ password, confirmPassword });
        if (!parsed.success) {
            const newErrors: any = {};
            parsed.error.issues.forEach((issue) => {
                const field = issue.path[0];
                if (field === 'password' || field === 'confirmPassword') {
                    newErrors[field] = issue.message;
                }
            });
            setErrors(newErrors);
            return;
        }

        setErrors({});
        setLoading(true);
        try {
            await api.post('/auth/reset-password', {
                token,
                password,
            });
            toast.success('Password reset successfully');
            navigate('/login');
        } catch (err: any) {
            toast.error(err.response?.data?.error?.message || 'Failed to reset password');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-background-app flex items-center justify-center px-4">
            <div className="w-full max-w-md space-y-8">
                <div className="text-center">
                    <img
                        src="/logo.png"
                        alt="Solvanta Logo"
                        className="mx-auto mb-6 h-12 w-12 rounded-2xl shadow-lg shadow-brand-500/15"
                    />
                    <h1 className="text-3xl font-bold text-text-primary">Reset password</h1>
                    <p className="mt-2 text-sm text-text-secondary">
                        Enter your new password below.
                    </p>
                </div>

                <Card padding="lg">
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-text-secondary mb-2">
                                New Password
                            </label>
                            <div className="relative">
                                <Input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => {
                                        setPassword(e.target.value);
                                        setErrors((current) => ({ ...current, password: undefined }));
                                    }}
                                    icon={<Lock size={18} />}
                                    placeholder="Enter new password"
                                    fullWidth
                                    className="pr-11"
                                    error={!!errors.password}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary"
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                            {errors.password && <p className="text-sm text-danger mt-1">{errors.password}</p>}
                            
                            {/* Password strength meter */}
                            {password && (
                                <div className="mt-2">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs text-text-secondary">Password strength</span>
                                        <span className={`text-xs font-medium ${
                                            passwordStrength.label === 'Weak' ? 'text-danger' :
                                            passwordStrength.label === 'Medium' ? 'text-warning' :
                                            'text-success'
                                        }`}>
                                            {passwordStrength.label}
                                        </span>
                                    </div>
                                    <div className="h-2 bg-bg-tertiary rounded-full overflow-hidden">
                                        <div
                                            className={`h-full transition-all duration-300 ${passwordStrength.color}`}
                                            style={{ width: `${(passwordStrength.score / 6) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div>
                            <label htmlFor="confirmPassword" className="block text-sm font-medium text-text-secondary mb-2">
                                Confirm Password
                            </label>
                            <div className="relative">
                                <Input
                                    id="confirmPassword"
                                    type={showConfirmPassword ? 'text' : 'password'}
                                    value={confirmPassword}
                                    onChange={(e) => {
                                        setConfirmPassword(e.target.value);
                                        setErrors((current) => ({ ...current, confirmPassword: undefined }));
                                    }}
                                    icon={<Lock size={18} />}
                                    placeholder="Confirm new password"
                                    fullWidth
                                    className="pr-11"
                                    error={!!errors.confirmPassword}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary"
                                >
                                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                            {errors.confirmPassword && <p className="text-sm text-danger mt-1">{errors.confirmPassword}</p>}
                        </div>

                        <Button type="submit" loading={loading} fullWidth>
                            Reset Password
                        </Button>
                    </form>
                </Card>
            </div>
        </div>
    );
}
