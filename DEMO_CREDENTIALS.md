# Demo Credentials

Login details for the data inserted by `npx prisma db seed`.

All seeded accounts share the same password: **`demo1234`** (override via the `SEED_PASSWORD` environment variable before seeding if you want a different one).

## Accounts

| Email                  | Username | Role         | Notes                                       |
| ---------------------- | -------- | ------------ | ------------------------------------------- |
| `admin@syncflow.demo`  | admin    | SYSTEM_ADMIN | Use this for the moderation panel (`/admin`) |
| `alice@syncflow.demo`  | alice    | STANDARD     | Tops the global leaderboard. Hosts the *Physics finals* room |
| `bob@syncflow.demo`    | bob      | STANDARD     | Second on the leaderboard. Hosts the *After-class lounge*    |
| `carol@syncflow.demo`  | carol    | STANDARD     | Hosts the *Friday night cinema* watch party. Mid-leaderboard |
| `dave@syncflow.demo`   | dave     | STANDARD     | Quiet user. Demonstrates a sparse personal record            |

## What's pre-populated

Running `npx prisma db seed` inserts:

- **5 users** (above)
- **3 rooms**, one per tag — *Study*, *Chat*, *Watch party*
- **Active memberships** so two rooms appear "in session" on the lobby
- **8 chat messages** spread across the populated rooms
- **~165 historical FocusStat rows** over the last 7 days so the personal dashboard chart and the global leaderboard render meaningfully on first load

The data is deterministic — re-running the seed produces the same leaderboard order. Real accounts created via the registration form coexist; the seed is scoped to its own row IDs (`seed-user-*`, `seed-room-*`) and never touches user-generated content.

## Suggested demo flow

1. **Lobby** — log in as `admin@syncflow.demo` to see the populated room listings with tag pills and filter chips. Switch between tag filters.

2. **Room interactions** — log in as `alice@syncflow.demo` in one browser, `bob@syncflow.demo` in another (incognito). Both join *Physics finals*. Alice (host) starts the Pomodoro timer; both browsers see it tick in sync.

3. **Chat + voice** — type a message in one window; the other receives it instantly. Click *Join voice* in both — they hear each other (requires `AGORA_APP_ID` and `AGORA_APP_CERTIFICATE` in `.env`).

4. **Stats** — click **Record** → **Your record** to see Alice's chart, then **The hall** to see the leaderboard. Switch period chips (all-time / 30 days / 7 days).

5. **Moderation** — switch back to the admin browser. Open `/admin` → ban Bob with a reason. Bob's session is force-disconnected; he's bounced to `/auth?banned=1` and sees the ban reason. Unban him.

6. **Force-close** — admin closes the *After-class lounge* room. Any active members are alerted and redirected to the lobby.

## Resetting

If you want to wipe the database and start fresh:

```powershell
cd syncflow-backend
docker compose down -v   # destroys the pgdata volume
docker compose up -d db
npx prisma db push
npx prisma db seed
```

To refresh only the seed data (keeping user-created data intact), just re-run `npx prisma db seed`.

## Changing the seeded names / emails

Open `syncflow-backend/prisma/seed.ts`. The three editable tables at the top (`USERS`, `ROOMS`, `MESSAGES`) are documented in-place. After editing, re-run `npx prisma db seed`; rows are upserted by stable IDs so the data updates rather than duplicating.
