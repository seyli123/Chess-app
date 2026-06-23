import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { AuthPage } from './features/auth/AuthPage';
import { LobbyPage } from './features/matchmaking/LobbyPage';
import { GamePage } from './features/game/GamePage';
import { ProfilePage } from './features/profile/ProfilePage';
import { TournamentsPage } from './features/tournament/TournamentsPage';
import { TournamentPage } from './features/tournament/TournamentPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { WalletPage } from './features/wallet/WalletPage';

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
            <Link to="/tournaments" className="hover:text-emerald-400">
              Tournaments
            </Link>
            <Link
              to="/wallet"
              className="rounded bg-slate-800 px-2 py-1 font-medium text-amber-300 hover:bg-slate-700"
              title="Wallet"
            >
              💰 {me.balance.toLocaleString()}
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
        <Link
          to="/settings"
          title="Settings"
          aria-label="Settings"
          className="text-lg text-slate-400 hover:text-emerald-400"
        >
          ⚙
        </Link>
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
          <Route
            path="/tournaments"
            element={
              <Protected>
                <TournamentsPage />
              </Protected>
            }
          />
          {/* Tournament detail is public so anyone can follow standings. */}
          <Route path="/tournaments/:id" element={<TournamentPage />} />
          {/* Settings are client-side prefs — available to everyone. */}
          <Route path="/settings" element={<SettingsPage />} />
          <Route
            path="/wallet"
            element={
              <Protected>
                <WalletPage />
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
