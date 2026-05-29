import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import { Server as IOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';

import { env } from './config/env';
import { HttpError } from './shared/http-error';
import { systemClock } from './shared/clock';

import { userRepository } from './repositories/user.repository';
import { roomRepository } from './repositories/room.repository';
import { focusStatRepository } from './repositories/focusStat.repository';
import { chatMessageRepository } from './repositories/chatMessage.repository';
import { banRecordRepository } from './repositories/banRecord.repository';

import { AuthService } from './modules/auth/auth.service';
import { AuthController } from './modules/auth/auth.controller';
import { buildAuthRouter } from './modules/auth/auth.routes';
import { attachSocketAuth } from './modules/auth/auth.socket';

import { RoomService } from './modules/rooms/room.service';
import { RoomController } from './modules/rooms/room.controller';
import { buildRoomRouter } from './modules/rooms/room.routes';
import { registerRoomSocketHandlers } from './modules/rooms/room.socket';
import { SocketRoomEventPublisher } from './modules/rooms/room.events';

import { TimerService } from './modules/timer/timer.service';
import { InMemoryTimerStore } from './modules/timer/timer.store';
import { NodeTimerScheduler } from './modules/timer/timer.scheduler';
import { SocketTimerEventPublisher } from './modules/timer/timer.events';
import { registerTimerSocketHandlers } from './modules/timer/timer.socket';

import { ChatService } from './modules/chat/chat.service';
import { ChatController } from './modules/chat/chat.controller';
import { buildChatRouter } from './modules/chat/chat.routes';
import { registerChatSocketHandlers } from './modules/chat/chat.socket';
import { SocketChatEventPublisher } from './modules/chat/chat.events';

import { MediaService } from './modules/media/media.service';
import { InMemoryMediaStore } from './modules/media/media.store';
import { SocketMediaEventPublisher } from './modules/media/media.events';
import { registerMediaSocketHandlers } from './modules/media/media.socket';

import { AdminService } from './modules/admin/admin.service';
import { AdminController } from './modules/admin/admin.controller';
import { buildAdminRouter } from './modules/admin/admin.routes';
import { SocketUserSessionEnforcer, userChannel } from './modules/admin/admin.session';

import { VoiceService } from './modules/voice/voice.service';
import { VoiceController } from './modules/voice/voice.controller';
import { buildVoiceRouter } from './modules/voice/voice.routes';
import { AgoraVoiceTokenIssuer } from './modules/voice/voice.issuer';

import { HostReconnectCoordinator } from './modules/rooms/host-reconnect.coordinator';

// ---------------------------------------------------------------------------
// HTTP + Socket.IO servers are created first because publishers need `io`.
// ---------------------------------------------------------------------------
const app = express();
const httpServer = createServer(app);
const io = new IOServer(httpServer, {
  cors: { origin: '*' },
});

// ---------------------------------------------------------------------------
// Composition root — concrete implementations wired to interfaces.
// All DSD §3.2 components are now in place.
// ---------------------------------------------------------------------------

// Auth (DSD §3.2.1) — banRecordRepository is passed so error responses
// can include the latest ban reason on the login screen.
const authService = new AuthService(userRepository, banRecordRepository);
const authController = new AuthController(authService);

// Rooms (DSD §3.2.2)
const roomPublisher = new SocketRoomEventPublisher(io);
const roomService = new RoomService(roomRepository, userRepository, roomPublisher);
const roomController = new RoomController(roomService);

// Timer / Pomodoro (DSD §3.2.3)
const timerStore = new InMemoryTimerStore();
const timerScheduler = new NodeTimerScheduler();
const timerPublisher = new SocketTimerEventPublisher(io);
const timerService = new TimerService(
  roomRepository,
  focusStatRepository,
  timerStore,
  timerScheduler,
  timerPublisher,
  systemClock,
);

// Chat (DSD §3.2.4)
const chatPublisher = new SocketChatEventPublisher(io);
const chatService = new ChatService(
  roomRepository,
  chatMessageRepository,
  chatPublisher,
);
const chatController = new ChatController(chatService);

// Media Sync (DSD §3.2.5)
const mediaStore = new InMemoryMediaStore();
const mediaPublisher = new SocketMediaEventPublisher(io);
const mediaService = new MediaService(
  roomRepository,
  mediaStore,
  mediaPublisher,
  systemClock,
);

// Admin Moderation (DSD §3.2.6)
const sessionEnforcer = new SocketUserSessionEnforcer(io);
const adminService = new AdminService(
  userRepository,
  banRecordRepository,
  roomRepository,
  roomService,        // implements IRoomMemberRemover
  sessionEnforcer,
);
const adminController = new AdminController(adminService);

// Voice / Agora (DSD §3.5.6, DL-01)
const voiceIssuer = new AgoraVoiceTokenIssuer(
  env.AGORA_APP_ID,
  env.AGORA_APP_CERTIFICATE,
);
const voiceService = new VoiceService(roomRepository, voiceIssuer);
const voiceController = new VoiceController(voiceService);

// Host disconnect grace coordinator (DSD §3.5.7)
const hostReconnect = new HostReconnectCoordinator(
  roomRepository,
  roomService,
  env.HOST_RECONNECT_GRACE_MS,
);

// Lifecycle hooks: when a room is deleted, every module with per-room
// in-memory state drops it. Order doesn't matter; each listener is
// independent.
roomService.addLifecycleListener({
  onRoomDeleted: (roomId) => timerService.cleanupRoom(roomId),
});
roomService.addLifecycleListener({
  onRoomDeleted: (roomId) => mediaService.cleanupRoom(roomId),
});

// ---------------------------------------------------------------------------
// Express HTTP surface
// ---------------------------------------------------------------------------
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', buildAuthRouter(authController));
app.use('/api/rooms', buildRoomRouter(roomController));
app.use('/api', buildChatRouter(chatController));
app.use('/api/admin', buildAdminRouter(adminController));
app.use('/api/voice', buildVoiceRouter(voiceController));

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: { message: 'Not found' } });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    // Surface the optional ban reason carried by AccountBannedError so
    // the client can render it on the login screen.
    const extra: Record<string, unknown> = {};
    if ('reason' in err && (err as { reason?: unknown }).reason !== undefined) {
      extra.reason = (err as { reason?: unknown }).reason;
    }
    res.status(err.status).json({
      error: { message: err.message, code: err.code, ...extra },
    });
    return;
  }
  // eslint-disable-next-line no-console
  console.error('Unhandled error:', err);
  res.status(500).json({ error: { message: 'Internal server error' } });
});

