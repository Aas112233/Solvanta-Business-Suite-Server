import type { RequestHandler } from 'express';

/**
 * Sets Cache-Control headers for semi-static/reference data that changes infrequently.
 * Use for endpoints like: taxes, categories, brands, branches, global strings, etc.
 *
 * @param maxAgeSeconds - How long the response can be cached (default: 300 = 5 minutes)
 */
export function cacheControl(maxAgeSeconds: number = 300): RequestHandler {
  return (_req, res, next) => {
    if (res.headersSent) return next();

    // Only cache successful GET responses
    const originalSend = res.json.bind(res);
    res.json = function (body: any) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        res.setHeader(
          'Cache-Control',
          `public, max-age=${maxAgeSeconds}, s-maxage=${maxAgeSeconds}, stale-while-revalidate=${maxAgeSeconds * 2}`
        );
      } else {
        // Don't cache errors
        res.setHeader('Cache-Control', 'no-store');
      }
      return originalSend(body);
    };

    next();
  };
}

/**
 * Sets Cache-Control: no-store for dynamic/mutable data.
 * This is the default for /api/v1 already, but can be used explicitly.
 */
export const noCache: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
};

/**
 * Sets Cache-Control for immutable assets (hashed JS/CSS bundles).
 * Use for static files served by the API server.
 */
export const immutableCache: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  next();
};
