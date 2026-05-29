# SYNCFLOW Backend

Backend for the SYNCFLOW project (CSE3044 Term Project). Implemented modules:

- **Authentication & Authorization** (DSD §3.2.1, §3.5.5)
- **Room Management** (DSD §3.2.2) — with 30-second host reconnect grace window (§3.5.7)
- **Pomodoro Sync Engine** (DSD §3.2.3)
- **Real-Time Chat** (DSD §3.2.4, persistent per §3.5.3)
- **Media Sync** (DSD §3.2.5) — host-controlled YouTube playback
- **Voice Token Issuance** (DSD §3.5.6, DL-01) — Agora RTC token minting
- **Admin Moderation** (DSD §3.2.6)
- **`room:resync` socket event** (DSD §3.5.7) — single round-trip recovery of timer + media + recent chat on reconnect

## Tech stack (per DSD §2.3 and §3.5)

- **Node.js 20 + TypeScript** — modular monolith
- **Express** — REST surface
- **Socket.IO v4** — real-time gateway (auth middleware already wired)
- **PostgreSQL 16 + Prisma** — persistent storage behind repository interfaces
- **bcrypt** (cost 10) — password hashing
- **jsonwebtoken** — stateless JWT (15-min access + 7-day refresh)
- **Zod** — input validation

## What's implemented

