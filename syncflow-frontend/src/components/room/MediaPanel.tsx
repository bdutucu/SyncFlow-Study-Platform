import { useEffect, useRef, useState } from 'react';
import type { MediaState } from '../../lib/types';
import { emitAck } from '../../lib/socket';

interface Props {
  roomId: string;
  state: MediaState | null;
  isHost: boolean;
}

export function MediaPanel({ roomId, state, isHost }: Props) {
  const [url, setUrl] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const call = async (event: string, payload: Record<string, unknown>) => {
    setErr(null);
    try { await emitAck(event, { roomId, ...payload }); }
    catch (e) { setErr(e instanceof Error ? e.message : 'failed'); }
  };

  const load = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    await call('media:load', { url: url.trim() });
    setUrl('');
  };

  const hasVideo = !!state?.videoId;

  // Build the embed src with start position
  const embedSrc = (() => {
    if (!state?.videoId) return null;
    const startSec = Math.floor(currentPosition(state) / 1000);
    const auto = state.status === 'PLAYING' ? 1 : 0;
    return `https://www.youtube.com/embed/${state.videoId}?autoplay=${auto}&start=${startSec}&rel=0&modestbranding=1`;
  })();

  // Re-key the iframe whenever the loaded video or major state changes
  // (cheap re-sync — heavier than a YouTube IFrame API integration but
  // good enough for now)
  const iframeKey = state ? `${state.videoId}|${state.status}|${state.positionUpdatedAt ?? state.playbackPositionMs}` : 'empty';

  useEffect(() => {
    // noop: the key change above remounts the iframe
  }, [iframeKey]);

  return (
    <div className="card-paper p-5">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="eyebrow">§ Window</div>
          <div className="font-display text-lg leading-none mt-0.5">Shared view</div>
        </div>
        {state?.loadedAt && (
          <span className="font-mono text-[10px] text-ink-muted">
            {state.status.toLowerCase()}
          </span>
        )}
      </div>

      {/* Player */}
      <div className="aspect-video bg-ink rounded-sm overflow-hidden border border-ink/30">
        {embedSrc ? (
          <iframe
            ref={iframeRef}
            key={iframeKey}
            src={embedSrc}
            title="Shared YouTube"
            className="w-full h-full"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div className="w-full h-full grid place-items-center text-paper-edge font-italic italic">
            no view yet
          </div>
        )}
      </div>

      {/* Host controls */}
      {isHost ? (
        <>
          <form onSubmit={load} className="mt-3 flex gap-2">
            <input
              className="flex-1 bg-transparent border-b border-ink/30 px-1 py-2 text-sm focus:outline-none focus:border-ink"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="paste a YouTube URL…"
            />
            <button className="btn-ink btn-sm">load</button>
          </form>
          {hasVideo && (
            <div className="mt-2 flex flex-wrap gap-2">
              {state?.status === 'PLAYING' ? (
                <button onClick={() => void call('media:pause', {})} className="btn-ghost btn-sm">pause</button>
              ) : (
                <button onClick={() => void call('media:play', {})} className="btn-ghost btn-sm">play</button>
              )}
              <button onClick={() => void call('media:seek', { positionMs: 0 })} className="btn-ghost btn-sm">restart</button>
              <button onClick={() => void call('media:unload', {})} className="btn-ghost btn-sm">unload</button>
            </div>
          )}
        </>
      ) : (
        <div className="mt-3 font-italic italic text-ink-muted text-xs">
          The host curates the window.
        </div>
      )}
      {err && <div className="mt-2 text-xs text-focus-deep font-italic italic">{err}</div>}
    </div>
  );
}

function currentPosition(s: MediaState): number {
  if (s.status === 'PLAYING' && s.positionUpdatedAt !== null) {
    return s.playbackPositionMs + (Date.now() - s.positionUpdatedAt);
  }
  return s.playbackPositionMs;
}
