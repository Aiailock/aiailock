declare const Deno: { env: { get(key: string): string | undefined } };

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function encodeText(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function decodeText(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

async function secret(): Promise<string> {
  const value = Deno.env.get('READER_ACCESS_SECRET') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!value) throw new Error('READER_ACCESS_SECRET is not configured.');
  return value;
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encodeText(await secret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encodeText(payload))));
}

export async function issueReaderToken(ttlSeconds = 60 * 60 * 24 * 30): Promise<string> {
  const payload = JSON.stringify({ v: 1, exp: Math.floor(Date.now() / 1000) + ttlSeconds });
  const encoded = base64url(encodeText(payload));
  return `${encoded}.${await sign(encoded)}`;
}

export async function verifyReaderToken(token: string | null): Promise<boolean> {
  if (!token) return false;
  const [encoded, provided] = token.split('.');
  if (!encoded || !provided) return false;
  const expected = await sign(encoded);
  if (expected.length !== provided.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  if (mismatch !== 0) return false;
  try {
    const payload = JSON.parse(decodeText(encoded)) as { v?: number; exp?: number };
    return payload.v === 1 && typeof payload.exp === 'number' && payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}