| Concern                                             | DSD ref       | Files                                      |
| --------------------------------------------------- | ------------- | ------------------------------------------ |
| `User` model with `role` and `isBanned`             | §3.4.1        | `prisma/schema.prisma`                     |
| Repository pattern behind `IUserRepository`         | §3.5.8        | `src/repositories/`                        |
| Registration + bcrypt hashing                       | §3.2.1, §3.5.5 | `auth.service.ts`, `shared/password.ts`    |
| Login + JWT issuance (15-min access, 7-day refresh) | §3.5.5        | `auth.service.ts`, `shared/jwt.ts`         |
| Refresh-token rotation with ban re-check            | §3.5.5        | `auth.service.ts`                          |
| Express `requireAuth` and `requireRole` middleware  | §3.2.1, §3.5.5 | `auth.middleware.ts`                       |
| Socket.IO middleware w/ **live** ban check          | §3.5.5        | `auth.socket.ts`                           |
| Centralised HTTP error mapping                      | —             | `shared/http-error.ts`, `server.ts`        |
| Sample unit tests against in-memory repo            | §3.3.5        | `auth.service.test.ts`                     |
| `Room` + `RoomMembership` models, status history    | §3.4.1        | `prisma/schema.prisma`                     |
| Repository pattern behind `IRoomRepository`         | §3.5.8        | `src/repositories/`                        |
| Room CRUD + listing with search/pagination          | §3.2.2        | `room.service.ts`, `room.controller.ts`    |
| Join/leave with capacity + password + single-room   | §3.2.2        | `room.service.ts`                          |
| Auto host transfer + room close on host-leave       | §3.2.2        | `room.service.ts`                          |
| Host-gated update / delete / kick (admin override)  | §3.2.2, §3.2.6 | `room.service.ts`                          |
| Socket.IO room channels + live events publisher     | §3.2.2        | `room.events.ts`, `room.socket.ts`         |
| Room service unit tests (~17 cases)                 | §3.3.5        | `room.service.test.ts`                     |
| `FocusStat` model + `TimerPhase` enum               | §3.4.1        | `prisma/schema.prisma`                     |
| `IFocusStatRepository` (aggregation queries)        | §3.5.8        | `src/repositories/`                        |
| Server-authoritative Pomodoro state machine        | §3.2.3        | `timer.service.ts`, `timer.types.ts`       |
| Host-gated socket commands (start/pause/skip/...)   | §3.2.3        | `timer.socket.ts`, `timer.service.ts`      |
| Auto-advance with long-break every Nth cycle        | §3.2.3        | `timer.service.ts` (`advanceToNextPhase`)  |
| FocusStat write per active member on WORK end       | §3.2.3, §3.4.1 | `timer.service.ts` (`recordFocusStats`)    |
| Live `timer:*` events on the same room channel      | §3.2.3        | `timer.events.ts`                          |
| Cleanup hook from RoomService on room deletion      | —             | `room.service.ts`, `server.ts`             |
| Timer service unit tests (~17 cases)                | §3.3.5        | `timer.service.test.ts`                    |
| `ChatMessage` model w/ soft delete + author/room FK | §3.4.1        | `prisma/schema.prisma`                     |
| `IChatMessageRepository` w/ keyset pagination       | §3.5.8        | `src/repositories/`                        |
| Send / list / soft-delete chat messages             | §3.2.4, §3.5.3 | `chat.service.ts`                          |
| Member-only send/list; author-or-admin delete       | §3.2.4, §3.2.6 | `chat.service.ts`                          |
| Socket `chat:send_message` + REST history + delete  | §3.2.4        | `chat.socket.ts`, `chat.routes.ts`         |
| Live `chat:*` events on the same room channel       | §3.2.4        | `chat.events.ts`                           |
| Content redaction on soft-delete                    | §3.2.4, §3.2.6 | `chat.service.ts` (`toDTO`)                |
| Chat service unit tests (~18 cases)                 | §3.3.5        | `chat.service.test.ts`                     |
| Server-authoritative media state machine            | §3.2.5        | `media.service.ts`, `media.types.ts`       |
| YouTube URL parser (watch / youtu.be / embed / shorts) | §3.2.5     | `media.url.ts`                             |
| Host-only socket commands (load/play/pause/seek/unload) | §3.2.5    | `media.socket.ts`, `media.service.ts`      |
| Live `media:state_changed` events on the room channel | §3.2.5      | `media.events.ts`                          |
| Lifecycle cleanup of media state on room delete     | §3.2.5        | `server.ts` (lifecycle listener)           |
| Media service unit tests (~20 cases)                | §3.3.5        | `media.service.test.ts`                    |
| `BanRecord` model + `BanAction` enum                | §3.4.1        | `prisma/schema.prisma`                     |
| `IBanRecordRepository` (transactional ban/unban)    | §3.5.8        | `src/repositories/`                        |
| Admin user listing with search + banned-only filter | §3.2.6        | `admin.service.ts`                         |
| Atomic ban/unban with audit row                     | §3.2.6        | `banRecord.repository.ts`                  |
| Ban cascade: close room membership, transfer host   | §3.2.6, §3.2.2 | `admin.service.ts`, `room.service.ts` (`removeMemberByAdmin`) |
| Immediate session termination on ban                | §3.2.6, §3.5.5 | `admin.session.ts`                         |
| Cannot ban self / other admins                      | §3.2.6        | `admin.service.ts`                         |
| Admin service unit tests (~16 cases)                | §3.3.5        | `admin.service.test.ts`                    |
| `room:resync` socket event (timer + media + chat)   | §3.5.7        | `room.socket.ts`                           |
| Host 30-second reconnect grace window               | §3.5.7        | `host-reconnect.coordinator.ts`            |
| Voice token issuance (Agora) — `/api/voice/...`     | §3.5.6, DL-01 | `modules/voice/`                           |

## Layout

```
syncflow-backend/
├── prisma/schema.prisma             User model + UserRole enum
├── src/
│   ├── config/env.ts                Validated env loading (Zod)
│   ├── shared/
│   │   ├── prisma.ts                PrismaClient singleton
│   │   ├── password.ts              bcrypt hash/verify + timing-safe dummy
│   │   ├── jwt.ts                   access/refresh sign + verify
│   │   └── http-error.ts            HTTP error hierarchy
│   ├── repositories/
│   │   ├── interfaces/IUserRepository.ts
│   │   └── user.repository.ts       Prisma-backed implementation
│   ├── modules/auth/
│   │   ├── auth.types.ts            (also augments Express.Request)
│   │   ├── auth.validators.ts       Zod schemas
│   │   ├── auth.errors.ts           Domain errors → HTTP statuses
│   │   ├── auth.service.ts          Business logic
│   │   ├── auth.service.test.ts     Unit tests (in-memory repo)
│   │   ├── auth.controller.ts       Express handlers
│   │   ├── auth.routes.ts           Router factory
│   │   ├── auth.middleware.ts       requireAuth, requireRole
│   │   └── auth.socket.ts           Socket.IO connection middleware
│   └── server.ts                    Composition root + bootstrap
├── .env.example
├── jest.config.js
├── jest.setup.ts
├── package.json
└── tsconfig.json
```

