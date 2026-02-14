import Redis from 'ioredis';
import { env } from '../config/env.js';
import { logger } from './logger.js';

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null, // Required for BullMQ
      lazyConnect: true,
    });
    redis.on('connect', () => logger.info('Redis connected'));
    redis.on('error', (err) => logger.error({ err }, 'Redis error'));
  }
  return redis;
}
