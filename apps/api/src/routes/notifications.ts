import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
import { userNotifications } from '@coinflip/db/schema';
import { authMiddleware } from '../middleware/auth.js';
import { getDb } from '../lib/db.js';
import type { AppEnv } from '../types.js';

export const notificationsRouter = new Hono<AppEnv>();

// GET /api/v1/notifications/pending — unread notifications (limit 10)
// Excludes notifications for deleted announcements
notificationsRouter.get('/pending', authMiddleware, async (c) => {
  const user = c.get('user');
  const db = getDb();

  const rows = await db.execute(sql`
    SELECT n.id, n.type, n.title, n.message, n.metadata, n.created_at
    FROM user_notifications n
    LEFT JOIN announcements a
      ON n.type = 'announcement'
      AND a.id = (n.metadata->>'announcementId')::uuid
    WHERE n.user_id = ${user.id}
      AND n.read = false
      AND (n.type != 'announcement' OR a.status IS NULL OR a.status != 'deleted')
    ORDER BY n.created_at DESC
    LIMIT 10
  `) as unknown as Array<{
    id: string;
    type: string;
    title: string;
    message: string;
    metadata: Record<string, unknown> | null;
    created_at: Date | string;
  }>;

  return c.json({
    data: rows.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      metadata: n.metadata,
      createdAt: n.created_at instanceof Date ? n.created_at.toISOString() : String(n.created_at),
    })),
  });
});

// POST /api/v1/notifications/:id/read — mark single notification as read
notificationsRouter.post('/:id/read', authMiddleware, async (c) => {
  const user = c.get('user');
  const notificationId = c.req.param('id');
  const db = getDb();

  await db
    .update(userNotifications)
    .set({ read: true })
    .where(
      and(
        eq(userNotifications.id, notificationId),
        eq(userNotifications.userId, user.id),
      ),
    );

  return c.json({ data: { success: true } });
});

// POST /api/v1/notifications/read-all — mark all as read
notificationsRouter.post('/read-all', authMiddleware, async (c) => {
  const user = c.get('user');
  const db = getDb();

  await db
    .update(userNotifications)
    .set({ read: true })
    .where(
      and(
        eq(userNotifications.userId, user.id),
        eq(userNotifications.read, false),
      ),
    );

  return c.json({ data: { success: true } });
});
