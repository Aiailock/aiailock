import { useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';

// Client-side gate for UX only (redirect to /admin/login). The REAL security
// boundary is server-side: Supabase RLS policies (`is_admin()`, see
// supabase/migrations/0002_auth_owner.sql) reject every admin-table query
// and every admin storage object for anyone who isn't the owner, regardless
// of what the client does. So even if this component were bypassed, no data
// would leak.
export default function RequireAdmin({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'checking' | 'authed' | 'anon'>('checking');

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setStatus(data.session ? 'authed' : 'anon');
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setStatus(session ? 'authed' : 'anon');
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (status === 'checking') return null;
  if (status === 'anon') return <Navigate to="/admin/login" replace />;
  return <>{children}</>;
}
