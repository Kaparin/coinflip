import { createHmac, createHash } from 'node:crypto';

export interface TelegramLoginData {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

const MAX_AUTH_AGE_SECONDS = 300; // 5 minutes

/**
 * Verify Telegram Login Widget data.
 * @see https://core.telegram.org/widgets/login#checking-authorization
 */
export function verifyTelegramLogin(
  data: TelegramLoginData,
  botToken: string,
): { valid: true } | { valid: false; reason: string } {
  const { hash, ...rest } = data;

  // Check auth_date freshness
  const now = Math.floor(Date.now() / 1000);
  if (now - data.auth_date > MAX_AUTH_AGE_SECONDS) {
    return { valid: false, reason: 'Auth data expired' };
  }

  // Build data-check string: sort keys, join with \n
  const dataCheckString = Object.entries(rest)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  // secret_key = SHA256(bot_token)
  const secretKey = createHash('sha256').update(botToken).digest();

  // HMAC-SHA-256(data_check_string, secret_key)
  const computedHash = createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  if (computedHash !== hash) {
    return { valid: false, reason: 'Invalid hash' };
  }

  return { valid: true };
}
