import { Socket } from 'socket.io';
import { TimerService } from './timer.service';
import { timerConfigPatchSchema } from './timer.validators';
import { HttpError } from '../../shared/http-error';

/**
 * Per-socket handlers for the timer module. Registered from server.ts
 * for every incoming connection.
 *
 * All timer commands are socket-only because they are inherently
 * low-latency, real-time controls — adding REST round-trips would
 * accumulate visible lag for participants watching the timer change.
 *
 * Wire protocol (acks):
 *
 *   socket.emit('timer:start', roomId, (res) => { ... });
 *     // res.ok === true,  res.state === current TimerState
 *     // res.ok === false, res.error === code (e.g. 'TIMER_HOST_ONLY')
 *
 * Same shape for: timer:pause | timer:resume | timer:reset | timer:skip |
 *                 timer:configure | timer:get_state.
 *
 * For timer:configure, the second argument is the patch object:
 *   socket.emit('timer:configure', roomId, patch, ack);
 *
 * Membership and host gating are enforced inside TimerService, not here.
 */

type Ack = (res: { ok: boolean; state?: unknown; error?: string }) => void;

function fail(ack: Ack | undefined, err: unknown): void {
  if (!ack) return;
  if (err instanceof HttpError) ack({ ok: false, error: err.code ?? err.message });
  else ack({ ok: false, error: 'SERVER_ERROR' });
}

export function registerTimerSocketHandlers(
  socket: Socket,
  service: TimerService,
): void {
  const user = () => socket.data.user;

  socket.on('timer:get_state', async (roomId: unknown, ack?: Ack) => {
    try {
      const u = user();
      if (!u) return fail(ack, new Error('UNAUTHENTICATED'));
      if (typeof roomId !== 'string') return ack?.({ ok: false, error: 'BAD_REQUEST' });
      const state = await service.getState(u, roomId);
      ack?.({ ok: true, state });
    } catch (err) {
      fail(ack, err);
    }
  });

  socket.on('timer:start', async (roomId: unknown, ack?: Ack) => {
    try {
      const u = user();
      if (!u) return fail(ack, new Error('UNAUTHENTICATED'));
      if (typeof roomId !== 'string') return ack?.({ ok: false, error: 'BAD_REQUEST' });
      const state = await service.start(u, roomId);
      ack?.({ ok: true, state });
    } catch (err) {
      fail(ack, err);
    }
  });

  socket.on('timer:pause', async (roomId: unknown, ack?: Ack) => {
    try {
      const u = user();
      if (!u) return fail(ack, new Error('UNAUTHENTICATED'));
      if (typeof roomId !== 'string') return ack?.({ ok: false, error: 'BAD_REQUEST' });
      const state = await service.pause(u, roomId);
      ack?.({ ok: true, state });
    } catch (err) {
      fail(ack, err);
    }
  });

  socket.on('timer:resume', async (roomId: unknown, ack?: Ack) => {
    try {
      const u = user();
      if (!u) return fail(ack, new Error('UNAUTHENTICATED'));
      if (typeof roomId !== 'string') return ack?.({ ok: false, error: 'BAD_REQUEST' });
      const state = await service.resume(u, roomId);
      ack?.({ ok: true, state });
    } catch (err) {
      fail(ack, err);
    }
  });

  socket.on('timer:reset', async (roomId: unknown, ack?: Ack) => {
    try {
      const u = user();
      if (!u) return fail(ack, new Error('UNAUTHENTICATED'));
      if (typeof roomId !== 'string') return ack?.({ ok: false, error: 'BAD_REQUEST' });
      const state = await service.reset(u, roomId);
      ack?.({ ok: true, state });
    } catch (err) {
      fail(ack, err);
    }
  });

  socket.on('timer:skip', async (roomId: unknown, ack?: Ack) => {
    try {
      const u = user();
      if (!u) return fail(ack, new Error('UNAUTHENTICATED'));
      if (typeof roomId !== 'string') return ack?.({ ok: false, error: 'BAD_REQUEST' });
      const state = await service.skip(u, roomId);
      ack?.({ ok: true, state });
    } catch (err) {
      fail(ack, err);
    }
  });

  socket.on(
    'timer:configure',
    async (roomId: unknown, patchRaw: unknown, ack?: Ack) => {
      try {
        const u = user();
        if (!u) return fail(ack, new Error('UNAUTHENTICATED'));
        if (typeof roomId !== 'string') {
          return ack?.({ ok: false, error: 'BAD_REQUEST' });
        }
        const parsed = timerConfigPatchSchema.safeParse(patchRaw);
        if (!parsed.success) return ack?.({ ok: false, error: 'VALIDATION' });
        const state = await service.configure(u, roomId, parsed.data);
        ack?.({ ok: true, state });
      } catch (err) {
        fail(ack, err);
      }
    },
  );
}
