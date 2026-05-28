# SYNCFLOW Frontend

React + TypeScript + Vite + Tailwind. Speaks to the backend at `http://localhost:3000` via the Vite dev proxy (`/api` and `/socket.io`).

## Run

```bash
npm install
npm run dev    # http://localhost:5173
```

The backend must be running on port 3000 for the proxy to reach it.

## Stack

- **React 19** + **TypeScript** + **Vite**
- **Tailwind v3** (custom *Library Study Hall* theme — parchment palette, Fraunces / Instrument Serif / JetBrains Mono)
- **React Router v6** — `/auth`, `/lobby`, `/rooms/:roomId`, `/admin`
- **Zustand** (`persist`) for the auth/token store
- **Axios** with auto-refresh interceptor
- **socket.io-client** singleton with bearer-auth handshake

## Layout

```
src/
  lib/            api, auth-store, socket, types, format
  hooks/          useRoomTicker
  components/
    Shell.tsx           masthead + nav
    room/
      TimerPanel        live Pomodoro w/ host controls + config
      ChatPanel         255-char whispers, redacted-on-delete
      MediaPanel        YouTube embed, host playback control
      ParticipantList   members, host badge, admin kick
  pages/
    AuthPage      editorial split-screen login/register
    LobbyPage     room listings + create-room form
    RoomPage      orchestrates panels + sockets + room:resync
    AdminPage     rooms + users moderation
```

## Wire protocol covered

| Channel | Events |
|---|---|
| `room:*` | `subscribe`, `unsubscribe`, `resync`, `user_joined`, `user_left`, `user_kicked`, `host_changed`, `room_deleted` |
| `timer:*` | `get_state`, `start`, `pause`, `resume`, `reset`, `skip`, `configure`, `state_changed` |
| `media:*` | `get_state`, `load`, `play`, `pause`, `seek`, `unload`, `state_changed` |
| `chat:*` | `send_message`, `new_message`, `message_deleted` |
