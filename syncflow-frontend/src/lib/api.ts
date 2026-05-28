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

api.interceptors.response.use(
  (r) => r,
  async (err: AxiosError) => {
    const original = err.config as (typeof err.config & { _retry?: boolean }) | undefined;
    const status = err.response?.status;

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
