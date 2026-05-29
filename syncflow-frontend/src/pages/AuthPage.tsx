import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import type { AuthResult } from '../lib/types';

type Mode = 'login' | 'register';

export function AuthPage() {
  const [params, setParams] = useSearchParams();
  const bannedNotice = params.get('banned') === '1';
  const bannedReason = params.get('reason');

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const setSession = useAuth((s) => s.setSession);
  const nav = useNavigate();

  const dismissBanned = () => {
    const next = new URLSearchParams(params);
    next.delete('banned');
    next.delete('reason');
    setParams(next, { replace: true });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const body = mode === 'login' ? { email, password } : { email, username, password };
      const res = await api.post<AuthResult>(`/auth/${mode}`, body);
      setSession(res.data.user, res.data.tokens);
      nav('/lobby');
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-full grid lg:grid-cols-[1.2fr_1fr] gap-0">
      {/* LEFT — editorial cover */}
      <section className="relative px-8 sm:px-16 py-12 lg:py-20 border-r border-ink/20 overflow-hidden">
        <div className="flex items-baseline justify-between">
          <span className="eyebrow">Issue №01</span>
          <span className="eyebrow">
            {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
        </div>
        <div className="rule-double my-6" />

        <h1 className="headline-serif text-[14vw] sm:text-[10vw] lg:text-[7.5vw] font-black animate-rise">
          Study
          <span className="font-italic italic font-normal block text-focus" style={{ animationDelay: '120ms' }}>
            together,
          </span>
          <span className="block animate-rise" style={{ animationDelay: '220ms' }}>apart.</span>
        </h1>

        <p className="mt-10 max-w-md text-base sm:text-lg leading-relaxed text-ink-soft font-italic italic animate-rise" style={{ animationDelay: '350ms' }}>
          A quiet room with a clock on the wall, a chalkboard for messages, and a window
          you can all stare out of at the same time.
        </p>

        <div className="mt-12 grid grid-cols-3 gap-6 max-w-lg animate-rise" style={{ animationDelay: '450ms' }}>
          <Stat label="Cycles" value="25 / 5" />
          <Stat label="Channel" value="Live" />
          <Stat label="Listeners" value="∞" />
        </div>

        <div className="absolute bottom-8 left-8 right-8 flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.22em] text-ink-muted">
          <span>The Pomodoro Press</span>
          <span>— continued overleaf —</span>
        </div>
      </section>

      {/* RIGHT — form */}
      <section className="px-8 sm:px-14 py-12 lg:py-20 flex items-center">
        <div className="w-full max-w-sm mx-auto">
          {bannedNotice && (
            <div className="mb-6 border-l-4 border-focus bg-focus/10 pl-4 pr-3 py-3 relative animate-rise">
              <button
                onClick={dismissBanned}
                className="absolute top-2 right-2 eyebrow hover:text-ink"
                aria-label="dismiss"
              >
                ×
              </button>
              <div className="eyebrow text-focus-deep mb-1">Account banned</div>
              <div className="font-italic italic text-ink-soft text-sm leading-snug">
                You have been removed from the platform by a moderator.
              </div>
              {bannedReason && (
                <div className="mt-2 text-sm">
                  <span className="eyebrow">Reason · </span>
                  <span className="text-ink">{bannedReason}</span>
                </div>
              )}
            </div>
          )}
          <div className="flex items-baseline justify-between">
            <span className="eyebrow">{mode === 'login' ? 'Sign in' : 'Create account'}</span>
            <button
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
              className="eyebrow underline-offset-4 hover:underline text-ink"
            >
              {mode === 'login' ? 'New here? →' : '← Have account'}
            </button>
          </div>

          <h2 className="mt-3 font-display text-4xl font-medium leading-tight">
            {mode === 'login' ? (
              <>Take your <span className="font-italic italic font-normal">usual</span> seat.</>
            ) : (
              <>Pull up a <span className="font-italic italic font-normal">chair</span>.</>
            )}
          </h2>

          <form onSubmit={submit} className="mt-10 space-y-6">
            <div>
              <label className="label-num block mb-1">01 · Email</label>
              <input
                type="email"
                required
                className="field"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>

            {mode === 'register' && (
              <div>
                <label className="label-num block mb-1">02 · Username</label>
                <input
                  type="text"
                  required
                  className="field"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                />
              </div>
            )}

            <div>
              <label className="label-num block mb-1">
                {mode === 'register' ? '03' : '02'} · Password
              </label>
              <input
                type="password"
                required
                minLength={8}
                className="field"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </div>

            {err && (
              <div className="border-l-2 border-focus pl-3 py-1 text-sm text-focus-deep font-italic italic">
                {err}
              </div>
            )}

            <button type="submit" disabled={busy} className="btn-ink w-full disabled:opacity-50">
              {busy ? 'Just a moment…' : mode === 'login' ? 'Enter the hall' : 'Reserve a seat'}
            </button>
          </form>

          <div className="mt-10 text-xs text-ink-muted">
            By continuing you accept the silence of fellow readers and the authority of the clock.
          </div>

          <div className="mt-12 flex items-center gap-3 text-[10px] font-mono uppercase tracking-[0.22em] text-ink-muted">
            <span>↩</span>
            <Link to="/" className="hover:text-ink">return to cover</Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-ink pt-2">
      <div className="eyebrow">{label}</div>
      <div className="font-display text-xl font-medium mt-1">{value}</div>
    </div>
  );
}
