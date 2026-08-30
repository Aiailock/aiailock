# «Для тебя»

Production-ready personal timeline built from WhatsApp ZIP exports. There is **no WhatsApp bridge, QR login, webhook, WhatsApp Web or permanent WhatsApp process**. The only input is a normal ZIP export containing `chat.txt`/similar text plus media.

## Current state

The project is now completed across the planned stages:

- **1. Foundation:** React + TypeScript + Vite + Tailwind + Supabase Auth/Postgres/Storage/RLS, PWA, Netlify configuration.
- **2. Import:** Android/iOS WhatsApp export parsing, multiline messages, system-message filtering, media references, fingerprint deduplication, overlapping imports, import audit log.
- **3. Media:** private Storage buckets, original ZIP archive, photo thumbnails, deterministic media paths, missing-media status, signed media URLs, late media repair on later imports.
- **4. AI + timeline:** `original_text` / `display_text`, mood, suggested/applied style, cache by source hash + prompt version, manual reprocessing, reader-safe timeline, generated year breaks and anniversary markers.
- **5. Reader:** single continuous book-like page, mobile-first, mood zones, year pauses, memory cards, photo/video/audio/sticker/document rendering, scroll reveal, SVG botanical decoration, original-text disclosure, infinite pagination.
- **6. Admin:** ZIP import, import history/logs, statistics dashboard, unified timeline controls, hide/show, text/style editing, memories, special moments, screenshots, media manager, AI controls, visual theme settings, reader password, mobile preview with secure admin-only bypass.
- **7. Hardening:** RLS, private buckets, signed URLs, reader access token, noindex/security headers, PWA shell, reduced-motion support, empty states, lazy media loading and admin-only preview tokens. A final additive migration (`0010_completion_polish.sql`) closes metadata/positioning gaps and adds manual memory photos.
- **8. Interaction + analytics:** real and bulk deletion, bulk styling, text frames, six tap-to-reveal moment types, additional fonts, browser-friendly admin controls and privacy-preserving reader progress statistics (`0012_interactions_analytics_admin.sql`).
- **9. Mobile Story Studio:** phone-first composer with drafts/templates, chapters, screenshot albums, GIF scenes, six date designs, remote backgrounds and private reader reactions (`0013_story_studio.sql`).
- **10. Cinematic + Safety:** dark graphite/gold reader, quote and pause scenes, resume reading, current chapter, scheduled publication, revision restore, integrity checks and downloadable JSON backups (`0014_cinematic_safety.sql`).
- **11. Journey Reader:** exact Admin → Reader ordering without changing real dates, visible time-of-day atmospheres, eight reveal animations, twelve interactive moments, journey map, bookmarks, auto-reading and reader typography controls (`0015_journey_reader_order.sql`).
- **12. Smooth Reader + Opinions:** fast first-page boot, automatic continuation loading, off-screen rendering isolation, phone-aware motion budget, configurable heart loader, written opinions on every story element and a faster mobile multi-screenshot composer (`0016_reader_opinions_performance.sql`).

The public reader never receives `service_role`, AI metadata internals, prompt versions, import logs or admin controls.

## Stack

- React 18 + TypeScript + Vite
- Tailwind CSS
- Framer Motion
- Supabase Postgres + Auth + Storage + Edge Functions
- Netlify for the frontend
- Optional OpenAI-compatible AI endpoint. If AI secrets are absent, the built-in conservative fallback keeps the site working.

Supabase Edge Functions support npm dependencies directly and are deployed with the Supabase CLI.

---

# 1. Deploy Supabase

Create a new Supabase project.

Install the current Supabase CLI, then from this project directory:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

The migration chain is intentionally ordered:

```text
0001_init.sql
0002_auth_owner.sql
0003_storage.sql
0004_media_documents_bucket.sql
0005_stage4_timeline_ai.sql
0006_stage4_ai_application.sql
0007_production_hardening.sql
0008_ai_upsert_constraints.sql
0009_special_timeline_service_helper.sql
0010_completion_polish.sql
0011_fix_ambiguous_kind_column.sql
0012_interactions_analytics_admin.sql
0013_story_studio.sql
0014_cinematic_safety.sql
0015_journey_reader_order.sql
0016_reader_opinions_performance.sql
```

