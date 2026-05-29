import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth-store';
import { AuthPage } from './pages/AuthPage';
import { LobbyPage } from './pages/LobbyPage';
import { RoomPage } from './pages/RoomPage';
import { AdminPage } from './pages/AdminPage';
import { StatsPage } from './pages/StatsPage';
import { Shell } from './components/Shell';

function Protected({ children }: { children: React.ReactNode }) {
  const user = useAuth((s) => s.user);
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const user = useAuth((s) => s.user);
  if (!user) return <Navigate to="/auth" replace />;
  if (user.role !== 'SYSTEM_ADMIN') return <Navigate to="/lobby" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route
        path="/lobby"
        element={
          <Protected>
            <Shell>
              <LobbyPage />
            </Shell>
          </Protected>
        }
      />
      <Route
        path="/rooms/:roomId"
        element={
          <Protected>
            <Shell>
              <RoomPage />
            </Shell>
          </Protected>
        }
      />
      <Route
        path="/me"
        element={
          <Protected>
            <Shell>
              <StatsPage />
            </Shell>
          </Protected>
        }
      />
      <Route
        path="/admin"
        element={
          <AdminOnly>
            <Shell>
              <AdminPage />
            </Shell>
          </AdminOnly>
        }
      />
      <Route path="*" element={<Navigate to="/lobby" replace />} />
    </Routes>
  );
}
