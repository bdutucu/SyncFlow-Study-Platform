import { create } from 'zustand';

/**
 * Tiny app-wide toast store. We avoid pulling in a full library — the
 * volume of in-app notifications is low (phase transitions, occasional
 * errors) and the visual language is bespoke to the Library Study Hall
 * aesthetic.
 */
export type ToastKind = 'info' | 'work' | 'rest' | 'error';

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string;
  /** Auto-dismiss after this many ms (defaults to 5_000). */
  ttl?: number;
}

interface ToastState {
  items: Toast[];
  push: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToasts = create<ToastState>((set) => ({
  items: [],
  push: (t) => {
    const id = nextId++;
    const toast: Toast = { id, ttl: 5000, ...t };
    set((s) => ({ items: [...s.items, toast] }));
    if (toast.ttl && toast.ttl > 0) {
      window.setTimeout(() => {
        set((s) => ({ items: s.items.filter((x) => x.id !== id) }));
      }, toast.ttl);
    }
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((x) => x.id !== id) })),
}));

export const toast = {
  info:  (title: string, body?: string) => useToasts.getState().push({ kind: 'info',  title, body }),
  work:  (title: string, body?: string) => useToasts.getState().push({ kind: 'work',  title, body }),
  rest:  (title: string, body?: string) => useToasts.getState().push({ kind: 'rest',  title, body }),
  error: (title: string, body?: string) => useToasts.getState().push({ kind: 'error', title, body, ttl: 8000 }),
};
