import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import api from '../lib/api';
import {
    Lock,
    Mail,
    Eye,
    EyeOff,
    ShieldCheck,
    TrendingUp,
    Users,
    CheckCircle2,
    type LucideIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { z } from 'zod';
import { Badge, Button, Card, Input } from '../components/ui';

const heroFeatures: Array<{ icon: LucideIcon; title: string; subtitle: string }> = [
    { icon: TrendingUp, title: 'Revenue Visibility', subtitle: 'Global branch tracking and real-time analytics' },
    { icon: Users, title: 'Team Optimization', subtitle: 'Smart workflows and performance insights' },
    { icon: ShieldCheck, title: 'SOLVANTA Security', subtitle: 'Encrypted access and complete audit trails' },
];

const trustBadges = ['PCI DSS Compliant', '256-bit Encryption'];

const loginSchema = z.object({
    email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
    password: z.string().min(1, 'Password is required'),
});

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
    const navigate = useNavigate();
    const { setTokens, setUser } = useAuthStore();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.currentTarget as HTMLFormElement;
        const formData = new FormData(form);

        const enteredEmail = (email || String(formData.get('login_identifier') || '')).trim();
        const enteredPassword = password || String(formData.get('login_secret') || '');

        const parsed = loginSchema.safeParse({ email: enteredEmail, password: enteredPassword });
        if (!parsed.success) {
            const nextErrors: { email?: string; password?: string } = {};
            parsed.error.issues.forEach((issue) => {
                const field = issue.path[0];
                if (field === 'email' || field === 'password') {
                    nextErrors[field] ??= issue.message;
                }
            });
            setErrors(nextErrors);
            toast.error('Please fix the highlighted fields');
            return;
        }

        setErrors({});
        setLoading(true);
        try {
            const { data } = await api.post('/auth/login', parsed.data);
            const accessToken = data?.data?.accessToken ?? data?.data?.token;
            const refreshToken = data?.data?.refreshToken;
            if (!accessToken || !refreshToken) {
                throw new Error('Invalid login response: missing tokens');
            }
            setTokens(accessToken, refreshToken);

            const profile = await api.get('/users/me');
            setUser(profile.data.data);

            toast.success(`Welcome back, ${profile.data.data.name}!`);
            const userData = profile.data.data;
            const isSuperAdmin = Boolean(userData.isSuperAdmin);
            const isAdminCode = userData.role?.name?.toLowerCase() === 'admin';

            if (userData.company?.setupCompleted === false && !isSuperAdmin) {
                if (isAdminCode) {
                    navigate('/setup-wizard');
                } else {
                    navigate('/');
                }
            } else {
                navigate('/');
            }
        } catch (err: any) {
            toast.error(err.response?.data?.error?.message || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-background-app lg:flex">
            <div className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6 lg:px-12 xl:px-20">
                <div className="w-full max-w-md space-y-8">
                    <div className="space-y-4">
                        <Badge className="border border-brand-100 bg-brand-50 text-brand-700">
                            Secure workspace access
                        </Badge>
                        <div>
                            <img
                                src="/logo.png"
                                alt="Solvanta Logo"
                                className="mb-6 h-12 w-12 rounded-2xl shadow-lg shadow-brand-500/15"
                            />
                            <h1 className="text-3xl font-bold tracking-tight text-text-primary">
                                Welcome back
                            </h1>
                            <p className="mt-2 text-sm text-text-secondary">
                                Sign in to continue managing your business operations.
                            </p>
                        </div>
                    </div>

                    <Card className="border-border/80 shadow-2xl shadow-brand-500/10" padding="lg">
                        <form className="space-y-5" onSubmit={handleSubmit} autoComplete="off">
                            <div className="space-y-2">
                                <label
                                    htmlFor="email"
                                    className="block text-sm font-medium text-text-secondary"
                                >
                                    Email Address
                                </label>
                                <Input
                                    id="email"
                                    name="login_identifier"
                                    type="email"
                                    required
                                    autoComplete="username"
                                    value={email}
                                    onChange={(e) => {
                                        setEmail(e.target.value);
                                        setErrors((current) => ({ ...current, email: undefined }));
                                    }}
                                    icon={<Mail size={18} />}
                                    placeholder="Enter your email"
                                    fullWidth
                                    error={!!errors.email}
                                />
                                {errors.email && <p className="text-sm text-danger">{errors.email}</p>}
                            </div>

                            <div className="space-y-2">
                                <label
                                    htmlFor="password"
                                    className="block text-sm font-medium text-text-secondary"
                                >
                                    Password
                                </label>
                                <div className="relative">
                                    <Input
                                        id="password"
                                        name="login_secret"
                                        type={showPassword ? 'text' : 'password'}
                                        required
                                        autoComplete="current-password"
                                        value={password}
                                        onChange={(e) => {
                                            setPassword(e.target.value);
                                            setErrors((current) => ({ ...current, password: undefined }));
                                        }}
                                        icon={<Lock size={18} />}
                                        placeholder="Enter your password"
                                        fullWidth
                                        className="pr-11"
                                        error={!!errors.password}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword((current) => !current)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary transition-colors hover:text-text-primary"
                                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                                        aria-pressed={showPassword}
                                    >
                                        {showPassword ? (
                                            <EyeOff className="h-5 w-5" />
                                        ) : (
                                            <Eye className="h-5 w-5" />
                                        )}
                                    </button>
                                </div>
                                {errors.password && <p className="text-sm text-danger">{errors.password}</p>}
                            </div>

                            <div className="flex items-center justify-between gap-4">
                                <label
                                    htmlFor="remember-me"
                                    className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary"
                                >
                                    <input
                                        id="remember-me"
                                        name="remember-me"
                                        type="checkbox"
                                        className="h-4 w-4 rounded border-border text-text-brand focus:ring-brand-200"
                                    />
                                    Remember for 30 days
                                </label>
                                <a
                                    href="#"
                                    className="text-sm font-medium text-text-brand transition-colors hover:text-brand-400"
                                >
                                    Forgot password?
                                </a>
                            </div>

                            <Button type="submit" loading={loading} fullWidth>
                                {loading ? 'Signing in...' : 'Sign in'}
                            </Button>
                        </form>
                    </Card>
                </div>
            </div>

            <div className="relative hidden flex-1 overflow-hidden bg-gradient-brand lg:flex">
                <div className="absolute right-0 top-0 h-96 w-96 translate-x-1/4 -translate-y-1/4 rounded-full bg-brand-200/20 blur-3xl" />
                <div className="absolute bottom-0 left-0 h-80 w-80 -translate-x-1/4 translate-y-1/4 rounded-full bg-white/10 blur-3xl" />

                <div className="relative z-10 flex w-full flex-col justify-center px-16 xl:px-24">
                    <div className="max-w-xl">
                        <h2 className="text-4xl font-bold tracking-tight text-white">
                            Solvanta Business Suite
                        </h2>
                        <p className="mt-4 text-lg text-brand-100">
                            The unified workspace for ERP, CRM, finance, and inventory teams that need
                            clean visibility and reliable control.
                        </p>

                        <div className="mt-12 space-y-5">
                            {heroFeatures.map((feature) => (
                                <Card
                                    key={feature.title}
                                    className="border-white/10 bg-white/8 shadow-none backdrop-blur-sm"
                                    padding="md"
                                >
                                    <div className="flex items-start gap-4">
                                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-white">
                                            <feature.icon className="h-6 w-6" />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-semibold text-white">
                                                {feature.title}
                                            </h3>
                                            <p className="mt-1 text-sm text-brand-100/85">
                                                {feature.subtitle}
                                            </p>
                                        </div>
                                    </div>
                                </Card>
                            ))}
                        </div>

                        <div className="mt-10 flex flex-wrap gap-3">
                            {trustBadges.map((label) => (
                                <Badge
                                    key={label}
                                    className="border border-white/10 bg-white/10 text-white"
                                >
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    {label}
                                </Badge>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
