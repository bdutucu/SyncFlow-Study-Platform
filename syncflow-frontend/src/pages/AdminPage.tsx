import { useEffect, useState } from 'react';
import { api, errorMessage } from '../lib/api';
import type { AdminUser, PagedAdminUsers, PagedRooms, RoomSummary } from '../lib/types';
import { Link } from 'react-router-dom';

type Tab = 'rooms' | 'users';

export function AdminPage() {
  const [tab, setTab] = useState<Tab>('rooms');

  return (
    <div className="max-w-6xl mx-auto">
      <header className="mb-6">
        <div className="eyebrow">Editorial desk</div>
        <h1 className="headline-serif text-5xl sm:text-6xl font-black mt-1">Moderation</h1>
        <p className="font-italic italic text-ink-soft mt-2 max-w-2xl">
          Look after the hall. Close noisy rooms, escort disruptive readers to the door.
        </p>
      </header>
      <div className="rule-double mb-6" />

      <nav className="flex gap-5 font-mono text-xs uppercase tracking-[0.2em] mb-6">
        {(['rooms', 'users'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              tab === t
                ? 'text-ink border-b border-ink pb-0.5'
                : 'text-ink-muted hover:text-ink'
            }
          >
            {t}
          </button>
        ))}
      </nav>

      {tab === 'rooms' ? <RoomsTab /> : <UsersTab />}
    </div>
  );
}

function RoomsTab() {
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await api.get<PagedRooms>('/rooms', { params: { pageSize: 100 } });
      setRooms(r.data.items);
    } catch (e) { setErr(errorMessage(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, []);

  const close = async (id: string) => {
    if (!confirm('Force-close this room?')) return;
    try {
      await api.delete(`/rooms/${id}`);
      void refresh();
    } catch (e) { setErr(errorMessage(e)); }
  };

  if (loading) return <div className="font-italic italic text-ink-muted">Auditing…</div>;
  if (err) return <div className="text-focus-deep font-italic italic">{err}</div>;

  return (
    <>
      <div className="flex justify-end mb-3">
        <button onClick={() => void refresh()} className="btn-ghost btn-sm">refresh</button>
      </div>
      {rooms.length === 0 ? (
        <div className="font-italic italic text-ink-muted">No active rooms.</div>
      ) : (
        <div className="divide-y divide-ink/15 border-t border-b border-ink/20">
          {rooms.map((r, i) => (
            <div key={r.id} className="grid grid-cols-[40px_1fr_100px_140px] gap-4 items-baseline py-4">
              <div className="font-mono text-xs text-ink-muted tabular">№{String(i + 1).padStart(2, '0')}</div>
              <div>
                <Link to={`/rooms/${r.id}`} className="font-display text-lg hover:text-focus">{r.name}</Link>
                <div className="font-mono text-[10px] text-ink-muted mt-0.5">{r.id}</div>
              </div>
              <div className="font-mono text-sm tabular">
                {r.memberCount}<span className="text-ink-muted">/{r.maxParticipants}</span>
              </div>
              <div className="justify-self-end">
                <button onClick={() => void close(r.id)} className="btn-focus btn-sm">close</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [bannedOnly, setBannedOnly] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await api.get<PagedAdminUsers>('/admin/users', {
        params: { pageSize: 100, search: search || undefined, bannedOnly },
      });
      setUsers(r.data.items);
    } catch (e) { setErr(errorMessage(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, [bannedOnly]);

  const ban = async (id: string, banned: boolean) => {
    const reason = window.prompt(banned ? 'Unban reason (optional):' : 'Ban reason (optional):') ?? '';
    try {
      await api.post(`/admin/users/${id}/${banned ? 'unban' : 'ban'}`, { reason: reason || null });
      void refresh();
    } catch (e) { setErr(errorMessage(e)); }
  };

  return (
    <>
      <form
        onSubmit={(e) => { e.preventDefault(); void refresh(); }}
        className="flex flex-wrap items-end gap-4 mb-4"
      >
        <div className="flex-1 min-w-[200px]">
          <label className="label-num">Search</label>
          <input
            className="field"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="email or username…"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={bannedOnly} onChange={(e) => setBannedOnly(e.target.checked)} className="accent-ink" />
          banned only
        </label>
        <button className="btn-ink btn-sm">search</button>
      </form>

      {err && <div className="text-focus-deep font-italic italic mb-3">{err}</div>}
      {loading ? (
        <div className="font-italic italic text-ink-muted">Looking through the registry…</div>
      ) : users.length === 0 ? (
        <div className="font-italic italic text-ink-muted">No matches.</div>
      ) : (
        <div className="divide-y divide-ink/15 border-t border-b border-ink/20">
          {users.map((u, i) => (
            <div key={u.id} className="grid grid-cols-[40px_1fr_1fr_100px_110px] gap-4 items-baseline py-3">
              <div className="font-mono text-xs text-ink-muted tabular">№{String(i + 1).padStart(2, '0')}</div>
              <div>
                <div className="font-display text-base">{u.username}</div>
                {u.isBanned && <span className="eyebrow text-focus">banned</span>}
              </div>
              <div className="font-mono text-xs text-ink-muted">{u.email}</div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">{u.role.toLowerCase()}</div>
              <div className="justify-self-end">
                {u.role === 'SYSTEM_ADMIN' ? (
                  <span className="eyebrow">—</span>
                ) : u.isBanned ? (
                  <button onClick={() => void ban(u.id, true)} className="btn-rest btn-sm">unban</button>
                ) : (
                  <button onClick={() => void ban(u.id, false)} className="btn-focus btn-sm">ban</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
