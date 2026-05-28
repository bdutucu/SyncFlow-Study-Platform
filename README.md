# SYNCFLOW

A browser-based synchronised study application built around the Pomodoro technique. Users join shared **study rooms** with a host-controlled timer, real-time text chat, host-curated YouTube playback, and voice chat (via Agora). Built for **CSE3044 Software Engineering Term Project**.

| Repo               | Stack                                            | Status                                       |
| ------------------ | ------------------------------------------------ | -------------------------------------------- |
| `syncflow-backend` | Node 20 · TypeScript · Express · Socket.IO v4 · Prisma · PostgreSQL 16 | All 6 DSD components implemented + 80%+ unit-test coverage |
| `syncflow-frontend`| React 19 · TypeScript · Vite · Tailwind · Zustand · React Router | Full app: auth, lobby, room (timer / chat / media), admin |

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

### 2. Start the backend

```powershell
cd syncflow-backend
npm install
npx prisma generate
npx prisma migrate dev      # first time only, or after schema changes
npm run dev                 # http://localhost:3000
```

If `.env` doesn't exist yet, copy `.env.example` and fill in the two JWT secrets:

```powershell
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"   # paste twice into .env
```

### 3. Start the frontend (separate terminal)

```powershell
cd syncflow-frontend
npm install
npm run dev                 # http://localhost:5173
```

Vite proxies `/api` and `/socket.io` to the backend on `:3000`, so you only ever open `http://localhost:5173` in the browser.

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
│   ├── prisma/              schema + migrations
│   ├── src/
│   │   ├── modules/         auth, rooms, timer, chat, media, voice, admin
│   │   ├── repositories/    Prisma-backed implementations behind interfaces
│   │   ├── shared/          jwt, password, prisma client, errors, clock
│   │   └── server.ts        composition root
│   ├── docker-compose.yml   Postgres 16 (+ optional full-stack app container)
│   └── README.md            detailed backend docs (HTTP API, socket events, …)
├── syncflow-frontend/       React + Vite + Tailwind
│   ├── src/
│   │   ├── pages/           AuthPage, LobbyPage, RoomPage, AdminPage
│   │   ├── components/      Shell + room/{Timer,Chat,Media,Participants}
│   │   ├── lib/             api (axios), socket, auth-store, types, format
│   │   └── App.tsx          router
│   └── README.md            frontend stack / aesthetic notes
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

---

## Authors

- Ali Hamza Çetin — 150122013
- Faruk Emre Yüksek — 150123019
- Uğur Aydoğan — 150124827
- Buğrahan Dutucu — 150124830
