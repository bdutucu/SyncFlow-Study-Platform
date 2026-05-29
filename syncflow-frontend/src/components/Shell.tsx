import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from '../lib/auth-store';
import { connectSocket, disconnectSocket } from '../lib/socket';
import { ToastHost } from './ToastHost';

export function Shell({ children }: { children: React.ReactNode }) {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    if (user) connectSocket();
    return () => {
      // keep the socket alive across page changes within the shell
    };
  }, [user]);

  const handleLogout = () => {
    disconnectSocket();
    logout();
    nav('/auth');
  };

  const isAdminRoute = loc.pathname.startsWith('/admin');
  const today = new Date();
  const dateLabel = today
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
    .toUpperCase();

  return (
    <div className="min-h-full flex flex-col">
      {/* Top masthead — newspaper-style */}
      <header className="px-6 sm:px-10 pt-6 pb-3 border-b border-ink/20">
        <div className="flex items-baseline justify-between gap-6">
          <Link to="/lobby" className="group">
            <div className="flex items-baseline gap-3">
              <span className="font-display font-black text-2xl sm:text-3xl tracking-tightest leading-none">
                SYNCFLOW
              </span>
              <span className="font-italic italic text-ink-muted text-sm hidden sm:inline">
                a synchronised study hall
              </span>
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-6 text-[10px] uppercase tracking-[0.22em] font-mono text-ink-muted">
            <span>{dateLabel}</span>
            <span className="rule h-px w-8 border-t border-ink-muted" />
            <span>VOL. I · NO. 01</span>
          </div>

          {user && (
            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <div className="font-display text-sm leading-tight">{user.username}</div>
                <div className="eyebrow">{user.role === 'SYSTEM_ADMIN' ? 'editor' : 'reader'}</div>
              </div>
              <button onClick={handleLogout} className="btn-ghost btn-sm">Sign out</button>
            </div>
          )}
        </div>

        {user && (
          <nav className="mt-3 flex items-center gap-5 text-xs font-mono uppercase tracking-[0.18em]">
            <NavTab to="/lobby" active={loc.pathname.startsWith('/lobby')}>Lobby</NavTab>
            <NavTab to="/lobby" active={loc.pathname.startsWith('/rooms')}>Rooms</NavTab>
            <NavTab to="/me" active={loc.pathname.startsWith('/me')}>Record</NavTab>
            {user.role === 'SYSTEM_ADMIN' && (
              <NavTab to="/admin" active={isAdminRoute}>Moderation</NavTab>
            )}
          </nav>
        )}
      </header>

      <main className="flex-1 px-6 sm:px-10 py-8">{children}</main>

      <footer className="px-6 sm:px-10 py-4 border-t border-ink/15 text-[10px] font-mono uppercase tracking-[0.22em] text-ink-muted flex justify-between">
        <span>© SYNCFLOW · CSE3044 Term Project</span>
        <span>Set in Fraunces &amp; JetBrains Mono</span>
      </footer>
      <ToastHost />
    </div>
  );
}

function NavTab({
  to,
  active,
  children,
}: {
  to: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className={
        active
          ? 'text-ink border-b border-ink pb-0.5'
          : 'text-ink-muted hover:text-ink transition-colors'
      }
    >
      {children}
    </Link>
  );
}
