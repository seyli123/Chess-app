import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';

export function AuthPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      if (mode === 'login') await login(username, password);
      else await register(email, username, password);
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="mx-auto mt-16 max-w-sm rounded bg-slate-800 p-6">
      <h1 className="mb-4 text-2xl font-bold">{mode === 'login' ? 'Log in' : 'Sign up'}</h1>
      <form onSubmit={submit} className="space-y-3">
        {mode === 'register' && (
          <input
            className="w-full rounded bg-slate-700 px-3 py-2"
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        )}
        <input
          className="w-full rounded bg-slate-700 px-3 py-2"
          placeholder={mode === 'login' ? 'Username or email' : 'Username'}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          className="w-full rounded bg-slate-700 px-3 py-2"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className="w-full rounded bg-emerald-600 py-2 font-semibold hover:bg-emerald-500">
          {mode === 'login' ? 'Log in' : 'Create account'}
        </button>
      </form>
      <button
        className="mt-4 text-sm text-slate-400 hover:text-slate-200"
        onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
      >
        {mode === 'login' ? 'Need an account? Sign up' : 'Have an account? Log in'}
      </button>
    </div>
  );
}
