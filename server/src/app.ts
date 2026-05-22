import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import type { RequestHandler, Router } from 'express';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { logger } from './lib/logger.js';
import { basePrisma } from './lib/prisma.js';

export const app = express();
app.disable('etag');

function lazyRouter(importer: () => Promise<Router>): RequestHandler {
    let routerPromise: Promise<Router> | null = null;

    return async (req, res, next) => {
        try {
            if (!routerPromise) {
                routerPromise = importer();
            }
            const router = await routerPromise;
            router(req, res, next);
        } catch (error) {
            routerPromise = null;
            next(error);
        }
    };
}

function parseCorsOrigins(raw: string) {
    return raw
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
}

function isPrivateNetworkHost(hostname: string) {
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;

    const match172 = /^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(hostname);
    if (match172) {
        const second = Number(match172[1]);
        if (second >= 16 && second <= 31) return true;
    }

    return false;
}

function isLocalNetworkOrigin(origin: string) {
    try {
        const url = new URL(origin);
        return isPrivateNetworkHost(url.hostname);
    } catch {
        return false;
    }
}

const allowedOrigins = parseCorsOrigins(env.CORS_ORIGIN);

// ── Security ────────────────────────────────────────────────
app.use(helmet());

// Render and similar PaaS route traffic through a reverse proxy.
// Trust the first proxy hop in production so rate limiting can use real client IPs.
if (env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) {
            callback(null, true);
            return;
        }

        if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
            callback(null, true);
            return;
        }

        if (env.NODE_ENV === 'development' && isLocalNetworkOrigin(origin)) {
            callback(null, true);
            return;
        }

        callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
}));

// ── Rate limiting for auth ──────────────────────────────────
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many requests, try again later' } },
});

// ── Body parsing ────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(compression() as any);

// ── Logging ─────────────────────────────────────────────────
const morganStream = { write: (msg: string) => logger.http(msg.trim()) };
app.use(morgan('short', { stream: morganStream }));

// ── Health check ────────────────────────────────────────────
app.get('/', (_req, res) => {
    res.json({
        success: true,
        service: 'SOLVANTA Business Suite API',
        version: 'v1',
        health: '/health',
        api: '/api/v1',
    });
});

// Lightweight health check - no database query for fast response
app.get('/health', (_req, res) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        region: process.env.VERCEL_REGION || 'unknown',
    });
});

// Detailed health check with database status (optional, use /health/detailed)
app.get('/health/detailed', async (_req, res) => {
    const startTime = Date.now();
    const healthStatus: {
        status: 'ok' | 'degraded' | 'unhealthy';
        timestamp: string;
        uptime: number;
        database: {
            status: 'connected' | 'disconnected';
            responseTime?: number;
        };
    } = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: {
            status: 'disconnected',
        },
    };

    // Check database connection
    try {
        await basePrisma.$runCommandRaw({ ping: 1 });
        healthStatus.database.status = 'connected';
        healthStatus.database.responseTime = Date.now() - startTime;
    } catch (error: any) {
        healthStatus.database.status = 'disconnected';
        healthStatus.status = 'degraded';
    }

    const httpStatus = healthStatus.status === 'unhealthy' ? 503 : 200;
    res.status(httpStatus).json(healthStatus);
});

// ── API v1 Routes ───────────────────────────────────────────
const v1 = express.Router();
v1.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
});
v1.use('/auth', authLimiter, lazyRouter(() => import('./modules/auth/auth.routes.js').then((m) => m.authRoutes)));
v1.use('/companies', lazyRouter(() => import('./modules/company/company.routes.js').then((m) => m.companyRoutes)));
v1.use('/branches', lazyRouter(() => import('./modules/branch/branch.routes.js').then((m) => m.branchRoutes)));
v1.use('/users', lazyRouter(() => import('./modules/user/user.routes.js').then((m) => m.userRoutes)));
v1.use('/roles', lazyRouter(() => import('./modules/role/role.routes.js').then((m) => m.roleRoutes)));
v1.use('/customers', lazyRouter(() => import('./modules/customer/customer.routes.js').then((m) => m.customerRoutes)));
v1.use('/suppliers', lazyRouter(() => import('./modules/supplier/supplier.routes.js').then((m) => m.supplierRoutes)));
v1.use('/products', lazyRouter(() => import('./modules/product/product.routes.js').then((m) => m.productRoutes)));
v1.use('/inventory', lazyRouter(() => import('./modules/inventory/inventory.routes.js').then((m) => m.inventoryRoutes)));
v1.use('/purchases', lazyRouter(() => import('./modules/purchase/purchase.routes.js').then((m) => m.purchaseRoutes)));
v1.use('/pos', lazyRouter(() => import('./modules/pos/pos.routes.js').then((m) => m.posRoutes)));

v1.use('/reports', lazyRouter(() => import('./modules/reports/report.routes.js').then((m) => m.reportRoutes)));
v1.use('/global-strings', lazyRouter(() => import('./modules/company/global-string.routes.js').then((m) => m.globalStringRoutes)));
v1.use('/sales/cash', lazyRouter(() => import('./modules/sales/cash.routes.js').then((m) => m.salesCashRoutes)));
v1.use('/sales', lazyRouter(() => import('./modules/sales/sales.routes.js').then((m) => m.salesRoutes)));
v1.use('/pos-terminals', lazyRouter(() => import('./modules/pos-terminal/pos-terminal.routes.js').then((m) => m.posTerminalRoutes)));
v1.use('/super-admin', lazyRouter(() => import('./modules/super-admin/super-admin.routes.js').then((m) => m.superAdminRoutes)));
v1.use('/accounting', lazyRouter(() => import('./modules/accounting/accounting.routes.js').then((m) => m.accountingRoutes)));
v1.use('/fixed-assets', lazyRouter(() => import('./modules/fixed-assets/fixed-assets.routes.js').then((m) => m.fixedAssetRoutes)));
v1.use('/taxes', lazyRouter(() => import('./modules/tax/tax.routes.js').then((m) => m.taxRoutes)));
v1.use('/unit-management', lazyRouter(() => import('./modules/unit-management/unit-management.routes.js').then((m) => m.unitManagementRoutes)));
v1.use('/hr', lazyRouter(() => import('./modules/hr/hr.routes.js').then((m) => m.hrRoutes)));
v1.use('/services', lazyRouter(() => import('./modules/service/service.routes.js').then((m) => m.serviceRoutes)));
v1.use('/service-invoices', lazyRouter(() => import('./modules/service-invoice/service-invoice.routes.js').then((m) => m.serviceInvoiceRoutes)));
v1.use('/bank', lazyRouter(() => import('./modules/bank/bank.routes.js').then((m) => m.bankRoutes)));
v1.use('/aging', lazyRouter(() => import('./modules/aging/aging.routes.js').then((m) => m.agingRoutes)));
v1.use('/bom', lazyRouter(() => import('./modules/bom/bom.routes.js').then((m) => m.bomRoutes)));
v1.use('/production', lazyRouter(() => import('./modules/production/production.routes.js').then((m) => m.productionRoutes)));

app.use('/api/v1', v1);

// ── 404 ─────────────────────────────────────────────────────
app.use((_req, res) => {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
});

// ── Global error handler ────────────────────────────────────
app.use(errorHandler);

export default app;
