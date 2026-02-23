type CounterClient = {
    documentCounter: {
        findUnique: (args: any) => Promise<{ lastNumber: number } | null>;
        upsert: (args: any) => Promise<{ lastNumber: number }>;
    };
};

export async function peekNextCounter(
    db: CounterClient,
    companyId: string,
    scope: string,
    scopeKey = 'global'
): Promise<number> {
    const current = await db.documentCounter.findUnique({
        where: {
            companyId_scope_scopeKey: { companyId, scope, scopeKey },
        },
        select: { lastNumber: true },
    });
    return (current?.lastNumber || 0) + 1;
}

export async function nextCounter(
    db: CounterClient,
    companyId: string,
    scope: string,
    scopeKey = 'global'
): Promise<number> {
    const updated = await db.documentCounter.upsert({
        where: {
            companyId_scope_scopeKey: { companyId, scope, scopeKey },
        },
        create: {
            companyId,
            scope,
            scopeKey,
            lastNumber: 1,
        },
        update: {
            lastNumber: { increment: 1 },
        },
        select: { lastNumber: true },
    });

    return updated.lastNumber;
}

export function formatDocNo(prefix: string, value: number, pad = 6): string {
    return `${prefix}-${String(value).padStart(pad, '0')}`;
}