## Setup

### Option A — Docker (recommended)

Requires only **Docker Desktop** (or Docker Engine + Compose plugin). No Node.js or PostgreSQL needed on your machine.

```bash
# 1. Copy and fill in secrets — DATABASE_URL and everything else is
#    set inside docker-compose.yml, so only the JWT secrets are needed here.
cp .env.example .env
# Generate two different secrets and paste them into .env:
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"

# 2. Build the image, apply migrations, and start everything
docker compose up --build

# Server:   http://localhost:3000
# Health:   http://localhost:3000/health
# Postgres: localhost:5433  (usable from GUI tools like TablePlus / DBeaver)
#
# NOTE: We map host port 5433 (not 5432) to avoid collisions with a
# native Postgres install many Windows machines already have. Adjust
# DATABASE_URL accordingly when running the app locally with `npm run
# dev` outside Docker.
```

Subsequent starts (no rebuild):
```bash
docker compose up
```

Stop / reset:
```bash
docker compose down       # stops containers, keeps database volume
docker compose down -v    # stops containers + wipes the database
```

### Option B — Hybrid (recommended for dev)

Run **only Postgres in Docker**, app on host with hot reload via `ts-node-dev`:

```powershell
# 1. Start Postgres (port 5433 on host)
docker compose up -d db

# 2. .env should contain (already does by default):
#    DATABASE_URL=postgresql://syncflow:syncflow@localhost:5433/syncflow

# 3. Generate Prisma client + apply schema on first run
npx prisma generate
npx prisma db push

# 4. (Optional but recommended for demos) populate the database
npx prisma db seed     # see ../DEMO_CREDENTIALS.md

# 5. Run the app with hot reload
npm run dev
```

The app listens on `http://localhost:3000`. Restart it any time with Ctrl+C; the Postgres container keeps running.

The seed script is idempotent — running it twice updates the seeded rows rather than duplicating. It's scoped to its own row IDs (`seed-*`) so it never touches accounts or rooms created through the UI.

### Option C — Fully manual (Node + native Postgres)

If you already run Postgres natively on 5432, point `DATABASE_URL` at it instead and skip Docker entirely:

```powershell
cp .env.example .env  # then edit DATABASE_URL to your local Postgres
npm install
npx prisma migrate dev --name init
npm run dev
```

### Tests (no database, no Docker needed)

```bash
npm test
```



## HTTP API

All request and response bodies are JSON.

### `POST /api/auth/register` — create account
Request:
```json
{ "email": "alice@example.com", "username": "alice", "password": "Secret123" }
```
`201 Created`:
```json
{
  "user":   { "id": "...", "email": "alice@example.com", "username": "alice", "role": "STANDARD" },
  "tokens": { "accessToken": "...", "refreshToken": "..." }
}
```
`409 EMAIL_TAKEN` / `409 USERNAME_TAKEN` on duplicates.

### `POST /api/auth/login`
Request: `{ "email", "password" }` → same shape as register on success.
`401 INVALID_CREDENTIALS` on bad credentials. `403 ACCOUNT_BANNED` if banned.

### `POST /api/auth/refresh`
Request: `{ "refreshToken": "..." }` → `{ "tokens": { ... } }`.
`401 INVALID_TOKEN` if expired or malformed. `403 ACCOUNT_BANNED` if user was banned.

### `GET /api/auth/me`
Header: `Authorization: Bearer <accessToken>`.
`200 OK` → `{ "user": { "id": "...", "role": "STANDARD" } }`.
`401 MISSING_AUTH` or `401 INVALID_TOKEN` otherwise.

## Socket.IO authentication

