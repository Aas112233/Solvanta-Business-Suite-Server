import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from '@/lib/toast';
import {
    Phone,
    Mail,
    Calendar,
    MessageSquare,
    Bell,
    Plus,
    Trash2,
    CheckCircle,
    Clock,
    X,
    AlertCircle
} from 'lucide-react';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { Badge } from '../ui/Badge';

interface CustomerActivityLogProps {
    customerId: string;
}

interface Interaction {
    id: string;
    type: 'CALL' | 'EMAIL' | 'MEETING' | 'NOTE' | 'FOLLOW_UP';
    subject?: string | null;
    description?: string | null;
    scheduledAt?: string | null;
    status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
    priority: 'LOW' | 'NORMAL' | 'HIGH';
    createdAt: string;
}

interface Activity {
    id: string;
    type: 'INTERACTION' | 'INVOICE';
    interactionType: string;
    subject?: string | null;
    description?: string | null;
    status?: string;
    priority?: string;
    date: string;
    createdAt: string;
}

const typeIcons: Record<string, any> = {
    CALL: Phone,
    EMAIL: Mail,
    MEETING: Calendar,
    NOTE: MessageSquare,
    FOLLOW_UP: Bell,
    INVOICE: AlertCircle,
};

const typeColors: Record<string, string> = {
    CALL: 'bg-blue-100 text-blue-700',
    EMAIL: 'bg-purple-100 text-purple-700',
    MEETING: 'bg-orange-100 text-orange-700',
    NOTE: 'bg-gray-100 text-gray-700',
    FOLLOW_UP: 'bg-yellow-100 text-yellow-700',
    INVOICE: 'bg-green-100 text-green-700',
};

const priorityColors: Record<string, string> = {
    LOW: 'bg-blue-100 text-blue-700',
    NORMAL: 'bg-gray-100 text-gray-700',
    HIGH: 'bg-red-100 text-red-700',
};

