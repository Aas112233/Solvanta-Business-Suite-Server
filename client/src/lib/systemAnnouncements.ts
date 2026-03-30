import api from './api';

export type AnnouncementLevel = 'info' | 'warning' | 'critical';

export interface SystemAnnouncement {
    id: string;
    title: string;
    message: string;
    level: AnnouncementLevel;
    createdAt: string;
}

interface GlobalStringAnnouncementRaw {
    id?: string;
    value?: string;
    description?: string;
    metadata?: unknown;
    createdAt?: string;
    isActive?: boolean;
}

function parseAnnouncementLevel(raw: unknown): AnnouncementLevel {
    if (raw === 'critical') return 'critical';
    if (raw === 'warning') return 'warning';
    return 'info';
}

function parseExpiresAt(raw: GlobalStringAnnouncementRaw): string {
    const metadata = raw.metadata && typeof raw.metadata === 'object' ? (raw.metadata as Record<string, unknown>) : {};
    const value = typeof metadata.expiresAt === 'string' ? metadata.expiresAt : '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString();
}

function isExpired(expiresAtIso: string): boolean {
    if (!expiresAtIso) return false;
    const parsed = new Date(expiresAtIso);
    if (Number.isNaN(parsed.getTime())) return false;
    return parsed.getTime() <= Date.now();
}

function asNonEmptyString(value: unknown, fallback: string): string {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    return trimmed || fallback;
}

function parseCreatedAt(raw: GlobalStringAnnouncementRaw): string {
    const metadata = raw.metadata && typeof raw.metadata === 'object' ? (raw.metadata as Record<string, unknown>) : {};
    const metadataCreatedAt = metadata.createdAt;

    const candidate = typeof metadataCreatedAt === 'string' ? metadataCreatedAt : raw.createdAt;
    const parsed = new Date(candidate || '');
    if (Number.isNaN(parsed.getTime())) return new Date(0).toISOString();
    return parsed.toISOString();
}

function normalizeRow(raw: GlobalStringAnnouncementRaw): SystemAnnouncement | null {
    if (!raw?.id) return null;
    if (raw.isActive === false) return null;
    const expiresAt = parseExpiresAt(raw);
    if (isExpired(expiresAt)) return null;

    const metadata = raw.metadata && typeof raw.metadata === 'object' ? (raw.metadata as Record<string, unknown>) : {};
    const level = parseAnnouncementLevel(metadata.level);

    return {
        id: raw.id,
        title: asNonEmptyString(raw.value, 'System Announcement'),
        message: asNonEmptyString(raw.description, 'Please review this system message.'),
        level,
        createdAt: parseCreatedAt(raw),
    };
}

export const SYSTEM_ANNOUNCEMENT_QUERY_KEY = ['system-announcement', 'latest'] as const;

export async function fetchLatestSystemAnnouncement(): Promise<SystemAnnouncement | null> {
    const res = await api.get('/global-strings?group=SYSTEM_ANNOUNCEMENT');
    const rows = Array.isArray(res?.data?.data) ? (res.data.data as GlobalStringAnnouncementRaw[]) : [];

    const normalized = rows
        .map(normalizeRow)
        .filter((row): row is SystemAnnouncement => Boolean(row))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return normalized[0] || null;
}