Connect with the access token in handshake auth:

```js
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  auth: { token: accessToken },
});

socket.on('connect_error', (err) => console.error(err.message)); // 'UNAUTHENTICATED'
```

The middleware decodes the token **and** re-checks ban status against the database (DSD §3.5.5: *"the next Socket reconnection fails even if the token is still technically valid"*). On success it sets `socket.data.user = { id, role }` for downstream handlers in the room/timer/chat modules.

## Rooms HTTP API (all require `Authorization: Bearer <accessToken>`)

| Method & path                                    | Purpose                                    |
| ------------------------------------------------ | ------------------------------------------ |
| `POST /api/rooms`                                | Create a room. Creator becomes host + first active member. |
| `GET /api/rooms?page=1&pageSize=20&search=...`   | List public rooms with pagination + optional search. |
| `GET /api/rooms/:id`                             | Get full room details + active members. Private rooms restricted to members + admins. |
| `PATCH /api/rooms/:id`                           | Update room (host or admin). `password: null` clears the password. |
| `DELETE /api/rooms/:id`                          | Delete the room (host or admin). |
| `POST /api/rooms/:id/join`                       | Join the room. Body `{ "password"? }`. Rejects if user is already active in another room. |
| `POST /api/rooms/:id/leave`                      | Leave the room. Triggers host transfer or room close if needed. |
| `GET /api/rooms/:id/members`                     | List active members. |
| `DELETE /api/rooms/:id/members/:userId`          | Kick a member (host or admin). |

**Create room request body:**
```json
{
  "name": "Physics Study Hall",
  "description": "Final exam prep",
  "visibility": "PUBLIC",          // or "PRIVATE"
  "password": null,                 // or a string >= 4 chars
  "maxParticipants": 10
}
```

**Room response shape (returned by create / get / join):**
```json
{
  "id": "...",
  "name": "...",
  "description": "...",
  "hostId": "...",
  "visibility": "PUBLIC",
  "hasPassword": false,
  "maxParticipants": 10,
  "memberCount": 2,
  "createdAt": "2026-05-25T10:00:00.000Z",
  "members": [
    { "userId": "...", "username": "alice", "isHost": true,  "joinedAt": "..." },
    { "userId": "...", "username": "bob",   "isHost": false, "joinedAt": "..." }
  ]
}
```

## Rooms Socket.IO events

The REST API owns persistence; sockets own live presence. After a successful `POST /api/rooms/:id/join`, clients should immediately subscribe to start receiving live events for that room:

```js
socket.emit('room:subscribe', roomId, (res) => {
  if (!res.ok) console.error('subscribe failed:', res.error);
});

socket.emit('room:unsubscribe', roomId, (res) => { /* ... */ });
```

The server fans out the following events to subscribers in the `room:${roomId}` channel:

| Event                | Payload                                                 | When                                |
| -------------------- | ------------------------------------------------------- | ----------------------------------- |
| `room:user_joined`   | `{ roomId, member: { userId, username, isHost, joinedAt } }` | New (not returning) member joined.  |
| `room:user_left`     | `{ roomId, userId }`                                    | A member left or was kicked.        |
| `room:user_kicked`   | `{ roomId, userId }`                                    | Emitted alongside `user_left` for kicks. |
| `room:room_updated`  | `{ room: RoomSummary }`                                 | Host updated room settings.         |
| `room:host_changed`  | `{ roomId, newHostId, oldHostId }`                      | Host left and a new one was promoted. |
| `room:room_deleted`  | `{ roomId }`                                            | Room was deleted (host action or last-leave). After emit, subscribers are detached from the channel. |

## Timer (Pomodoro Sync Engine)

The timer is **socket-only** — there are no REST endpoints because every command must propagate to all participants with minimum latency. All commands take `(roomId, ack?)` and the ack receives `{ ok, state?, error? }`:

