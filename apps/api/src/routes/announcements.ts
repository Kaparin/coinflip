import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { announcementService } from '../services/announcement.service.js';
import type { AppEnv } from '../types.js';

export const announcementsRouter = new Hono<AppEnv>();

// GET /api/v1/announcements/sponsored/config — public config
announcementsRouter.get('/sponsored/config', async (c) => {
  const config = await announcementService.getConfig();
  return c.json({ data: config });
});

const SubmitSponsoredSchema = z.object({
  title: z.string().min(1).max(500),
  message: z.string().min(1).max(2000),
  scheduledAt: z.string().nullable().optional(),
});

// POST /api/v1/announcements/sponsored — submit sponsored announcement
announcementsRouter.post(
  '/sponsored',
  authMiddleware,
  zValidator('json', SubmitSponsoredSchema),
  async (c) => {
    const user = c.get('user');
    const { title, message, scheduledAt } = c.req.valid('json');

    const result = await announcementService.submitSponsored(
      user.id,
      title,
      message,
      scheduledAt ?? null,
    );

    return c.json({ data: result }, 201);
  },
);
