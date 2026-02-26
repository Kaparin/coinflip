import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { userNotifications } from '@coinflip/db/schema';
import { authMiddleware } from '../middleware/auth.js';
import { getDb } from '../lib/db.js';
import type { AppEnv } from '../types.js';

export const notificationsRouter = new Hono<AppEnv>();

// GET /api/v1/notifications/pending — unread notifications (limit 10)
notificationsRouter.get('/pending', authMiddleware, async (c) => {
  const user = c.get('user');
  const db = getDb();

  const notifications = await db
    .select()
    .from(userNotifications)
    .where(
      and(
        eq(userNotifications.userId, user.id),
        eq(userNotifications.read, false),
      ),
    )
    .orderBy(desc(userNotifications.createdAt))
    .limit(10);

  return c.json({
    data: notifications.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      metadata: n.metadata,
      createdAt: n.createdAt.toISOString(),
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
