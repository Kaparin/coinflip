const API_BASE_URL = typeof window !== 'undefined'
  ? (window as Record<string, unknown>).__API_URL__ as string ?? 'http://localhost:3001'
  : process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export const customFetch = async <T>(
  url: string,
  options?: RequestInit,
): Promise<T> => {
  const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`;

  const response = await fetch(fullUrl, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { code: 'UNKNOWN', message: response.statusText } }));
    throw error;
  }

  return response.json() as Promise<T>;
};
