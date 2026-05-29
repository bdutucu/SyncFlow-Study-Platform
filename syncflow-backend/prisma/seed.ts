/**
 * SYNCFLOW seed script.
 *
 * Populates a fresh database with a tiny but believable demo dataset:
 *   • One system administrator + four standard users.
 *   • Three rooms, one per tag (STUDY / CHAT / WATCH_PARTY).
 *   • Active memberships so two of the rooms appear "in session".
 *   • A handful of chat messages per populated room.
 *   • Seven days of fake WORK FocusStats per user, so the personal
 *     dashboard chart and the global leaderboard both have content.
 *
 * Run with:
 *   npx prisma db seed
 *
 * Or implicitly after a fresh database setup:
 *   docker compose up -d db
 *   npx prisma db push      # apply schema
 *   npx prisma db seed      # this file
 *
 * Properties:
 *   • Idempotent — uses upsert on stable seed IDs ("seed-*") so running
 *     the script twice does not create duplicates.
 *   • Non-destructive — never deletes rows the script didn't insert,
 *     so your real data and the seed data coexist peacefully.
 *   • Configurable without code changes — edit the USERS, ROOMS, and
 *     MESSAGES tables below. The script reads from them at runtime.
 *
 * Default password for every seeded account is `demo1234`. Change
 * SEED_PASSWORD here or set the SEED_PASSWORD env var to override.
 */