| Event from client      | Arguments                  | Authz                | Effect                                                                  |
| ---------------------- | -------------------------- | -------------------- | ----------------------------------------------------------------------- |
| `timer:get_state`      | `roomId`                   | active member        | Returns current state (lazy-creates IDLE/WORK state on first access).   |
| `timer:start`          | `roomId`                   | host / admin         | IDLE/PAUSED → RUNNING.                                                  |
| `timer:pause`          | `roomId`                   | host / admin         | RUNNING → PAUSED. Accumulates elapsed time.                             |
| `timer:resume`         | `roomId`                   | host / admin         | PAUSED → RUNNING. Recomputes remaining and re-schedules expiration.     |
| `timer:reset`          | `roomId`                   | host / admin         | Current phase → IDLE with elapsed=0. No FocusStat written.              |
| `timer:skip`           | `roomId`                   | host / admin         | Ends current phase early. Advances to next. No FocusStat written.       |
| `timer:configure`      | `roomId, patch`            | host / admin         | Updates per-room config (durations, cycle count, autoAdvance).          |

The server broadcasts on the `room:${roomId}` channel (same channel used by the rooms module):

| Event from server     | Payload                                | When                                                              |
| --------------------- | -------------------------------------- | ----------------------------------------------------------------- |
| `timer:state_changed` | `{ state: TimerState }`                | Every transition: start, pause, resume, reset, skip, configure, and natural advance. |
| `timer:phase_completed` | `{ roomId, completedPhase }`         | Fired alongside state_changed when a phase ends (natural or skip), useful for chimes / toasts. |

**TimerState shape:**
```ts
{
  roomId: string,
  status: 'IDLE' | 'RUNNING' | 'PAUSED',
  phase: 'WORK' | 'SHORT_BREAK' | 'LONG_BREAK',
  phaseStartedAt: number | null,   // epoch ms, null when not RUNNING
  pausedAt: number | null,         // epoch ms, set only in PAUSED
  accumulatedMs: number,           // elapsed before the current run
  phaseDurationMs: number,         // duration of the current phase
  completedWorkCycles: number,     // WORK phases since last LONG_BREAK
  config: {
    workDurationMs, shortBreakDurationMs, longBreakDurationMs,
    cyclesBeforeLongBreak, autoAdvance
  }
}
```

**Client-side rendering** — never poll the server. Compute display locally:
```ts
const elapsed = state.status === 'RUNNING'
  ? state.accumulatedMs + (Date.now() - state.phaseStartedAt)
  : state.status === 'PAUSED'
    ? state.accumulatedMs
    : 0;
const remaining = state.phaseDurationMs - elapsed;
```
Update the UI on each animation frame; let `timer:state_changed` correct any drift.

**FocusStats** are written only when a WORK phase ends naturally (the scheduler fires; not on skip / reset). One row per active member at the moment of completion. Aggregate via `IFocusStatRepository.totalsForUser(userId)` to surface "total focus time" and "completed work sessions" stats (the consuming module/UI is out of scope for this slice).

## Chat (Real-Time Chat)

Hybrid surface: socket for sends, REST for history and moderation deletes.

### Socket events

| Event from client    | Payload                                  | Authz             | Effect                                                                          |
| -------------------- | ---------------------------------------- | ----------------- | ------------------------------------------------------------------------------- |
| `chat:send_message`  | `{ roomId, content }` + `ack`            | active member / admin | Persists the message, broadcasts to `room:${roomId}` (sender included). Ack carries the full DTO. |

| Event from server      | Payload                                          | When                                  |
| ---------------------- | ------------------------------------------------ | ------------------------------------- |
| `chat:new_message`     | `{ message: ChatMessageDTO }`                    | A new message was sent.               |
| `chat:message_deleted` | `{ roomId, messageId, deletedByUserId }`         | A message was soft-deleted (REST).    |

### REST endpoints

| Method & path                                           | Purpose                                                  |
| ------------------------------------------------------- | -------------------------------------------------------- |
| `GET /api/rooms/:roomId/messages?before=<id>&limit=<n>` | Paginated history, newest-first cursor. Member-only.     |
| `DELETE /api/messages/:id`                              | Soft-delete a message (author or SYSTEM_ADMIN).          |

