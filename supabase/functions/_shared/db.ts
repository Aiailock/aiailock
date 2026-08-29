// ============================================================================
// db — Supabase clients for edge functions.
//
// This file only ever runs under the Supabase Edge Functions Deno runtime
// (`supabase functions serve` / `supabase functions deploy`), never bundled
// by Vite or type-checked by the frontend's tsconfig (which only includes
// `src`). `Deno.env` is provided by that runtime.
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically by
// Supabase into every edge function's environment — you do not need to set
// them yourself (see README → "Edge Functions: переменные окружения").
// ============================================================================

// deno-lint-ignore-file no-explicit-any
declare const Deno: { env: { get(key: string): string | undefined } };

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

/**
 * Full-access client using the service_role key. Bypasses RLS entirely —
 * only ever used server-side, after the caller has already been verified as
 * the admin via `assertAdmin()` below. NEVER exposed to the frontend.
 */
export function serviceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in edge function environment.');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Client acting AS the caller (anon key + their JWT forwarded). Used only to
 * ask Postgres "is this JWT the admin?" via the existing `is_admin()` SQL
 * function — reuses the single source of truth defined in
 * 0002_auth_owner.sql instead of duplicating the owner-check logic here.
 */
function callerClient(authHeader: string): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anonKey) {
    throw new Error('Missing SUPABASE_URL / SUPABASE_ANON_KEY in edge function environment.');
  }
  return createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
}

/**
 * Throws if the request's Authorization header does not belong to the
 * single configured owner account. Every admin-only edge function must call
 * this before touching any data.
 */
export async function assertAdmin(req: Request): Promise<void> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    throw new HttpError(401, 'Отсутствует заголовок Authorization.');
  }
  const client = callerClient(authHeader);
  const { data, error } = await client.rpc('is_admin');
  if (error) {
    throw new HttpError(401, `Не удалось проверить права: ${error.message}`);
  }
  if (data !== true) {
    throw new HttpError(403, 'Доступ только для владельца истории.');
  }
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
