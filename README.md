# SYNCFLOW

A browser-based synchronised study application built around the Pomodoro technique. Users join shared **study rooms** with a host-controlled timer, real-time text chat, host-curated YouTube playback, and voice chat (via Agora). Built for **CSE3044 Software Engineering Term Project**.

| Repo               | Stack                                            | Status                                       |
| ------------------ | ------------------------------------------------ | -------------------------------------------- |
| `syncflow-backend` | Node 20 · TypeScript · Express · Socket.IO v4 · Prisma · PostgreSQL 16 | All DSD components implemented; 124 unit tests passing across 6 modules |
| `syncflow-frontend`| React 19 · TypeScript · Vite · Tailwind · Zustand · React Router | Auth, lobby (with tags), room (timer / chat / media / voice), focus-stats dashboard, leaderboard, admin |

**Features beyond the original DSD:** Agora voice chat, FocusStat dashboard, global leaderboard, phase-transition chime + toasts, room tags with filter, ban-with-reason flow, lobby-side single-active-room enforcement.

See [SYNCFLOW_DSD.pdf](syncflow-backend/SYNCFLOW_DSD.pdf) for the formal design specification.

---

## Quick start

You need **Docker Desktop** and **Node.js 20+** installed.

### 1. Start Postgres (one-time per machine boot)

```powershell
cd syncflow-backend
docker compose up -d db
```

The Postgres container listens on **`localhost:5433`** (not 5432, to avoid colliding with native Windows Postgres installs). Data persists in the `pgdata` Docker volume.

### 2. Configure environment

```powershell
cd syncflow-backend
cp .env.example .env
```

Open `.env` and fill in:

- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` — generate with:
  ```powershell
  node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
  ```
  (run twice, paste each output)
- `AGORA_APP_ID` and `AGORA_APP_CERTIFICATE` — optional. Voice chat works without them in dev (App ID auth mode) or can be left empty to skip voice entirely.

### 3. Start the backend

```powershell
cd syncflow-backend
npm install
npx prisma generate
npx prisma db push          # apply schema to the fresh database
npx prisma db seed          # populate demo data — see "Seeded accounts" below
npm run dev                 # http://localhost:3000
```

`npx prisma db seed` inserts 5 demo accounts, 3 rooms (one per tag), sample chat messages, and ~165 historical focus-stat rows so the dashboard and leaderboard have content on first launch. See [DEMO_CREDENTIALS.md](DEMO_CREDENTIALS.md) for the login details.

### 4. Start the frontend (separate terminal)

```powershell
cd syncflow-frontend
npm install
npm run dev                 # http://localhost:5173
```

Vite proxies `/api` and `/socket.io` to the backend on `:3000`, so you only ever open `http://localhost:5173` in the browser.

### Daily workflow after first setup

Once installed, you only need three commands per session:

```powershell
docker compose up -d db      # if not already running (only once per Windows boot)

# Terminal 1
cd syncflow-backend && npm run dev

# Terminal 2
cd syncflow-frontend && npm run dev
```

`npx prisma db seed` is a one-time step. Run it again only if you wipe the database or want to refresh demo data.

### Stop everything

```powershell
# Ctrl+C in both `npm run dev` terminals, then:
cd syncflow-backend
docker compose down         # keeps your data
# docker compose down -v    # wipes the database
```

---

## Layout

```
SyncFlow first try/
├── syncflow-backend/        Node + Express + Socket.IO + Prisma
│   ├── prisma/
│   │   ├── schema.prisma    Entity model (User, Room, RoomTag, ChatMessage, …)
│   │   └── seed.ts          Demo data populator (edit names/rooms freely)
│   ├── src/
│   │   ├── modules/         auth, rooms, timer, chat, media, voice, stats, admin
│   │   ├── repositories/    Prisma-backed implementations behind interfaces
│   │   ├── shared/          jwt, password, prisma client, errors, clock
│   │   └── server.ts        composition root
│   ├── docker-compose.yml   Postgres 16 (+ optional full-stack app container)
│   └── README.md            detailed backend docs (HTTP API, socket events, …)
├── syncflow-frontend/       React + Vite + Tailwind
│   ├── src/
│   │   ├── pages/           AuthPage, LobbyPage, RoomPage, StatsPage, AdminPage
│   │   ├── components/      Shell + ToastHost + room/{Timer,Chat,Media,Voice,Participants}
│   │   ├── hooks/           useAgoraVoice, useRoomTicker
│   │   ├── lib/             api, socket, auth-store, toast, chime, types, format
│   │   └── App.tsx          router
│   └── README.md            frontend stack / aesthetic notes
├── DEMO_CREDENTIALS.md      Seeded demo login info
└── README.md                this file
```

---

## Default ports

| Service        | Port  | Notes                                                   |
| -------------- | ----- | ------------------------------------------------------- |
| Frontend (Vite)| 5173  | Open this in your browser                               |
| Backend (Node) | 3000  | REST `/api` + Socket.IO `/socket.io`                    |
| Postgres       | 5433  | Docker; native Postgres on 5432 is intentionally avoided |

---

## Troubleshooting

**"Authentication failed against database server"** — Postgres is reachable but rejecting credentials. Almost always means you have a *different* Postgres on 5432 and your `DATABASE_URL` is pointing there instead of the Docker container on 5433. Check with `Get-Service *postgres*`.

**"Cannot find module '@rolldown/...'"** — Vite ≥ 8 requires Node ≥ 20.19. We pin Vite 5 in `package.json`; if you've manually upgraded, downgrade back.

**`EADDRINUSE :::3000`** — a previous `npm run dev` didn't exit cleanly. Free it with:
```powershell
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

**Empty lobby on first login** — you skipped step 3's `npx prisma db seed`. Run it now (the backend can stay running; the seed just inserts rows).

**Voice chat says "Agora is not configured on the server"** — `AGORA_APP_ID` is missing from `.env`. The rest of the app works without it; voice is the only affected feature.

---

## Authors

- Ali Hamza Çetin — 150122013
- Faruk Emre Yüksek — 150123019
- Uğur Aydoğan — 150124827
- Buğrahan Dutucu — 150124830
