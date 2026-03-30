export interface PosCachedUnit {
    unitCode: string;
    unitName: string;
    qtyInBaseUnit: number;
    salePrice: number;
    barcode?: string | null;
    isBase: boolean;
}

export interface PosCachedPrice {
    unitCode: string;
    priceGroupId: string;
    salePrice: number;
}

export interface PosCachedProduct {
    id: string;
    itemCode: string;
    name: string;
    taxRate: number;
    taxId?: string | null;
    tax?: { rate: number; name: string; type: string } | null;
    status: 'ACTIVE' | 'INACTIVE';
    deletedAt?: string | null;
    updatedAt: string;
    units: PosCachedUnit[];
    priceGroupPrices?: PosCachedPrice[];
}

interface StoredProductRow {
    key: string;
    bucket: string;
    product: PosCachedProduct;
}

const DB_NAME = 'SOLVANTA-pos-cache';
const DB_VERSION = 1;
const PRODUCTS_STORE = 'products';
const META_STORE = 'meta';

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(PRODUCTS_STORE)) {
                const store = db.createObjectStore(PRODUCTS_STORE, { keyPath: 'key' });
                store.createIndex('bucket', 'bucket', { unique: false });
            }
            if (!db.objectStoreNames.contains(META_STORE)) {
                db.createObjectStore(META_STORE, { keyPath: 'key' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error('Failed to open POS cache database'));
    });
}

function toRow(bucket: string, product: PosCachedProduct): StoredProductRow {
    return {
        key: `${bucket}::${product.id}`,
        bucket,
        product,
    };
}

export async function getCachedProducts(bucket: string): Promise<PosCachedProduct[]> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(PRODUCTS_STORE, 'readonly');
        const store = tx.objectStore(PRODUCTS_STORE).index('bucket');
        const req = store.getAll(IDBKeyRange.only(bucket));
        req.onsuccess = () => {
            const rows = (req.result || []) as StoredProductRow[];
            resolve(rows.map((r) => r.product));
        };
        req.onerror = () => reject(req.error || new Error('Failed to read POS cached products'));
    });
}

export async function upsertCachedProducts(bucket: string, products: PosCachedProduct[]): Promise<void> {
    if (!products.length) return;
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(PRODUCTS_STORE, 'readwrite');
        const store = tx.objectStore(PRODUCTS_STORE);
        for (const product of products) {
            store.put(toRow(bucket, product));
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('Failed to write POS cached products'));
    });
}

export async function removeCachedProducts(bucket: string, productIds: string[]): Promise<void> {
    if (!productIds.length) return;
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(PRODUCTS_STORE, 'readwrite');
        const store = tx.objectStore(PRODUCTS_STORE);
        for (const id of productIds) {
            store.delete(`${bucket}::${id}`);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('Failed to remove POS cached products'));
    });
}

export async function getMetaValue(key: string): Promise<string | null> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(META_STORE, 'readonly');
        const store = tx.objectStore(META_STORE);
        const req = store.get(key);
        req.onsuccess = () => {
            const row = req.result as { key: string; value: string } | undefined;
            resolve(row?.value ?? null);
        };
        req.onerror = () => reject(req.error || new Error('Failed to read POS cache metadata'));
    });
}

export async function setMetaValue(key: string, value: string): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(META_STORE, 'readwrite');
        const store = tx.objectStore(META_STORE);
        store.put({ key, value });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('Failed to write POS cache metadata'));
    });
}

function normalizeCode(code: string): string {
    return String(code || '').trim().toUpperCase();
}

export interface PosIndexHit {
    product: PosCachedProduct;
    unitCode: string | null;
}

export function buildScanIndex(products: PosCachedProduct[]): Map<string, PosIndexHit> {
    const map = new Map<string, PosIndexHit>();
    for (const product of products) {
        const baseUnit = product.units.find((u) => u.isBase) || product.units[0] || null;
        const baseUnitCode = baseUnit?.unitCode || null;

        const put = (code: string, unitCode: string | null) => {
            const key = normalizeCode(code);
            if (!key || map.has(key)) return;
            map.set(key, { product, unitCode });
        };

        put(product.itemCode, baseUnitCode);
        for (const unit of product.units) {
            put(unit.unitCode, unit.unitCode);
            if (unit.barcode) put(unit.barcode, unit.unitCode);
            put(`${product.itemCode}-${unit.unitCode}`, unit.unitCode);
            put(`${product.itemCode}/${unit.unitCode}`, unit.unitCode);
        }
    }
    return map;
}
