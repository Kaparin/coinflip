import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

// ─── Login Widget verification ───────────────────────────

export interface TelegramLoginData {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

const MAX_LOGIN_AGE_SECONDS = 300; // 5 minutes

/**
 * Verify Telegram Login Widget data.
 * @see https://core.telegram.org/widgets/login#checking-authorization
 */
export function verifyTelegramLogin(
  data: TelegramLoginData,
  botToken: string,
): { valid: true } | { valid: false; reason: string } {
  const { hash, ...rest } = data;

  const now = Math.floor(Date.now() / 1000);
  if (now - data.auth_date > MAX_LOGIN_AGE_SECONDS) {
    return { valid: false, reason: 'Auth data expired' };
  }

  const dataCheckString = Object.entries(rest)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = createHash('sha256').update(botToken).digest();
  const computedHash = createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  if (computedHash !== hash) {
    return { valid: false, reason: 'Invalid hash' };
  }

  return { valid: true };
}

// ─── Mini App initData verification ──────────────────────

export interface TelegramMiniAppUser {
  id: number;
  is_bot?: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

export interface ValidatedInitData {
  user: TelegramMiniAppUser;
  auth_date: number;
  query_id?: string;
  start_param?: string;
  hash: string;
}

const MAX_INIT_DATA_AGE_SECONDS = 3600; // 1 hour

/**
 * Validate Telegram Mini App initData.
 * Uses HMAC-SHA256 with "WebAppData" salt (different from Login Widget).
 * @see https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateTelegramInitData(
  initDataRaw: string,
  botToken: string,
): ValidatedInitData {
  if (!initDataRaw) throw new Error('initData is empty');

  const params = new URLSearchParams(initDataRaw);
  const hash = params.get('hash');
  if (!hash) throw new Error('Missing hash in initData');

  // Remove hash and signature from data-check-string
  params.delete('hash');
  params.delete('signature');

  // Sort alphabetically, join with \n
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  // Mini App uses different HMAC scheme:
  // secret_key = HMAC-SHA256(key="WebAppData", data=bot_token)
  const secretKey = createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const computedHash = createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  // Timing-safe comparison
  const hashBuf = Buffer.from(hash, 'hex');
  const computedBuf = Buffer.from(computedHash, 'hex');
  if (hashBuf.length !== computedBuf.length || !timingSafeEqual(hashBuf, computedBuf)) {
    throw new Error('Invalid initData signature');
  }

  // Check freshness
  const authDate = Number(params.get('auth_date'));
  if (!authDate || Number.isNaN(authDate)) throw new Error('Missing auth_date');
  const now = Math.floor(Date.now() / 1000);
  if (now - authDate > MAX_INIT_DATA_AGE_SECONDS) {
    throw new Error('initData expired');
  }

  // Parse user
  const userRaw = params.get('user');
  if (!userRaw) throw new Error('Missing user in initData');

  let user: TelegramMiniAppUser;
  try {
    user = JSON.parse(userRaw);
  } catch {
    throw new Error('Invalid user JSON in initData');
  }

  return {
    user,
    auth_date: authDate,
    query_id: params.get('query_id') ?? undefined,
    start_param: params.get('start_param') ?? undefined,
    hash,
  };
}