History response:
```json
{
  "messages": [
    { "id": "...", "roomId": "...", "authorId": "...", "authorUsername": "alice",
      "content": "let's start!", "isDeleted": false, "deletedByUserId": null,
      "createdAt": "2026-05-25T10:00:00.000Z" }
  ],
  "hasMore": true,
  "nextCursor": "msg_..."
}
```

Messages within a page are ordered **ascending** (oldest → newest) so a client can append them directly to the bottom of the chat pane. To load older history (scrolling up), pass the previous response's `nextCursor` back as the `before` query parameter.

### Moderation contract

Deletion is **soft** — the row remains in the database with `isDeleted = true`, `deletedAt`, and `deletedById`. The API redacts the content (`content: ""`) for deleted rows, regardless of requester, so the original text never leaks back through the public surface. UIs compare `deletedByUserId` against `authorId` to distinguish self-deletion from moderator action.

## Media Sync (host-controlled YouTube playback)

Socket-only, like the timer. All commands take payload objects and ack with `{ ok, state?, error? }`.

### Socket events

| Event from client | Payload                              | Authz             | Effect                                                                  |
| ----------------- | ------------------------------------ | ----------------- | ----------------------------------------------------------------------- |
| `media:get_state` | `{ roomId }`                         | active member     | Returns the current `MediaState`.                                       |
| `media:load`      | `{ roomId, url, startAtMs? }`        | host / admin      | Sets the active video. URL must be a recognised YouTube link.           |
| `media:unload`    | `{ roomId }`                         | host / admin      | Clears the active video; state returns to IDLE.                         |
| `media:play`      | `{ roomId }`                         | host / admin      | PAUSED → PLAYING. Idempotent if already PLAYING.                        |
| `media:pause`     | `{ roomId }`                         | host / admin      | PLAYING → PAUSED. Records accumulated position.                         |
| `media:seek`      | `{ roomId, positionMs }`             | host / admin      | Jumps to a position (works in PAUSED and PLAYING).                      |

| Event from server     | Payload                  | When                                                              |
| --------------------- | ------------------------ | ----------------------------------------------------------------- |
| `media:state_changed` | `{ state: MediaState }`  | Every transition: load, play, pause, seek, unload.                |

### MediaState shape
```ts
{
  roomId: string,
  status: 'IDLE' | 'PAUSED' | 'PLAYING',
  videoUrl: string | null,         // original URL the host pasted
  videoId: string | null,          // 11-char YouTube id (use this in iframes)
  playbackPositionMs: number,
  positionUpdatedAt: number | null, // epoch ms, set while PLAYING
  loadedByUserId: string | null,
  loadedAt: number | null
}
```

### Client-side rendering — never poll the server

```ts
const position = state.status === 'PLAYING'
  ? state.playbackPositionMs + (Date.now() - state.positionUpdatedAt)
  : state.playbackPositionMs;

// Use videoId to mount a YouTube iframe:
//   `https://www.youtube.com/embed/${state.videoId}?start=${Math.floor(position/1000)}`
// On every `media:state_changed`, seek the iframe to the new position
// and call play() / pauseVideo() to match `state.status`.
```

The server only emits on state transitions. Clients that drift can periodically re-seek themselves to the computed expected position, or call `media:get_state` after reconnect.

### Supported URL forms (parsed by `extractYouTubeVideoId`)
- `https://www.youtube.com/watch?v=ID`
- `https://youtu.be/ID`
- `https://www.youtube.com/embed/ID`
- `https://www.youtube.com/v/ID`
- `https://www.youtube.com/shorts/ID`

Extra query parameters (e.g. `&t=42s`) are tolerated — only the 11-character video id is extracted. Non-YouTube URLs reject with `MEDIA_INVALID_URL`. Adding another provider is a matter of introducing a `provider` field on `MediaState` plus a parser dispatch.

## Admin Moderation

All endpoints require `Authorization: Bearer <accessToken>` from a `SYSTEM_ADMIN` user. Route-level `requireRole(SYSTEM_ADMIN)` enforces this, and `AdminService` re-checks internally as defence-in-depth.

