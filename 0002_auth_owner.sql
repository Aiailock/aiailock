// Admin-only endpoints: the real protection is the is_admin() JWT check
// inside each function, not CORS. This just lets the admin SPA (any origin
// it's deployed to — Netlify preview URLs change) call the function at all.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-reader-access-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
