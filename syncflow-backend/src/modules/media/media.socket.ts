import { Socket } from 'socket.io';
import { MediaService } from './media.service';
import {
  mediaRoomOnlySchema,
  mediaLoadSchema,
  mediaSeekSchema,
} from './media.validators';
import { HttpError } from '../../shared/http-error';

/**
 * Per-socket handlers for the media module.
 *
 * All commands are socket-only (DSD §3.2.5 — synchronous playback
 * control needs minimum-latency fan-out). REST history endpoints do
 * not apply: media state is ephemeral.
 *
 * Wire protocol (all events use payload objects + ack callbacks):
 *
 *   socket.emit('media:get_state', { roomId }, (res) => { ... });
 *   socket.emit('media:load',      { roomId, url, startAtMs? }, ack);
 *   socket.emit('media:play',      { roomId }, ack);
 *   socket.emit('media:pause',     { roomId }, ack);
 *   socket.emit('media:seek',      { roomId, positionMs }, ack);
 *   socket.emit('media:unload',    { roomId }, ack);
 *
 *   ack.ok === true,  ack.state === current MediaState
 *   ack.ok === false, ack.error === code (e.g. 'MEDIA_HOST_ONLY',
 *                                              'MEDIA_INVALID_URL',
 *                                              'MEDIA_NO_VIDEO',
 *                                              'VALIDATION',
 *                                              'UNAUTHENTICATED')
 */

type Ack = (res: { ok: boolean; state?: unknown; error?: string }) => void;

function fail(ack: Ack | undefined, err: unknown): void {
  if (!ack) return;
  if (err instanceof HttpError) ack({ ok: false, error: err.code ?? err.message });
  else ack({ ok: false, error: 'SERVER_ERROR' });
}

export function registerMediaSocketHandlers(
  socket: Socket,
  service: MediaService,
): void {
  const user = () => socket.data.user;

  socket.on('media:get_state', async (payload: unknown, ack?: Ack) => {
    try {
      const u = user();
      if (!u) return fail(ack, new Error('UNAUTHENTICATED'));
      const parsed = mediaRoomOnlySchema.safeParse(payload);
      if (!parsed.success) return ack?.({ ok: false, error: 'VALIDATION' });
      const state = await service.getState(u, parsed.data.roomId);
      ack?.({ ok: true, state });
    } catch (err) {
      fail(ack, err);
    }
  });

  socket.on('media:load', async (payload: unknown, ack?: Ack) => {
    try {
      const u = user();
      if (!u) return fail(ack, new Error('UNAUTHENTICATED'));
      const parsed = mediaLoadSchema.safeParse(payload);
      if (!parsed.success) return ack?.({ ok: false, error: 'VALIDATION' });
      const state = await service.load(
        u,
        parsed.data.roomId,
        parsed.data.url,
        parsed.data.startAtMs,
      );
      ack?.({ ok: true, state });
    } catch (err) {
      fail(ack, err);
    }
  });

  socket.on('media:unload', async (payload: unknown, ack?: Ack) => {
    try {
      const u = user();
      if (!u) return fail(ack, new Error('UNAUTHENTICATED'));
      const parsed = mediaRoomOnlySchema.safeParse(payload);
      if (!parsed.success) return ack?.({ ok: false, error: 'VALIDATION' });
      const state = await service.unload(u, parsed.data.roomId);
      ack?.({ ok: true, state });
    } catch (err) {
      fail(ack, err);
    }
  });

  socket.on('media:play', async (payload: unknown, ack?: Ack) => {
    try {
      const u = user();
      if (!u) return fail(ack, new Error('UNAUTHENTICATED'));
      const parsed = mediaRoomOnlySchema.safeParse(payload);
      if (!parsed.success) return ack?.({ ok: false, error: 'VALIDATION' });
      const state = await service.play(u, parsed.data.roomId);
      ack?.({ ok: true, state });
    } catch (err) {
      fail(ack, err);
    }
  });

  socket.on('media:pause', async (payload: unknown, ack?: Ack) => {
    try {
      const u = user();
      if (!u) return fail(ack, new Error('UNAUTHENTICATED'));
      const parsed = mediaRoomOnlySchema.safeParse(payload);
      if (!parsed.success) return ack?.({ ok: false, error: 'VALIDATION' });
      const state = await service.pause(u, parsed.data.roomId);
      ack?.({ ok: true, state });
    } catch (err) {
      fail(ack, err);
    }
  });

  socket.on('media:seek', async (payload: unknown, ack?: Ack) => {
    try {
      const u = user();
      if (!u) return fail(ack, new Error('UNAUTHENTICATED'));
      const parsed = mediaSeekSchema.safeParse(payload);
      if (!parsed.success) return ack?.({ ok: false, error: 'VALIDATION' });
      const state = await service.seek(
        u,
        parsed.data.roomId,
        parsed.data.positionMs,
      );
      ack?.({ ok: true, state });
    } catch (err) {
      fail(ack, err);
    }
  });
}
