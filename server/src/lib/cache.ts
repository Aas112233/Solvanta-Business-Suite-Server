import { LRUCache } from 'lru-cache';
import { logger } from './logger.js';

// ── TTL-based cache for reference/semi-static data ──
// Items are evicted when TTL expires or when the max size is reached.

export interface CacheOptions {
  max?: number;       // Max number of entries (default: 500)
  ttlMs?: number;     // TTL in milliseconds (default: 5 minutes)
}

const DEFAULT_MAX = 500;
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ── Per-collection caches ──
// Each cache is scoped to a specific data type so we can invalidate granularly.

const caches = new Map<string, LRUCache<string, any>>();

function getCache(key: string, opts?: CacheOptions): LRUCache<string, any> {
  const existing = caches.get(key);
  if (existing) return existing;

  const cache = new LRUCache<string, any>({
    max: opts?.max ?? DEFAULT_MAX,
    ttl: opts?.ttlMs ?? DEFAULT_TTL_MS,
    allowStale: false,
    updateAgeOnGet: true,   // Reset TTL on access (extends life of hot items)
    updateAgeOnHas: false,
  });

  caches.set(key, cache);
  return cache;
}

/**
 * Get or set a cached value. If the key exists and is not stale, returns the cached value.
 * Otherwise, calls the factory function, caches the result, and returns it.
 */
export async function cached<T>(
  cacheName: string,
  key: string,
  factory: () => Promise<T>,
  opts?: CacheOptions,
): Promise<T> {
  const cache = getCache(cacheName, opts);
  const cached = cache.get(key);
  if (cached !== undefined) return cached as T;

  const value = await factory();
  cache.set(key, value);
  return value;
}

/**
 * Synchronous version for values that don't need async factory.
 */
export function cachedSync<T>(
  cacheName: string,
  key: string,
  factory: () => T,
  opts?: CacheOptions,
): T {
  const cache = getCache(cacheName, opts);
  const cached = cache.get(key);
  if (cached !== undefined) return cached as T;

  const value = factory();
  cache.set(key, value);
  return value;
}

/**
 * Invalidate a specific cache entry.
 */
export function invalidateCache(cacheName: string, key?: string): void {
  const cache = caches.get(cacheName);
  if (!cache) return;

  if (key) {
    cache.delete(key);
  } else {
    cache.clear();
  }
  logger.debug(`Cache invalidated: ${cacheName}${key ? ` key=${key}` : ' (all)'}`);
}

/**
 * Invalidate all caches (useful for major data changes).
 */
export function invalidateAllCaches(): void {
  for (const [name, cache] of caches) {
    cache.clear();
  }
  logger.debug('All caches invalidated');
}

/**
 * Get cache stats for monitoring.
 */
export function getCacheStats(): Record<string, { size: number; max: number }> {
  const stats: Record<string, { size: number; max: number }> = {};
  for (const [name, cache] of caches) {
    stats[name] = { size: cache.size, max: cache.max };
  }
  return stats;
}

// ── Predefined cache names ──
export const CacheNames = {
  TAXES: 'taxes',
  CATEGORIES: 'categories',
  BRANDS: 'brands',
  ITEM_GROUPS: 'itemGroups',
  UNIT_MASTERS: 'unitMasters',
  BRANCHES: 'branches',
  PRICE_GROUPS: 'priceGroups',
  GLOBAL_STRINGS: 'globalStrings',
  PAYMENT_METHODS: 'paymentMethods',
  ACCOUNTS: 'accounts',
  PRODUCT_META: 'productMeta',
  CUSTOMERS_DROPDOWN: 'customersDropdown',
  SUPPLIERS_DROPDOWN: 'suppliersDropdown',
  COMPANY_SETTINGS: 'companySettings',
  PERMISSIONS: 'permissions',
} as const;
