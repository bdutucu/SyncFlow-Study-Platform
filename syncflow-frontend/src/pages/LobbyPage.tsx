import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../lib/api';
import type { PagedRooms, RoomDetails, RoomSummary } from '../lib/types';
import { useAuth } from '../lib/auth-store';

export function LobbyPage() {
  const user = useAuth((s) => s.user)!;
  const nav = useNavigate();
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await api.get<PagedRooms>('/rooms', { params: { pageSize: 50 } });
      setRooms(r.data.items);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  // Create-room form state
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>('PUBLIC');
  const [password, setPassword] = useState('');
  const [maxParticipants, setMaxParticipants] = useState(10);
  const [creating, setCreating] = useState(false);

  const createRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || null,
        visibility,
        maxParticipants,
      };
      if (password.trim()) body.password = password;
      const r = await api.post<RoomDetails>('/rooms', body);
      nav(`/rooms/${r.data.id}`);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setCreating(false);
    }
  };

  const joinRoom = async (roomId: string, hasPassword: boolean) => {
    setErr(null);
    try {
      let pw: string | undefined;
      if (hasPassword) {
        const v = window.prompt('This room is locked. Enter password:');
        if (!v) return;
        pw = v;
      }
      await api.post(`/rooms/${roomId}/join`, pw ? { password: pw } : {});
      nav(`/rooms/${roomId}`);
    } catch (e) {
      setErr(errorMessage(e));
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* HERO */}
      <section className="grid lg:grid-cols-[1.4fr_1fr] gap-10 mb-12 animate-rise">
        <div>
          <div className="eyebrow mb-3">Today's edition · The Reading Hall</div>
          <h1 className="headline-serif text-5xl sm:text-6xl lg:text-7xl font-black">
            Good {greeting()}, <span className="font-italic italic font-normal">{user.username}</span>.
          </h1>
          <p className="mt-6 text-ink-soft max-w-xl text-lg leading-relaxed">
            The lamps are lit, the chairs are arranged. Take a free table below — or
            <button onClick={() => setShowCreate((s) => !s)} className="ml-1 underline underline-offset-4 text-ink hover:text-focus">
              host one of your own
            </button>.
          </p>
        </div>

        <aside className="border-l border-ink/20 pl-8 hidden lg:block">
          <div className="eyebrow mb-2">House rules</div>
          <ol className="font-italic italic text-ink-soft space-y-1.5 text-[15px] leading-snug">
            <li>01 · The host owns the clock.</li>
            <li>02 · Whispers ≤ 255 letters.</li>
            <li>03 · One room at a time.</li>
            <li>04 · Disruption invites moderation.</li>
          </ol>
        </aside>
      </section>

      {/* CREATE PANEL */}
      {showCreate && (
        <section className="card-paper p-6 mb-10 animate-rise">
          <div className="flex items-baseline justify-between mb-5">
            <h2 className="font-display text-2xl">Open a new room</h2>
            <button onClick={() => setShowCreate(false)} className="eyebrow hover:text-ink">close ×</button>
          </div>
          <form onSubmit={createRoom} className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
            <div className="sm:col-span-2">
              <label className="label-num">01 · Name</label>
              <input required maxLength={64} className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Monday morning Pomodoro" />
            </div>
            <div className="sm:col-span-2">
              <label className="label-num">02 · Description (optional)</label>
              <input maxLength={200} className="field" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="One quiet line about the table" />
            </div>
            <div>
              <label className="label-num">03 · Visibility</label>
              <div className="mt-2 flex gap-3">
                {(['PUBLIC', 'PRIVATE'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setVisibility(v)}
                    className={
                      'btn btn-sm ' +
                      (visibility === v ? 'btn-ink' : 'btn-ghost')
                    }
                  >
                    {v.toLowerCase()}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label-num">04 · Seats</label>
              <input
                type="number"
                min={2}
                max={50}
                className="field"
                value={maxParticipants}
                onChange={(e) => setMaxParticipants(Number(e.target.value))}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label-num">05 · Password (optional)</label>
              <input
                type="password"
                className="field"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="leave blank for an unlocked room"
              />
            </div>
            <div className="sm:col-span-2 flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowCreate(false)} className="btn-ghost">Cancel</button>
              <button type="submit" disabled={creating} className="btn-focus disabled:opacity-50">
                {creating ? 'Opening…' : 'Open the doors'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* SECTION TITLE */}
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <div className="eyebrow">§ 1 · Listings</div>
          <h2 className="font-display text-3xl mt-1">Rooms in session</h2>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => void refresh()} className="btn-ghost btn-sm">refresh</button>
          {!showCreate && (
            <button onClick={() => setShowCreate(true)} className="btn-ink btn-sm">+ Host room</button>
          )}
        </div>
      </div>
      <div className="rule-double mb-6" />

      {err && (
        <div className="border-l-2 border-focus pl-3 py-1 text-sm text-focus-deep font-italic italic mb-4">
          {err}
        </div>
      )}

      {/* ROOM LISTINGS */}
      {loading ? (
        <div className="text-ink-muted font-italic italic">Looking through the registry…</div>
      ) : rooms.length === 0 ? (
        <EmptyState onCreate={() => setShowCreate(true)} />
      ) : (
        <div className="divide-y divide-ink/15 border-t border-b border-ink/20">
          {rooms.map((r, i) => (
            <RoomRow key={r.id} room={r} index={i + 1} onJoin={() => void joinRoom(r.id, r.hasPassword)} />
          ))}
        </div>
      )}

      {/* DIRECT JOIN BY ID */}
      <DirectJoin onJoin={(id) => void joinRoom(id, false)} />
    </div>
  );
}

function RoomRow({
  room,
  index,
  onJoin,
}: {
  room: RoomSummary;
  index: number;
  onJoin: () => void;
}) {
  const full = room.memberCount >= room.maxParticipants;
  return (
    <div className="grid grid-cols-[40px_1fr_auto] sm:grid-cols-[60px_1fr_140px_120px] gap-4 items-baseline py-5 group hover:bg-paper-dark/40 transition-colors px-2 -mx-2">
      <div className="font-mono text-xs text-ink-muted tabular">№{String(index).padStart(2, '0')}</div>
      <div>
        <div className="flex items-baseline gap-3 flex-wrap">
          <Link to={`/rooms/${room.id}`} className="font-display text-xl group-hover:text-focus transition-colors">
            {room.name}
          </Link>
          {room.hasPassword && <span className="eyebrow">🔒 locked</span>}
          {room.visibility === 'PRIVATE' && <span className="eyebrow">private</span>}
        </div>
        {room.description && (
          <p className="font-italic italic text-ink-soft mt-1 text-sm max-w-2xl">{room.description}</p>
        )}
      </div>
      <div className="hidden sm:block">
        <div className="eyebrow">Occupancy</div>
        <div className="font-mono tabular text-sm mt-1">
          {room.memberCount}<span className="text-ink-muted"> / {room.maxParticipants}</span>
        </div>
      </div>
      <div className="justify-self-end">
        <button
          disabled={full}
          onClick={onJoin}
          className={full ? 'btn-ghost btn-sm opacity-40' : 'btn-ink btn-sm'}
        >
          {full ? 'full' : 'enter →'}
        </button>
      </div>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="card-paper p-12 text-center">
      <div className="font-italic italic text-2xl mb-2">The hall is quiet.</div>
      <p className="text-ink-muted mb-6">Be the first to open a room today.</p>
      <button onClick={onCreate} className="btn-focus">Host a room</button>
    </div>
  );
}

function DirectJoin({ onJoin }: { onJoin: (id: string) => void }) {
  const [id, setId] = useState('');
  return (
    <section className="mt-12 pt-8 border-t border-ink/20">
      <div className="eyebrow">§ 2 · Direct entry</div>
      <h3 className="font-display text-2xl mt-1 mb-4">
        Have a <span className="font-italic italic font-normal">room number</span>?
      </h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (id.trim()) onJoin(id.trim());
        }}
        className="flex gap-3 max-w-md"
      >
        <input
          className="field flex-1"
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="paste room id"
        />
        <button type="submit" className="btn-ink">Enter</button>
      </form>
    </section>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'evening';
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}
