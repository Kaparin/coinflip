/**
 * Maintenance Mode Middleware — returns 503 when platform is under maintenance.
 *
 * Bypasses: admin routes, health check, docs, public config.
 */

import type { Context, Next } from 'hono';
import { configService } from '../services/config.service.js';

const BYPASS_PREFIXES = [
  '/api/v1/admin',
  '/health',
  '/docs',
  '/openapi.json',
  '/api/v1/config/public',
  '/ws',
];

export async function maintenanceMiddleware(c: Context, next: Next) {
  const path = c.req.path;

  // Bypass certain routes
  for (const prefix of BYPASS_PREFIXES) {
    if (path.startsWith(prefix)) {
      return next();
    }
  }

  const isMaintenance = await configService.isMaintenanceMode();
  if (isMaintenance) {
    const message = await configService.getMaintenanceMessage();
    return c.json(
      {
        error: {
          code: 'MAINTENANCE',
          message: message || 'Platform is under maintenance. Please try again later.',
        },
      },
      503,
    );
  }

  return next();
}
