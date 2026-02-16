const API_BASE_URL = typeof window !== 'undefined'
  ? ((window as unknown as Record<string, unknown>).__API_URL__ as string | undefined) ?? 'http://localhost:3001'
  : process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/**
 * Custom fetch adapter for Orval-generated API client.
 * Orval calls: customFetch<T>({ url, method, params, data, headers, signal }, extraOptions?)
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

  const fetchOptions: RequestInit = {
    method: config.method,
    headers: {
      'Content-Type': 'application/json',
      ...(walletAddress ? { 'x-wallet-address': walletAddress } : {}),
      ...config.headers,
    },
    credentials: 'include',
    signal: config.signal,
  };

  if (config.data !== undefined) {
    fetchOptions.body = JSON.stringify(config.data);
  }

  const response = await fetch(fullUrl, fetchOptions);

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
};
