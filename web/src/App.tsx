import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { AuthPage } from './features/auth/AuthPage';
import { LobbyPage } from './features/matchmaking/LobbyPage';
import { GamePage } from './features/game/GamePage';
import { ProfilePage } from './features/profile/ProfilePage';

function Nav() {
  const { me, logout } = useAuth();
  return (
    <nav className="flex items-center justify-between border-b border-slate-800 px-6 py-3">
      <Link to="/" className="text-lg font-bold">
        ♞ Chess
      </Link>
      <div className="flex items-center gap-4 text-sm">
        {me ? (
          <>
            <Link to="/" className="hover:text-emerald-400">
              Play
            </Link>
            <Link to="/profile" className="hover:text-emerald-400">
              {me.username}
            </Link>
            <button onClick={logout} className="text-slate-400 hover:text-slate-200">
              Logout
            </button>
          </>
        ) : (
          <Link to="/auth" className="hover:text-emerald-400">
            Log in
          </Link>
        )}
      </div>
    </nav>
  );
}

function Protected({ children }: { children: JSX.Element }) {
  const { me, loading } = useAuth();
  if (loading) return <div className="p-8">Loading…</div>;
  return me ? children : <Navigate to="/auth" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Nav />
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route
            path="/"
            element={
              <Protected>
                <LobbyPage />
              </Protected>
            }
          />
          <Route
            path="/profile"
            element={
              <Protected>
                <ProfilePage />
              </Protected>
            }
          />
          {/* Game route is public so anyone can spectate. */}
          <Route path="/game/:id" element={<GamePage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
