interface ModulePlaceholderProps {
    title: string;
    description?: string;
}

export default function ModulePlaceholder({ title, description }: ModulePlaceholderProps) {
    return (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10">
            <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
            <p className="mt-2 text-sm text-gray-500">
                {description || 'This module is ready in routing and permission. Implementation will be added next.'}
            </p>
        </div>
    );
}

