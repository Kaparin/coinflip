import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { newsService } from '../services/news.service.js';
import type { AppEnv } from '../types.js';

export const newsRouter = new Hono<AppEnv>();

const NewsFeedQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  types: z.string().optional(),
});

// GET /api/v1/news — public news feed (no auth)
newsRouter.get('/', zValidator('query', NewsFeedQuerySchema), async (c) => {
  const { cursor, limit, types } = c.req.valid('query');
  const typeFilter = types
    ? types.split(',').map((t) => t.trim()).filter(Boolean)
    : undefined;

  const result = await newsService.getFeed({ cursor, limit, types: typeFilter });
  return c.json({ data: result.items, nextCursor: result.nextCursor });
});
