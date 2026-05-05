import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { Mail, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { z } from 'zod';
import { Button, Card, Input } from '../components/ui';

const forgotPasswordSchema = z.object({
    email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
});

export default function ForgotPassword() {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [resetToken, setResetToken] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        const parsed = forgotPasswordSchema.safeParse({ email });
        if (!parsed.success) {
            setError(parsed.error.issues[0]?.message || 'Invalid email');
            return;
        }

        setError('');
        setLoading(true);
        try {
            const { data } = await api.post('/auth/forgot-password', { email });
            setSuccess(true);
            // For development only - remove in production
            if (data.data?.resetToken) {
                setResetToken(data.data.resetToken);
            }
            toast.success('Password reset instructions sent');
        } catch (err: any) {
            toast.error(err.response?.data?.error?.message || 'Failed to process request');
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="min-h-screen bg-background-app flex items-center justify-center px-4">
                <div className="w-full max-w-md">
                    <Card padding="lg">
                        <div className="space-y-6">
                            <div className="text-center">
                                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 mb-4">
                                    <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                                <h2 className="text-2xl font-bold text-text-primary">Check your email</h2>
                                <p className="mt-2 text-sm text-text-secondary">
                                    If an account exists with {email}, you will receive password reset instructions.
                                </p>
                            </div>

                            {/* Development only - remove in production */}
                            {resetToken && (
                                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                                    <p className="text-xs font-medium text-yellow-800 mb-2">Development Only - Reset Token:</p>
                                    <code className="block p-2 bg-white rounded text-xs break-all">{resetToken}</code>
                                    <Link 
                                        to={`/reset-password?token=${resetToken}`}
                                        className="mt-3 block text-center text-sm text-brand-600 hover:text-brand-700 font-medium"
                                    >
                                        Go to Reset Password →
                                    </Link>
                                </div>
                            )}

                            <Link to="/login">
                                <Button fullWidth variant="secondary">
                                    <ArrowLeft size={18} className="mr-2" />
                                    Back to Login
                                </Button>
                            </Link>
                        </div>
                    </Card>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background-app flex items-center justify-center px-4">
            <div className="w-full max-w-md space-y-8">
                <div className="text-center">
                    <img
                        src="/logo.png"
                        alt="Solvanta Logo"
                        className="mx-auto mb-6 h-12 w-12 rounded-2xl shadow-lg shadow-brand-500/15"
                    />
                    <h1 className="text-3xl font-bold text-text-primary">Forgot password?</h1>
                    <p className="mt-2 text-sm text-text-secondary">
                        Enter your email and we'll send you reset instructions.
                    </p>
                </div>

                <Card padding="lg">
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-text-secondary mb-2">
                                Email Address
                            </label>
                            <Input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => {
                                    setEmail(e.target.value);
                                    setError('');
                                }}
                                icon={<Mail size={18} />}
                                placeholder="Enter your email"
                                fullWidth
                                error={!!error}
                            />
                            {error && <p className="text-sm text-danger mt-1">{error}</p>}
                        </div>

                        <Button type="submit" loading={loading} fullWidth>
                            Send Reset Instructions
                        </Button>

                        <Link to="/login" className="block">
                            <Button variant="secondary" fullWidth>
                                <ArrowLeft size={18} className="mr-2" />
                                Back to Login
                            </Button>
                        </Link>
                    </form>
                </Card>
            </div>
        </div>
    );
}