export default function CustomerActivityLog({ customerId }: CustomerActivityLogProps) {
    const [showAddModal, setShowAddModal] = useState(false);
    const [selectedType, setSelectedType] = useState<'CALL' | 'EMAIL' | 'MEETING' | 'NOTE' | 'FOLLOW_UP'>('NOTE');
    const [subject, setSubject] = useState('');
    const [description, setDescription] = useState('');
    const [scheduledDate, setScheduledDate] = useState('');
    const [priority, setPriority] = useState<'LOW' | 'NORMAL' | 'HIGH'>('NORMAL');

    const queryClient = useQueryClient();

    const { data: activityData, isLoading } = useQuery<{ activities: Activity[] }>({
        queryKey: ['customer', customerId, 'activity'],
        queryFn: () => api.get(`/customers/${customerId}/activity`).then((r) => r.data.data),
    });

    const createInteraction = useMutation({
        mutationFn: (data: any) => api.post(`/customers/${customerId}/interactions`, data),
        onSuccess: () => {
            toast.success('Interaction added');
            queryClient.invalidateQueries({ queryKey: ['customer', customerId, 'activity'] });
            setShowAddModal(false);
            setSubject('');
            setDescription('');
            setScheduledDate('');
            setPriority('NORMAL');
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to add interaction'),
    });

    const completeInteraction = useMutation({
        mutationFn: (interactionId: string) =>
            api.post(`/customers/${customerId}/interactions/${interactionId}/complete`),
        onSuccess: () => {
            toast.success('Interaction marked as completed');
            queryClient.invalidateQueries({ queryKey: ['customer', customerId, 'activity'] });
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to update interaction'),
    });

    const deleteInteraction = useMutation({
        mutationFn: (interactionId: string) =>
            api.delete(`/customers/${customerId}/interactions/${interactionId}`),
        onSuccess: () => {
            toast.success('Interaction deleted');
            queryClient.invalidateQueries({ queryKey: ['customer', customerId, 'activity'] });
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to delete interaction'),
    });

    const activities = activityData?.activities || [];

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        } else if (diffDays === 1) {
            return 'Yesterday';
        } else if (diffDays < 7) {
            return date.toLocaleDateString('en-US', { weekday: 'short' });
        } else {
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
    };

    const handleAddInteraction = () => {
        if (!subject.trim() && !description.trim()) {
            toast.error('Please enter a subject or description');
            return;
        }

        createInteraction.mutate({
            type: selectedType,
            subject: subject.trim() || null,
            description: description.trim() || null,
            scheduledAt: scheduledDate || null,
            priority,
        });
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
                    Activity Log
                </h3>
                <Button
                    variant="primary"
                    size="sm"
                    icon={<Plus size={16} />}
                    onClick={() => setShowAddModal(true)}
                >
                    Add Interaction
                </Button>
            </div>

            {/* Activity Timeline */}
            {isLoading ? (
                <div className="text-center py-8" style={{ color: 'var(--color-text-muted)' }}>
                    Loading activity...
                </div>
            ) : activities.length === 0 ? (
                <div className="text-center py-8" style={{ color: 'var(--color-text-muted)' }}>
                    <MessageSquare size={48} className="mx-auto mb-3 opacity-50" />
                    <p>No activity recorded yet</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {activities.map((activity, idx) => {
                        const Icon = typeIcons[activity.interactionType] || MessageSquare;
                        const isInteraction = activity.type === 'INTERACTION';

                        return (
                            <div
                                key={activity.id}
                                className="flex gap-3 p-3 rounded-lg border border-border hover:bg-background-subtle transition-colors"
                            >
                                {/* Icon */}
                                <div
                                    className={`p-2 rounded-lg shrink-0 ${typeColors[activity.interactionType] || 'bg-gray-100'}`}
                                >
                                    <Icon size={16} />
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <p className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
                                                    {activity.subject || 'Untitled'}
                                                </p>
                                                {isInteraction && activity.priority && activity.priority !== 'NORMAL' && (
                                                    <Badge variant="info" size="sm">
                                                        {activity.priority}
                                                    </Badge>
                                                )}
                                                {isInteraction && activity.status && (
                                                    <Badge
                                                        size="sm"
                                                        variant={
                                                            activity.status === 'COMPLETED' ? 'success' :
                                                            activity.status === 'CANCELLED' ? 'danger' : 'default'
                                                        }
                                                    >
                                                        {activity.status}
                                                    </Badge>
                                                )}
                                            </div>
                                            {activity.description && (
                                                <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                                                    {activity.description}
                                                </p>
                                            )}
                                            <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
                                                {formatDate(activity.date)}
                                            </p>
                                        </div>

                                        {/* Actions */}
                                        {isInteraction && activity.status === 'PENDING' && (
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => completeInteraction.mutate(activity.id)}
                                                    className="p-1.5 rounded-md hover:bg-green-50 transition-colors"
                                                    style={{ color: 'var(--color-success)' }}
                                                    title="Mark as completed"
                                                >
                                                    <CheckCircle size={16} />
                                                </button>
                                                <button
                                                    onClick={() => deleteInteraction.mutate(activity.id)}
                                                    className="p-1.5 rounded-md hover:bg-red-50 transition-colors"
                                                    style={{ color: 'var(--color-danger)' }}
                                                    title="Delete"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Add Interaction Modal */}
            {showAddModal && (
                <Modal
                    isOpen={showAddModal}
                    onClose={() => setShowAddModal(false)}
                    title="Add Interaction"
                    maxWidth="md"
                >
                    <div className="space-y-4">
                        {/* Type Selection */}
                        <div>
                            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-primary)' }}>
                                Type
                            </label>
                            <div className="grid grid-cols-5 gap-2">
                                {(['CALL', 'EMAIL', 'MEETING', 'NOTE', 'FOLLOW_UP'] as const).map((type) => {
                                    const Icon = typeIcons[type];
                                    return (
                                        <button
                                            key={type}
                                            onClick={() => setSelectedType(type)}
                                            className={`p-3 rounded-lg border border-border flex flex-col items-center gap-1 transition-colors ${
                                                selectedType === type
                                                    ? 'bg-blue-50 border-blue-200'
                                                    : 'hover:bg-background-subtle'
                                            }`}
                                        >
                                            <Icon size={18} className={selectedType === type ? 'text-blue-600' : ''} />
                                            <span className="text-xs">{type}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Subject */}
                        <div>
                            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-primary)' }}>
                                Subject
                            </label>
                            <input
                                type="text"
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                placeholder="Brief description"
                                className="w-full px-3 py-2 rounded-lg border border-border bg-background-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        {/* Description */}
                        <div>
                            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-primary)' }}>
                                Description
                            </label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Detailed notes..."
                                rows={3}
                                className="w-full px-3 py-2 rounded-lg border border-border bg-background-card focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                            />
                        </div>

                        {/* Scheduled Date */}
                        <div>
                            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-primary)' }}>
                                Scheduled Date (Optional)
                            </label>
                            <input
                                type="datetime-local"
                                value={scheduledDate}
                                onChange={(e) => setScheduledDate(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-border bg-background-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        {/* Priority */}
                        <div>
                            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-primary)' }}>
                                Priority
                            </label>
                            <div className="flex gap-2">
                                {(['LOW', 'NORMAL', 'HIGH'] as const).map((p) => (
                                    <button
                                        key={p}
                                        onClick={() => setPriority(p)}
                                        className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                                            priority === p
                                                ? `${priorityColors[p]} border-current`
                                                : 'border-border hover:bg-background-subtle'
                                        }`}
                                    >
                                        {p}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3 pt-4">
                            <button
                                type="button"
                                onClick={() => setShowAddModal(false)}
                                className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-border hover:bg-background-subtle"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                onClick={handleAddInteraction}
                                disabled={createInteraction.isPending}
                                className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                            >
                                {createInteraction.isPending ? 'Adding...' : 'Add Interaction'}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