import { PrismaClient, RoomTag, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'demo1234';
const BCRYPT_COST = Number(process.env.BCRYPT_COST ?? 10);

// ──────────────────────────────────────────────────────────── EDIT ME ─

/**
 * Seed users. Edit names / emails freely; keep `id` stable so re-runs
 * upsert the same row instead of inserting a new one. The first STUDY
 * room's host is USERS[1] (alice in the default set) — if you rename
 * that user, the room still works because we resolve by index, not name.
 */
const USERS = [
  { id: 'seed-user-admin',  email: 'admin@syncflow.demo', username: 'admin', role: UserRole.SYSTEM_ADMIN },
  { id: 'seed-user-alice',  email: 'alice@syncflow.demo', username: 'alice', role: UserRole.STANDARD },
  { id: 'seed-user-bob',    email: 'bob@syncflow.demo',   username: 'bob',   role: UserRole.STANDARD },
  { id: 'seed-user-carol',  email: 'carol@syncflow.demo', username: 'carol', role: UserRole.STANDARD },
  { id: 'seed-user-dave',   email: 'dave@syncflow.demo',  username: 'dave',  role: UserRole.STANDARD },
] as const;

/**
 * Seed rooms. `hostIndex` and `memberIndexes` reference USERS by index
 * (0 = admin, 1 = alice, …). This means you can rename users above
 * without touching any room data.
 */
const ROOMS = [
  {
    id: 'seed-room-physics',
    name: 'Physics finals — quiet hours',
    description: 'Quantum mechanics review. Headphones encouraged.',
    tag: RoomTag.STUDY,
    hostIndex: 1,                  // alice
    memberIndexes: [1, 2],         // alice, bob
    maxParticipants: 20,
  },
  {
    id: 'seed-room-lounge',
    name: 'After-class lounge',
    description: 'Just chatting between sessions.',
    tag: RoomTag.CHAT,
    hostIndex: 2,                  // bob
    memberIndexes: [2, 3],         // bob, carol
    maxParticipants: 15,
  },
  {
    id: 'seed-room-cinema',
    name: 'Friday night cinema',
    description: 'Watching a classic together. Sync the play button.',
    tag: RoomTag.WATCH_PARTY,
    hostIndex: 3,                  // carol
    memberIndexes: [],             // empty — invite-only feel
    maxParticipants: 10,
  },
] as const;

/**
 * Seed chat messages. `roomIndex` references ROOMS, `authorIndex`
 * references USERS. Messages are written newest-first by `minutesAgo`.
 */
const MESSAGES = [
  // Physics
  { roomIndex: 0, authorIndex: 1, content: 'Welcome — first pomodoro starts at the top of the hour.',  minutesAgo: 45 },
  { roomIndex: 0, authorIndex: 2, content: 'Anyone got the lecture notes from week 7?',                minutesAgo: 42 },
  { roomIndex: 0, authorIndex: 1, content: 'On the shared drive — link is in the room description.',  minutesAgo: 41 },
  { roomIndex: 0, authorIndex: 2, content: 'Found it, thanks.',                                        minutesAgo: 40 },
  { roomIndex: 0, authorIndex: 1, content: 'Heads up — I am calling the break early today.',           minutesAgo: 14 },

  // Lounge
  { roomIndex: 1, authorIndex: 2, content: 'How was the midterm?',                                      minutesAgo: 20 },
  { roomIndex: 1, authorIndex: 3, content: 'Brutal. The last question alone was 30%.',                  minutesAgo: 18 },
  { roomIndex: 1, authorIndex: 2, content: 'Same. Need a long break before I touch the textbook again.', minutesAgo: 17 },
] as const;

// ──────────────────────────────────────────────────────────── /EDIT ──

async function main() {
  // eslint-disable-next-line no-console
  console.log('Hashing seed password (this takes a moment)…');
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, BCRYPT_COST);

  // 1. Users ─────────────────────────────────────────────────────────
  const users = await Promise.all(
    USERS.map((u) =>
      prisma.user.upsert({
        where: { id: u.id },
        update: { email: u.email, username: u.username, role: u.role },
        create: {
          id: u.id,
          email: u.email,
          username: u.username,
          passwordHash,
          role: u.role,
        },
      }),
    ),
  );
  // eslint-disable-next-line no-console
  console.log(`✓ ${users.length} users upserted`);

  // 2. Rooms ─────────────────────────────────────────────────────────
  for (const r of ROOMS) {
    await prisma.room.upsert({
      where: { id: r.id },
      update: {
        name: r.name,
        description: r.description,
        tag: r.tag,
        hostId: users[r.hostIndex].id,
        maxParticipants: r.maxParticipants,
      },
      create: {
        id: r.id,
        name: r.name,
        description: r.description,
        hostId: users[r.hostIndex].id,
        visibility: 'PUBLIC',
        tag: r.tag,
        maxParticipants: r.maxParticipants,
      },
    });
  }
  // eslint-disable-next-line no-console
  console.log(`✓ ${ROOMS.length} rooms upserted`);

  // 3. Memberships ───────────────────────────────────────────────────
  for (const r of ROOMS) {
    for (const idx of r.memberIndexes) {
      await prisma.roomMembership.upsert({
        where: {
          userId_roomId: { userId: users[idx].id, roomId: r.id },
        },
        update: { status: 'ACTIVE', leftAt: null },
        create: { userId: users[idx].id, roomId: r.id, status: 'ACTIVE' },
      });
    }
  }
  // eslint-disable-next-line no-console
  console.log('✓ memberships upserted');

  // 4. Chat messages ─────────────────────────────────────────────────
  //
  // We delete and re-insert the seed messages on every run so editing
  // the MESSAGES table is round-trippable. Real chat (created by
  // running users) is never touched because we scope the delete to
  // seed room ids AND seed user ids.
  await prisma.chatMessage.deleteMany({
    where: {
      roomId: { in: ROOMS.map((r) => r.id) },
      authorId: { in: users.map((u) => u.id) },
    },
  });
  await prisma.chatMessage.createMany({
    data: MESSAGES.map((m) => ({
      roomId: ROOMS[m.roomIndex].id,
      authorId: users[m.authorIndex].id,
      content: m.content,
      createdAt: new Date(Date.now() - m.minutesAgo * 60_000),
    })),
  });
  // eslint-disable-next-line no-console
  console.log(`✓ ${MESSAGES.length} chat messages inserted`);

  // 5. FocusStats — last 7 days of WORK sessions per user ────────────
  //
  // Same scope-and-replace strategy: clear the seed rows, write fresh
  // ones. The amount per day is deterministic per user index so the
  // leaderboard ordering is reproducible.
  await prisma.focusStat.deleteMany({
    where: {
      userId: { in: users.map((u) => u.id) },
      roomId: { in: ROOMS.map((r) => r.id) },
    },
  });
  const focusRows: Array<{
    userId: string;
    roomId: string;
    phase: 'WORK';
    durationMs: number;
    startedAt: Date;
    endedAt: Date;
  }> = [];
  const WORK_MS = 25 * 60 * 1000;
  for (let userIdx = 0; userIdx < users.length; userIdx++) {
    const user = users[userIdx];
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      // Deterministic count: more recent users get more sessions, so
      // alice tops the all-time leaderboard.
      const sessions = Math.max(0, 8 - userIdx - Math.floor(dayOffset / 2));
      for (let s = 0; s < sessions; s++) {
        const endedAt = new Date(
          Date.now() - dayOffset * 86_400_000 - s * 45 * 60_000,
        );
        focusRows.push({
          userId: user.id,
          roomId: ROOMS[s % ROOMS.length].id,
          phase: 'WORK',
          durationMs: WORK_MS,
          startedAt: new Date(endedAt.getTime() - WORK_MS),
          endedAt,
        });
      }
    }
  }
  if (focusRows.length > 0) {
    await prisma.focusStat.createMany({ data: focusRows });
  }
  // eslint-disable-next-line no-console
  console.log(`✓ ${focusRows.length} focus stats inserted`);

  // eslint-disable-next-line no-console
  console.log(`\nSeed complete. Try logging in with:`);
  // eslint-disable-next-line no-console
  console.log(`   admin@syncflow.demo / ${SEED_PASSWORD}     (admin)`);
  // eslint-disable-next-line no-console
  console.log(`   alice@syncflow.demo / ${SEED_PASSWORD}     (user)\n`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