Supabase's CLI supports linking a project and deploying migrations/functions as code.

## Create the admin user

In Supabase Dashboard → Authentication → Users, create the one account that will own the project.

Then in SQL Editor run:

```sql
update public.app_config
set owner_user_id = 'YOUR_AUTH_USER_UUID'
where id = true;
```

Do not put the service-role key into the frontend.

## Deploy Edge Functions

```bash
supabase functions deploy import-zip
supabase functions deploy process-ai
supabase functions deploy get-media-url
supabase functions deploy public-timeline
supabase functions deploy reader-access
supabase functions deploy reader-analytics
supabase functions deploy reader-reaction
```

`supabase/config.toml` already declares which functions require JWT verification:

- `import-zip` → admin JWT required
- `process-ai` → admin JWT required
- `get-media-url` → public reader endpoint
- `public-timeline` → public reader endpoint
- `reader-access` → public reader endpoint
- `reader-analytics` → public endpoint with its own signed reader-token check
- `reader-reaction` → public endpoint with its own signed reader-token check

### Final schema migration
Run `supabase db push` once from a linked project. The ordered migration chain through `0016_reader_opinions_performance.sql` is applied automatically.

## Required Edge Function secret

Generate a random secret for reader access tokens and set it:

```bash
supabase secrets set READER_ACCESS_SECRET="PUT_A_LONG_RANDOM_SECRET_HERE"
```

If it is not supplied, the token signer falls back to the service-role secret internally, but using a dedicated random secret is recommended.

## Optional AI

The AI layer is deliberately optional. Without these secrets the local fallback is used and the application still works.

For an OpenAI-compatible endpoint:

```bash
supabase secrets set AI_API_URL="https://api.openai.com/v1/chat/completions"
supabase secrets set AI_API_KEY="YOUR_KEY"
supabase secrets set AI_MODEL="gpt-4.1-mini"
```

The AI contract is conservative: if the model changes the underlying lexical content instead of only correcting punctuation/spacing, the original message is kept as `display_text`.

---

# 2. Deploy Netlify

Push the folder to GitHub, then in Netlify choose **Add new site → Import an existing project**.

The repository already contains:

```text
Build command: npm run build
Publish directory: dist
Node: 20
```

Add these **two** Netlify environment variables:

```text
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY
```

Never add `SUPABASE_SERVICE_ROLE_KEY`, `AI_API_KEY` or `READER_ACCESS_SECRET` to Netlify `VITE_` variables. Those belong to Supabase Edge Function secrets.

Deploy the site.

The public reader is:

```text
https://YOUR-SITE.netlify.app/
```

Admin login is:

```text
https://YOUR-SITE.netlify.app/admin/login
```

---

# 3. First launch checklist

Do these in this order:

1. Create Supabase project.
2. Link the project with `supabase link`.
3. Run `supabase db push`.
4. Create the owner Auth user.
5. Set `app_config.owner_user_id`.
6. Deploy all seven Edge Functions listed above.
7. Set `READER_ACCESS_SECRET`.
8. Add the two `VITE_` variables to Netlify.
9. Deploy Netlify.
10. Open `/admin/login` and sign in.
11. Export the WhatsApp chat as **ZIP with media**.
12. Upload the ZIP in Admin → Import.
13. On the first import choose the history start date.
14. Open Admin → AI and process messages if AI processing is desired.
15. Review styles in Admin → History.
16. Add memories/screenshots if desired.
17. Open Preview and check the 390×844 mobile reader.
18. Share `/`.

---

# 4. WhatsApp import behavior

The site does not connect to WhatsApp.

Export the chat normally from WhatsApp and choose **with media**. Upload the resulting ZIP to `/admin`.

First import:

