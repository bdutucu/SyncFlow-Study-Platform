import { useToasts } from '../lib/toast';

/**
 * ToastHost — fixed-position stack of notification cards. Rendered once
 * in <Shell> so every protected route shares the same notification
 * surface.
 */
export function ToastHost() {
  const items = useToasts((s) => s.items);
  const dismiss = useToasts((s) => s.dismiss);

  return (
    <div className="fixed right-4 bottom-4 sm:right-8 sm:bottom-8 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
      {items.map((t) => {
        const accent =
          t.kind === 'work'  ? 'border-focus' :
          t.kind === 'rest'  ? 'border-rest'  :
          t.kind === 'error' ? 'border-focus-deep' :
                               'border-ink';
        return (
          <div
            key={t.id}
            className={`card-paper border-l-4 ${accent} pl-4 pr-3 py-3 pointer-events-auto animate-rise relative`}
            role="status"
          >
            <button
              onClick={() => dismiss(t.id)}
              className="absolute top-1.5 right-2 eyebrow hover:text-ink"
              aria-label="dismiss"
            >×</button>
            <div className="eyebrow mb-0.5">{t.kind === 'error' ? 'Problem' : 'Notice'}</div>
            <div className="font-display text-base leading-tight pr-4">{t.title}</div>
            {t.body && (
              <div className="font-italic italic text-ink-soft text-sm mt-1 leading-snug">{t.body}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
