import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import type { Leaderboard, LeaderboardPeriod, MyStats } from '../lib/types';

type Tab = 'personal' | 'leaderboard';

export function StatsPage() {
  const [tab, setTab] = useState<Tab>('personal');

  return (
    <div className="max-w-5xl mx-auto">
      <header className="mb-6">
        <div className="eyebrow">Reading record</div>
        <h1 className="headline-serif text-5xl sm:text-6xl font-black mt-1">
          The <span className="font-italic italic font-normal">silence</span> we've held
        </h1>
        <p className="font-italic italic text-ink-soft mt-2 max-w-2xl">
          A ledger of focus. Your own pages, and a register of the most disciplined readers in the hall.
        </p>
      </header>
      <div className="rule-double mb-6" />

      <nav className="flex gap-5 font-mono text-xs uppercase tracking-[0.2em] mb-8">
        {(['personal', 'leaderboard'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              tab === t
                ? 'text-ink border-b border-ink pb-0.5'
                : 'text-ink-muted hover:text-ink'
            }
          >
            {t === 'personal' ? 'Your record' : 'The hall'}
          </button>
        ))}
      </nav>

      {tab === 'personal' ? <PersonalView /> : <LeaderboardView />}
    </div>
  );
}

// ============================================================ Personal view

function PersonalView() {
  const user = useAuth((s) => s.user)!;
  const [stats, setStats] = useState<MyStats | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.get<MyStats>('/stats/me');
        if (!cancelled) setStats(r.data);
      } catch (e) {
        if (!cancelled) setErr(errorMessage(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="font-italic italic text-ink-muted">Counting your hours…</div>;
  if (err) return <div className="text-focus-deep font-italic italic">{err}</div>;
  if (!stats) return null;

  const totalHours = stats.totals.totalFocusMs / 3_600_000;
  const todayMs = stats.byDay[stats.byDay.length - 1]?.focusMs ?? 0;

  return (
    <>
      <section className="mb-8">
        <div className="eyebrow">{user.username}'s focus</div>
        <div className="mt-3 font-display text-7xl sm:text-8xl font-black tabular text-focus leading-none">
          {totalHours.toFixed(1)}<span className="text-ink-muted text-3xl font-italic italic font-normal ml-2">hours</span>
        </div>
      </section>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-5 mb-12">
        <Stat label="Today" value={formatHours(todayMs)} unit="h" />
        <Stat label="Sessions" value={String(stats.totals.completedWorkSessions)} />
        <Stat label="Rooms visited" value={String(stats.totals.distinctRooms)} />
        <Stat label="Avg session" value={avgSessionMinutes(stats)} unit="min" />
      </section>

      <section className="mb-12">
        <div className="eyebrow">§ 1 · This past week</div>
        <h2 className="font-display text-2xl mt-1 mb-4">The shape of your focus</h2>
        <WeekChart data={stats.byDay} />
      </section>

      <section>
        <div className="eyebrow">§ 2 · Latest sessions</div>
        <h2 className="font-display text-2xl mt-1 mb-4">A history</h2>
        {stats.recent.length === 0 ? (
          <div className="font-italic italic text-ink-muted">No completed sessions yet. Start a Pomodoro in a room.</div>
        ) : (
          <div className="divide-y divide-ink/15 border-t border-b border-ink/20">
            {stats.recent.map((s, i) => (
              <div key={s.endedAt + i} className="grid grid-cols-[40px_120px_1fr_120px] gap-4 items-baseline py-3">
                <div className="font-mono text-xs text-ink-muted tabular">№{String(i + 1).padStart(2, '0')}</div>
                <div className="font-display text-sm">{phaseLabel(s.phase)}</div>
                <div className="font-mono text-xs text-ink-muted">
                  {new Date(s.endedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                </div>
                <div className="justify-self-end font-mono text-sm tabular text-ink">
                  {(s.durationMs / 60000).toFixed(0)}m
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

// ========================================================= Leaderboard view

function LeaderboardView() {
  const user = useAuth((s) => s.user)!;
  const [period, setPeriod] = useState<LeaderboardPeriod>('all');
  const [data, setData] = useState<Leaderboard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const r = await api.get<Leaderboard>('/stats/leaderboard', { params: { period } });
        if (!cancelled) setData(r.data);
      } catch (e) {
        if (!cancelled) setErr(errorMessage(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [period]);

  const maxMs = useMemo(
    () => Math.max(1, ...(data?.rows.map((r) => r.totalFocusMs) ?? [])),
    [data],
  );

  return (
    <>
      <div className="flex items-baseline justify-between mb-5">
        <div>
          <div className="eyebrow">Most disciplined readers</div>
          <h2 className="font-display text-3xl mt-1">The register</h2>
        </div>
        <div className="flex gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em]">
          {(['all', 'month', 'week'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={
                'px-3 py-1.5 border ' +
                (period === p
                  ? 'border-ink bg-ink text-paper'
                  : 'border-ink/30 text-ink-muted hover:text-ink hover:border-ink/60')
              }
            >
              {p === 'all' ? 'all time' : p === 'month' ? '30 days' : '7 days'}
            </button>
          ))}
        </div>
      </div>
      <div className="rule-double mb-5" />

      {err && <div className="text-focus-deep font-italic italic mb-3">{err}</div>}
      {loading ? (
        <div className="font-italic italic text-ink-muted">Tallying the ledger…</div>
      ) : !data || data.rows.length === 0 ? (
        <div className="card-paper p-10 text-center">
          <div className="font-italic italic text-xl mb-1">No entries yet.</div>
          <p className="text-ink-muted text-sm">Be the first to put pages in this period.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {data.rows.map((row) => {
            const isMe = row.userId === user.id;
            const widthPct = (row.totalFocusMs / maxMs) * 100;
            return (
              <div
                key={row.userId}
                className={
                  'relative overflow-hidden border ' +
                  (isMe ? 'border-focus bg-focus/5' : 'border-ink/15 bg-paper-light')
                }
              >
                {/* bar fill behind the row */}
                <div
                  className={'absolute inset-y-0 left-0 ' + (isMe ? 'bg-focus/15' : 'bg-ink/5')}
                  style={{ width: `${widthPct}%` }}
                />
                <div className="relative grid grid-cols-[60px_1fr_auto_auto] gap-4 items-baseline px-4 py-3">
                  <div className={
                    'font-display text-2xl tabular ' +
                    (row.rank <= 3 ? 'text-focus' : 'text-ink-muted')
                  }>
                    {medal(row.rank)}{row.rank}
                  </div>
                  <div>
                    <div className={'font-display text-lg ' + (isMe ? 'text-focus' : 'text-ink')}>
                      {row.username}
                      {isMe && <span className="text-ink-muted font-italic italic text-xs font-normal"> · you</span>}
                    </div>
                    <div className="font-mono text-[10px] tracking-widest text-ink-muted uppercase tabular">
                      {row.sessions} session{row.sessions === 1 ? '' : 's'}
                    </div>
                  </div>
                  <div className="font-mono tabular text-sm text-ink-muted">
                    {formatHoursMinutes(row.totalFocusMs)}
                  </div>
                  <div className="font-display text-xl tabular text-ink min-w-[60px] text-right">
                    {(row.totalFocusMs / 3_600_000).toFixed(1)}<span className="text-ink-muted text-xs font-italic italic font-normal ml-1">h</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-6 text-xs font-italic italic text-ink-muted">
        Only completed WORK sessions count. Time spent on breaks does not appear on this register.
      </p>
    </>
  );
}

function medal(rank: number): string {
  if (rank === 1) return '🥇 ';
  if (rank === 2) return '🥈 ';
  if (rank === 3) return '🥉 ';
  return '';
}

// =============================================================== shared bits

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="border-t border-ink pt-2">
      <div className="eyebrow">{label}</div>
      <div className="font-display text-3xl font-medium mt-1 tabular">
        {value}
        {unit && <span className="text-ink-muted text-base font-italic italic font-normal ml-1.5">{unit}</span>}
      </div>
    </div>
  );
}

function WeekChart({ data }: { data: { date: string; focusMs: number; sessions: number }[] }) {
  const max = useMemo(() => Math.max(1, ...data.map((d) => d.focusMs)), [data]);
  return (
    <div className="card-paper p-5">
      <div className="flex items-end gap-3 h-48">
        {data.map((d) => {
          const pct = (d.focusMs / max) * 100;
          const heightPx = Math.max(2, Math.round((pct * 175) / 100));
          return (
            <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full group">
              <div
                className={
                  'w-full rounded-t-sm transition-colors ' +
                  (d.focusMs > 0 ? 'bg-focus group-hover:bg-focus-deep' : 'bg-ink/10')
                }
                style={{ height: `${heightPx}px` }}
                title={`${(d.focusMs / 60000).toFixed(0)} min · ${d.sessions} session${d.sessions === 1 ? '' : 's'}`}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-3 mt-2">
        {data.map((d) => (
          <div key={d.date + 'l'} className="flex-1 text-center font-mono text-[10px] text-ink-muted tabular tracking-widest">
            {weekdayLabel(d.date)}
          </div>
        ))}
      </div>
    </div>
  );
}

function weekdayLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString([], { weekday: 'short' }).toUpperCase().slice(0, 3);
}

function formatHours(ms: number): string {
  return (ms / 3_600_000).toFixed(1);
}

function formatHoursMinutes(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

function avgSessionMinutes(stats: MyStats): string {
  if (stats.totals.completedWorkSessions === 0) return '—';
  const avgMs = stats.totals.totalFocusMs / stats.totals.completedWorkSessions;
  return (avgMs / 60000).toFixed(0);
}

function phaseLabel(phase: 'WORK' | 'SHORT_BREAK' | 'LONG_BREAK'): string {
  return phase === 'WORK' ? 'Deep work' : phase === 'SHORT_BREAK' ? 'Short rest' : 'Long rest';
}