```text
ZIP
 ↓
find chat text
 ↓
parse messages
 ↓
filter by chosen start date
 ↓
fingerprint deduplication
 ↓
save messages
 ↓
match media
 ↓
upload private media
 ↓
build timeline source rows
 ↓
rebuild year / anniversary markers
```

Later import:

```text
full WhatsApp export again
        ↓
old fingerprints → duplicates
new fingerprints → inserted
missing media that now exists → repaired
        ↓
new history appears at the end
```

Fingerprint is based on sender + ISO timestamp + original text + media filename, not a message number.

A failed individual record does not cancel the entire import.

---

# 5. Admin

### Import

Upload ZIPs and inspect:

- total messages
- new messages
- duplicates
- media found/matched/missing
- import status
- warnings/errors
- full step log

### History

The unified `timeline_elements` table is the reader's canonical chronology.

Admin can:

- hide/show an element
- edit displayed message text
- edit style JSON
- inspect mood
- keep the original source untouched

### Memories

Manually create, edit and delete dated memories. They automatically become timeline elements.

### Screenshots

Upload an image to the private `screenshots` bucket, give it date/title/description/caption, choose position/animation/frame style, and it becomes a timeline element.

### Memories and special moments

A memory can optionally have a private photo, importance 0–5, an explicit special-moment flag and a placement anchor. The same source row is projected into the canonical timeline without duplicating content.

### AI

Actions:

- process new messages
- force reprocess
- accept suggested style
- return from applied style to the suggestion

The cache key uses source hash + model + prompt version so unchanged messages are not needlessly processed again.

### Settings

- reader title
- internal contact name
- theme JSON
- optional reader password

When password mode is enabled, the reader obtains a signed short-lived access token. Public timeline and media endpoints require that token. Without the password, the same reader endpoints remain open as intended.

### Preview

The admin preview embeds the actual public `/` route at approximately 390×844. It contains no admin controls inside the reader.

---

# 6. Storage

All content buckets are private:

```text
photos
videos
audio
stickers
documents
screenshots
thumbnails
originals
```

The reader does not receive permanent Storage URLs. `get-media-url` creates short-lived signed URLs after checking that the media is attached to a published timeline element.

---

# 7. Tests and verification

Parser self-test:

```bash
npx tsx server/parser/selfTest.ts
```

Expected:

```text
20/20
```

Media self-test:

```bash
npx tsx server/media/selfTest.ts
```

Expected:

```text
9/9
```

AI fallback self-test:

```bash
npx tsx server/ai/selfTest.ts
```

Expected:

```text
8/8
```

Frontend production build:

```bash
npm install
npm run build
```

The build must finish with both TypeScript and Vite successful before a manual release.

---

# 8. Local development

```bash
cp .env.example .env
npm install
npm run dev
```

Then:

```text
Reader: http://localhost:5173/
Admin:  http://localhost:5173/admin/login
```

---

# 9. Important security rules

Never put any of these in frontend `VITE_` variables:

```text
SUPABASE_SERVICE_ROLE_KEY
AI_API_KEY
READER_ACCESS_SECRET
```

The browser only receives the public Supabase URL and anon/publishable key. The database remains the security boundary for admin data, while reader media and password-gated reader access are handled by Edge Functions.

---

# 10. Project structure

```text
src/
  components/reader/       public story renderer
  components/admin/        admin auth gate
  lib/                     Supabase + reader API + timeline types
  pages/reader/            public book
  pages/admin/             complete admin
  styles/                  global visual foundation

server/
  parser/                  WhatsApp export parser
  media/                   media classification/storage helpers
  ai/                      AI contract + fallback

supabase/
  migrations/              complete ordered database schema
  functions/
    import-zip/            ZIP import
    process-ai/            AI processing
    get-media-url/         signed media URLs
    public-timeline/       public reader data API
    reader-access/         password/token access
    _shared/               common edge helpers

public/
  icons/                   PWA icons
```

The architecture is additive: the parser, media engine, AI layer, timeline, reader and admin use separate contracts, so later changes do not require rewriting earlier stages.
