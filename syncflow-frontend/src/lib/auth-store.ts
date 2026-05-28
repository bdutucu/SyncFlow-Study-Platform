import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthTokens, PublicUser } from './types';

interface AuthState {
  user: PublicUser | null;
  tokens: AuthTokens | null;
  setSession: (user: PublicUser, tokens: AuthTokens) => void;
  setTokens: (tokens: AuthTokens) => void;
  setUser: (user: PublicUser) => void;
  logout: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      tokens: null,
      setSession: (user, tokens) => set({ user, tokens }),
      setTokens: (tokens) => set({ tokens }),
      setUser: (user) => set({ user }),
      logout: () => set({ user: null, tokens: null }),
    }),
    { name: 'syncflow-auth' },
  ),
);
