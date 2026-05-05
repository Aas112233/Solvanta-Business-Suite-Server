import { basePrisma } from '../../lib/prisma.js';

const TRANSIENT_CONNECTION_PATTERNS = [
    'os error 10054',
    'forcibly closed by the remote host',
    'connection reset',
    'connection closed',
];

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientConnectionError(error: unknown) {
    if (!error || typeof error !== 'object') return false;
    const message = 'message' in error ? String((error as { message?: unknown }).message || '').toLowerCase() : '';
    return TRANSIENT_CONNECTION_PATTERNS.some((pattern) => message.includes(pattern));
}

async function withTransientRetry<T>(operation: () => Promise<T>, attempts = 2) {
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            if (attempt >= attempts || !isTransientConnectionError(error)) {
                throw error;
            }
            await sleep(200 * attempt);
        }
    }

    throw lastError;
}

export async function loadUserAssignedBranches(userId: string, companyId: string) {
    const userBranchLinks = await withTransientRetry(() =>
        basePrisma.userBranch.findMany({
            where: { userId },
            select: { branchId: true },
        }),
    );

    const branchIds = Array.from(new Set(userBranchLinks.map((row) => row.branchId).filter(Boolean)));
    if (branchIds.length === 0) return [];

    return withTransientRetry(() =>
        basePrisma.branch.findMany({
            where: {
                companyId,
                id: { in: branchIds },
            },
            select: { id: true, name: true, code: true },
            orderBy: { name: 'asc' },
        }),
    );
}
