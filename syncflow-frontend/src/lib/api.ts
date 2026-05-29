import axios from 'axios';
import type { AxiosError, AxiosInstance } from 'axios';
import { useAuth } from './auth-store';

const baseURL = '/api';

export const api: AxiosInstance = axios.create({ baseURL });

api.interceptors.request.use((config) => {
  const token = useAuth.getState().tokens?.accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing: Promise<string | null> | null = null;

/**
 * Shape we read off a JSON error body, including the optional ban
 * reason carried by AccountBannedError.
 */
type ApiError = { message?: string; code?: string; reason?: string | null };

/**
 * Wipe the local session and bounce to the login page with a `banned`
 * query-string flag. Used by both the REST interceptor and the socket
 * `connect_error` handler so the UX is identical no matter which
 * surface notices the ban first.
 */
export function forceLogoutBanned(reason: string | null): void {
  useAuth.getState().logout();
  const params = new URLSearchParams({ banned: '1' });
  if (reason) params.set('reason', reason);
  // Hard navigation — guarantees every component remounts cleanly.
  window.location.href = `/auth?${params.toString()}`;
}

api.interceptors.response.use(
  (r) => r,
  async (err: AxiosError) => {
    const original = err.config as (typeof err.config & { _retry?: boolean }) | undefined;
    const status = err.response?.status;
    const data = (err.response?.data as { error?: ApiError } | undefined)?.error;

    // ACCOUNT_BANNED can come back on login, refresh, or any protected
    // endpoint that revalidates ban status (e.g. POST /rooms/:id/join).
    // Treat it as a hard session reset.
    if (status === 403 && data?.code === 'ACCOUNT_BANNED') {
      forceLogoutBanned(data.reason ?? null);
      return Promise.reject(err);
    }

    if (status === 401 && original && !original._retry) {
      original._retry = true;
      const newAccess = await refreshTokensOnce();
      if (newAccess) {
        original.headers = original.headers ?? {};
        original.headers.Authorization = `Bearer ${newAccess}`;
        return api(original);
      }
      useAuth.getState().logout();
    }
    return Promise.reject(err);
  },
);

async function refreshTokensOnce(): Promise<string | null> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const refreshToken = useAuth.getState().tokens?.refreshToken;
      if (!refreshToken) return null;
      const res = await axios.post(`${baseURL}/auth/refresh`, { refreshToken });
      const tokens = res.data.tokens;
      useAuth.getState().setTokens(tokens);
      return tokens.accessToken as string;
    } catch {
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export function errorMessage(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const data = e.response?.data as { error?: { message?: string; code?: string } } | undefined;
    return data?.error?.message ?? e.message;
  }
  return e instanceof Error ? e.message : 'Unknown error';
}