| Method & path                                  | Purpose                                                                    |
| ---------------------------------------------- | -------------------------------------------------------------------------- |
| `GET /api/admin/users?page=&pageSize=&search=&bannedOnly=true` | Paginated user listing (max 100 per page). Includes email since admins need it. |
| `POST /api/admin/users/:userId/ban`            | Body: `{ "reason"?: string }`. Idempotent. Triggers ban cascade.            |
| `POST /api/admin/users/:userId/unban`          | Body: `{ "reason"?: string }`. Idempotent.                                  |
| `GET /api/admin/users/:userId/bans?limit=50`   | Ban + unban history for one user, newest first.                            |

**Ban response (POST `/ban`):**
```json
{
  "user":   { "id": "...", "email": "...", "username": "...", "role": "STANDARD", "isBanned": true, "createdAt": "..." },
  "record": { "id": "...", "userId": "...", "adminId": "...", "action": "BAN", "reason": "spam", "createdAt": "..." }
}
```
`record` is `null` if the call was an idempotent no-op (user was already in the requested state).

### What "ban" actually does

In one transaction:
1. `User.isBanned` is set to `true`.
2. A `BanRecord` (action=`BAN`) is written.

Then, as best-effort side-effects:
3. Any active room membership the user has is closed (`status=KICKED`) through `RoomService.removeMemberByAdmin`. If the user was the host of that room, the standard host-transfer / room-close logic from §3.2.2 fires automatically. Subscribers receive `room:user_kicked`, `room:user_left`, and (if applicable) `room:host_changed` or `room:room_deleted`.
4. All of the user's open Socket.IO connections are forcibly disconnected via the `user:${userId}` channel they joined on connect.

A room-removal or socket-termination failure does **not** roll back the ban — the user is banned in the database and will be evicted on their next reconnect / refresh-token call regardless.

### Rules

- An admin cannot ban themselves (`CANNOT_BAN_SELF`).
- An admin cannot ban another `SYSTEM_ADMIN` (`CANNOT_BAN_ADMIN`). This prevents an internal coup; a super-admin tier could relax it later.
- All operations are idempotent at the state level: a second ban (or unban) call on a user already in that state returns the current user state with `record: null` and skips side-effects.

## Design notes worth flagging for review