// ---------------------------------------------------------------------------
// Socket.IO gateway
// ---------------------------------------------------------------------------

attachSocketAuth(io, authService);

io.on('connection', (socket) => {
  if (socket.data.user) {
    void socket.join(userChannel(socket.data.user.id));
    // Cancel any pending host-disconnect grace timer (DSD §3.5.7).
    hostReconnect.onReconnect(socket.data.user.id);
  }

  // eslint-disable-next-line no-console
  console.log(
    `[ws] connected user=${socket.data.user?.id} role=${socket.data.user?.role} sid=${socket.id}`,
  );

  // Module-specific handlers. Event names are namespaced
  // (room:*, timer:*, chat:*, media:*).
  registerRoomSocketHandlers(socket, roomService, timerService, mediaService, chatService);
  registerTimerSocketHandlers(socket, timerService);
  registerChatSocketHandlers(socket, chatService);
  registerMediaSocketHandlers(socket, mediaService);

  socket.on('disconnect', async (reason) => {
    // eslint-disable-next-line no-console
    console.log(`[ws] disconnected sid=${socket.id} reason=${reason}`);

    const user = socket.data.user;
    if (!user) return;

    try {
      // Only auto-leave if this was the user's LAST connected socket
      // (handles multi-tab: closing one tab shouldn't kick from the room).
      const remaining = await io.in(userChannel(user.id)).fetchSockets();
      if (remaining.length > 0) return;

      const active = await roomRepository.findActiveMembershipByUser(user.id);
      if (!active) return;

      // Host gets a grace window (DSD §3.5.7). If this returns true, the
      // coordinator owns the leave; otherwise we leave immediately.
      const deferred = await hostReconnect.onLastSocketDisconnect(user, active.roomId);
      if (deferred) {
        // eslint-disable-next-line no-console
        console.log(`[ws] host disconnect grace armed room=${active.roomId} user=${user.id}`);
      } else {
        await roomService.leaveRoom(user, active.roomId);
        // eslint-disable-next-line no-console
        console.log(`[ws] auto-left room ${active.roomId} for user ${user.id}`);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[ws] auto-leave failed for user ${user.id}:`, err);
    }
  });
});

httpServer.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`SYNCFLOW backend listening on http://localhost:${env.PORT}`);
});
