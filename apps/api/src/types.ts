import type { Hono } from 'hono';

/** User object stored in Hono context by auth middleware */
export interface AppUser {
  id: string;
  address: string;
  profileNickname: string | null;
  avatarUrl: string | null;
  telegramId: number | null;
  telegramUsername: string | null;
  telegramFirstName: string | null;
  telegramPhotoUrl: string | null;
}

/** Custom Hono variables set by middleware */
export type AppVariables = {
  user: AppUser;
  address: string;
};

/** Hono env type for all routes */
export type AppEnv = {
  Variables: AppVariables;
};
