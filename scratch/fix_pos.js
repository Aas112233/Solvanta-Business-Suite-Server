const fs = require('fs');
const path = 'd:/my project/solvanta buisness suite/client/src/pages/POS.tsx';
let content = fs.readFileSync(path, 'utf8');

// Use regex to find the problematic area more flexibly
const startMarkerRegex = /barcodeRef\.current\?\.focus\(\);\s+\}, \[\]\);/;
const endMarker = 'const { data: globalPaymentMethods }';

const startMatch = content.match(startMarkerRegex);
const endIndex = content.indexOf(endMarker);

if (!startMatch || endIndex === -1) {
    console.error('Markers not found');
    console.log('Start match:', !!startMatch);
    console.log('End index:', endIndex);
    process.exit(1);
}

const head = content.substring(0, startMatch.index + startMatch[0].length);
const tail = content.substring(endIndex);

const middle = `
    useEffect(() => {
        if (scanWarning) {
            warningCloseBtnRef.current?.focus();
        }
    }, [scanWarning]);

    const syncPosProducts = async () => {
        const bucket = POS_CACHE_SCHEMA_VERSION;
        activeBucketRef.current = bucket;
        scanCacheRef.current.clear();

        try {
            const cached = await getCachedProducts(bucket);
            if (activeBucketRef.current === bucket) {
                localScanIndexRef.current = buildScanIndex(cached);
            }

            const syncMetaKey = \`pos:lastSyncAt:\${bucket}\`;
            const since = await getMetaValue(syncMetaKey);
            let page = 1;
            let hasMore = true;
            let serverTime = '';

            while (hasMore) {
                const res = await api.get('/products/pos-sync', {
                    params: {
                        since: since || undefined,
                        page,
                        limit: 500,
                    },
                });
                const payload = res.data.data || {};
                const items = (payload.items || []) as PosCachedProduct[];
                hasMore = Boolean(payload.hasMore);
                serverTime = payload.serverTime || serverTime;
                page += 1;

                if (!items.length) continue;

                const toUpsert: PosCachedProduct[] = [];
                const toRemove: string[] = [];
                for (const item of items) {
                    if (item.deletedAt || item.status !== 'ACTIVE') {
                        toRemove.push(item.id);
                    } else {
                        toUpsert.push(item);
                    }
                }

                await upsertCachedProducts(bucket, toUpsert);
                await removeCachedProducts(bucket, toRemove);
            }

            if (serverTime) {
                await setMetaValue(syncMetaKey, serverTime);
            }

            const latest = await getCachedProducts(bucket);
            if (activeBucketRef.current === bucket) {
                localScanIndexRef.current = buildScanIndex(latest);
            }
        } catch (err) {
            console.error('POS sync failed:', err);
        }
    };

    useEffect(() => {
        void syncPosProducts();
    }, []);

    const handlePosRefresh = async () => {
        await Promise.all([
            syncPosProducts(),
            refetchPosSession(),
            refetchTerminals(),
            refetchShift(),
            refetchBranches()
        ]);
    };

    const { data: products } = useQuery({
        queryKey: ['pos-products', activeBranchId, search],
        queryFn: () => api.get('/products', {
            params: {
                search,
                limit: 20,
                includePricing: true,
            }
        }).then((r) => r.data.data),
        enabled: search.length > 1,
    });
`;

let finalContent = head + middle + tail;

// Also update the ModuleRefreshButton
finalContent = finalContent.replace(
    /<ModuleRefreshButton queryKeys={.*?}\s+\/>/,
    '<ModuleRefreshButton onRefresh={handlePosRefresh} queryKeys={[[\"pos-products\"], [\"pos-customers\"], [\"pos-loyalty-customers\"], [\"branches\"], [\"pos-terminals\"], [\"pos-session-me\"]]} />'
);

fs.writeFileSync(path, finalContent, 'utf8');
console.log('Successfully fixed and refactored POS.tsx');
