// Next.js inlines NEXT_PUBLIC_* at build time — works on both client and server
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/** Default timeout for API requests (15 seconds) */
const REQUEST_TIMEOUT_MS = 15_000;

/** Max retry attempts for transient failures */
const MAX_RETRIES = 2;

/** Base delay for exponential backoff (ms) */
const RETRY_BASE_DELAY_MS = 1_000;

/** HTTP status codes that are safe to retry */
const RETRYABLE_STATUS_CODES = new Set([408, 429, 502, 503, 504]);

/** Sleep helper */
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/**
 * Custom fetch adapter for Orval-generated API client.
 * Orval calls: customFetch<T>({ url, method, params, data, headers, signal }, extraOptions?)
 *
 * Features:
 *  - Request timeout (15s default)
 *  - Automatic retry with exponential backoff for transient failures (network errors, 5xx)
 *  - Only retries idempotent GET requests or explicit retryable status codes
 */
export const customFetch = async <T>(
  config: {
    url: string;
    method: string;
    params?: Record<string, unknown>;
    data?: unknown;
    headers?: Record<string, string>;
    signal?: AbortSignal;
  },
  _extraOptions?: RequestInit,
): Promise<T> => {
  let fullUrl = config.url.startsWith('http') ? config.url : `${API_BASE_URL}${config.url}`;

  // Append query params
  if (config.params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(config.params)) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    }
    const qs = searchParams.toString();
    if (qs) {
      fullUrl += `?${qs}`;
    }
  }

  // Inject wallet address from sessionStorage for auth
  const walletAddress = typeof window !== 'undefined'
    ? sessionStorage.getItem('coinflip_connected_address')
    : null;

  const isGet = config.method.toUpperCase() === 'GET';
  const maxAttempts = isGet ? MAX_RETRIES + 1 : 1; // Only retry GET requests

  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // Create a timeout controller (merged with caller's signal if present)
      const timeoutController = new AbortController();
      const timeoutId = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);

      // If caller provided a signal, abort our controller when it fires
      const callerSignal = config.signal;
      const onCallerAbort = () => timeoutController.abort();
      callerSignal?.addEventListener('abort', onCallerAbort);

      const fetchOptions: RequestInit = {
        method: config.method,
        headers: {
          'Content-Type': 'application/json',
          ...(walletAddress ? { 'x-wallet-address': walletAddress } : {}),
          ...config.headers,
        },
        credentials: 'include',
        signal: timeoutController.signal,
      };

      if (config.data !== undefined) {
        fetchOptions.body = JSON.stringify(config.data);
      }

      let response: Response;
      try {
        response = await fetch(fullUrl, fetchOptions);
      } finally {
        clearTimeout(timeoutId);
        callerSignal?.removeEventListener('abort', onCallerAbort);
      }

      // Retry on transient server errors (GET only)
      if (!response.ok && RETRYABLE_STATUS_CODES.has(response.status) && attempt < maxAttempts - 1) {
        await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
        continue;
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({
          error: { code: 'UNKNOWN', message: response.statusText },
        }));
        throw error;
      }

      // Handle empty responses (204, etc.)
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        return {} as T;
      }

      return response.json() as Promise<T>;
    } catch (err: unknown) {
      lastError = err;

      // Don't retry if caller explicitly aborted
      if (callerAborted(config.signal)) throw err;

      // Retry on network/timeout errors for GET
      const isNetworkError = err instanceof TypeError || (err instanceof DOMException && err.name === 'AbortError');
      if (isNetworkError && attempt < maxAttempts - 1) {
        await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
        continue;
      }

      throw err;
    }
  }

  throw lastError;
};

/** Check if the caller's original signal was aborted */
function callerAborted(signal?: AbortSignal | null): boolean {
  return signal?.aborted ?? false;
}