- **`requireAuth` deliberately skips the DB lookup.** Per DSD §3.5.5 we accept a 15-minute staleness window for bans on the REST path in exchange for hot-path latency. Bans take effect immediately on the next refresh-token call and on the next Socket connection.
- **Timing-safe login.** A dummy bcrypt comparison runs when the email is not found, so response time alone cannot distinguish "unknown email" from "wrong password".
- **Two JWT secrets, two token types.** Access and refresh tokens are signed with separate secrets *and* carry a `type` claim, so leaking the access secret cannot forge refresh tokens, and an access token cannot be presented to the refresh endpoint.
- **Repository interface.** `AuthService` and `RoomService` depend on `IUserRepository` / `IRoomRepository`, not Prisma. This is what lets the `*.service.test.ts` files run with no database, and it is the seam at which other persistence concerns (e.g. Redis-backed ban list) can later be inserted.
- **Email normalisation.** Stored and queried lower-cased everywhere; Zod transforms input before it reaches the service.
- **Room create is atomic.** Creating a room and the host's initial membership happen inside a single Prisma `$transaction` so there is no window where a hostless room exists.
- **REST vs. socket separation in Rooms.** Joining/leaving is REST (persistent membership in `room_memberships`). Live event delivery is socket subscription. A user can be a member while temporarily offline; reconnecting and re-subscribing picks up the current room state via `GET /api/rooms/:id`.
- **Host transfer is automatic and deterministic.** When the host leaves, the most-senior active member (lowest `joinedAt`) is promoted. If the host is the last member, the room is closed and `room:room_deleted` is emitted before the row is removed.
- **Pluggable event publisher.** `IRoomEventPublisher` lets `RoomService` run with a `RecordingRoomEventPublisher` in tests (asserts events without booting Socket.IO) and `SocketRoomEventPublisher` in production.
- **Server-authoritative timer with no per-second ticks.** State carries absolute timestamps, so clients compute remaining time locally and the server only emits on transitions. This keeps Socket.IO load O(transitions), not O(rooms × seconds).
- **In-memory timer state is intentional.** The DSD permits this — focus credit (FocusStat) is the durable artifact. Process restart resets all live timers to IDLE; if horizontal scaling becomes a requirement, a Redis-backed `ITimerStore` slots in behind the existing interface without touching the service.
- **Pluggable scheduler.** Tests use a `ManualScheduler` that exposes `fire(roomId)` instead of relying on Jest fake timers. State-machine transitions are verified deterministically without time-based flakiness.
- **Room lifecycle hooks.** `RoomService.addLifecycleListener` lets other modules (currently only the timer) react to deletes. This is the seam to use when chat/media need similar cleanup, instead of growing direct service dependencies.
- **Chat is socket-for-sends, REST-for-history.** A new message must propagate to the whole room with minimum latency, so `chat:send_message` is socket-driven and the server broadcasts on the same `room:${roomId}` channel. History (cold load, infinite scroll) goes through REST with keyset pagination — stable across concurrent inserts and trivial to cache later.
- **Soft delete + content redaction.** Deletion preserves the audit trail (`isDeleted`, `deletedAt`, `deletedById`) but the API never returns the original text again. This is the moderation contract — `DELETE /api/messages/:id` is one-way as far as the public surface is concerned.
- **Sender echo with id-based reconciliation.** The sender receives `chat:new_message` like everyone else AND gets the persisted DTO in the ack. Clients with an optimistic UI match on message id to dedupe. This trades a single duplicate-event check on the client for a much simpler server publisher (no per-broadcast socket exclusion).
- **Transactional ban/unban.** `User.isBanned` and the `BanRecord` audit row are written inside a single `prisma.$transaction`, so the live ban flag and history can never disagree. The repository returns `null` from `applyBan` when the user is already banned, which gives the service a race-free idempotency check.
- **Per-user Socket.IO channel.** Every authenticated socket joins `user:${userId}` on connect. This lets the admin module disconnect all sessions for one user with a single `io.in(channel).disconnectSockets()` call, instead of iterating connected sockets. The channel doubles as the natural fan-out for any future user-targeted events (notifications, profile updates).
- **Interface segregation for cross-module calls.** `AdminService` depends on the small `IRoomMemberRemover` interface, not on the full `RoomService`. `RoomService` happens to implement it. This keeps `admin.service.test.ts` runnable against a recording mock and makes the dependency direction explicit at the type level.
- **Best-effort cascades, atomic ban.** The DB ban transaction is the only thing that must succeed; room removal and socket termination are best-effort, logged on failure. A banned user with a stale membership row will heal on their next reconnect (auth rejects) or when the room is next touched.
- **Media sync follows the timer's playbook.** Same in-memory store + injectable `Clock` + event-only fan-out. The server is authoritative for *what's loaded* and *where playback is anchored*; the YouTube iframe is authoritative for *actual rendering*. Clients compute expected position from `playbackPositionMs + (now - positionUpdatedAt)` and self-correct on drift, which keeps Socket.IO load O(transitions) regardless of viewer count or video length.

## Status

Every component from DSD §3.2 is implemented:

```
✓ §3.2.1  Authentication & Authorization
✓ §3.2.2  Room Management
✓ §3.2.3  Pomodoro Sync Engine
✓ §3.2.4  Real-Time Chat
✓ §3.2.5  Media Sync
✓ §3.2.6  Admin Moderation
```

Full entity model from §3.4.1 is present (`User`, `Room`, `RoomMembership`, `FocusStat`, `ChatMessage`, `BanRecord`). Every service has a unit-test file running against in-memory repositories — around 105 test cases across the suite. Repository pattern (§3.5.8) is consistent across all modules. Security decisions from §3.5.5 (bcrypt cost 10, 15-min JWT TTL, dual-secret refresh tokens, live ban recheck on socket reconnect, immediate session termination on ban) are in place.
