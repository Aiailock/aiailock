import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';

export default function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    setSubmitting(false);
    if (signInError) {
      // Being an owner-only login, we deliberately keep this generic —
      // no "user not found" vs "wrong password" distinction.
      setError('Неверный email или пароль.');
      return;
    }
    navigate('/admin', { replace: true });
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 font-sans">
      <h1 className="mb-6 font-serif text-2xl text-burgundy">Вход в админку</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-md border border-ink/20 px-3 py-2 text-sm"
          autoComplete="username"
        />
        <input
          type="password"
          required
          placeholder="Пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-md border border-ink/20 px-3 py-2 text-sm"
          autoComplete="current-password"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="mt-2 rounded-md bg-burgundy px-3 py-2 text-sm text-cream disabled:opacity-50"
        >
          {submitting ? 'Входим…' : 'Войти'}
        </button>
      </form>
    </div>
  );
}
