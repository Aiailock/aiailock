-- ============================================================================
-- WhatsApp Timeline — initial schema
-- Stage 1: architecture & foundation
--
-- Design notes:
--   * Every table below is deliberately separate (not one big JSON blob) so
--     later stages (parser, media, AI, admin) can evolve independently.
--   * "messages" holds raw-ish parsed chat data. "timeline_elements" is the
--     unified, orderable feed the reader actually renders (messages, photos,
--     videos, memories, screenshots, year breaks, "on this day", etc). This
--     split lets us add brand-new content types later without touching the
--     parser or the messages table.
--   * RLS: readers (anon) get SELECT on published, reader-safe views only.
--     All write access and all admin-only tables require an authenticated
--     admin (auth.uid() present + owner check). There is exactly one owner
--     account for this product — see 0002_auth_owner.sql.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. history_settings — single-row config for the whole story
-- ----------------------------------------------------------------------------
create table if not exists history_settings (
  id boolean primary key default true constraint history_settings_singleton check (id = true),
  reader_starts_at timestamptz not null,        -- messages before this are never imported
  last_imported_at timestamptz,                 -- watermark: newest message timestamp fully imported
  contact_display_name text,                    -- how "her" name is shown in admin (never shown to reader)
  reader_title text not null default 'Для тебя',
  reader_requires_password boolean not null default false,
  reader_password_hash text,                    -- set only if reader_requires_password = true
  theme jsonb not null default '{}'::jsonb,      -- future: color overrides, etc.
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. imports — one row per ZIP upload, full audit trail
-- ----------------------------------------------------------------------------
create table if not exists imports (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  file_size_bytes bigint,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'completed_with_warnings', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  -- stats, filled in as the import pipeline runs
  messages_found integer default 0,
  messages_new integer default 0,
  messages_duplicate integer default 0,
  media_found integer default 0,
  media_matched integer default 0,
  media_missing integer default 0,
  photos_count integer default 0,
  videos_count integer default 0,
  audio_count integer default 0,
  stickers_count integer default 0,
  error_message text,
  -- step-by-step log: [{ step, status, message, at }]
  log jsonb not null default '[]'::jsonb
);

create index if not exists idx_imports_started_at on imports (started_at desc);

-- ----------------------------------------------------------------------------
-- 3. messages — parsed chat lines (the raw material)
-- ----------------------------------------------------------------------------
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  import_id uuid references imports (id) on delete set null,

  -- fingerprint = sha256(sender + '|' + iso_timestamp + '|' + original_text + '|' + media_filename)
  -- This is how we detect duplicates across re-imports of overlapping exports.
  fingerprint text not null unique,

  sender_name text not null,          -- raw name as it appears in the export at the time
  sent_at timestamptz not null,
  is_system_message boolean not null default false,   -- "message deleted", "encryption", group events, etc.
  is_multiline boolean not null default false,

  original_text text,                 -- exactly what was in the export (nullable for pure-media messages)
  display_text text,                  -- AI-polished version shown to the reader; falls back to original_text

  has_media boolean not null default false,
  media_id uuid,                      -- fk added after `media` table exists (see below)

  reaction_emoji text,                -- best-effort parsed reaction, if the export format exposes it reliably
  reaction_by text,

  created_at timestamptz not null default now()
);

create index if not exists idx_messages_sent_at on messages (sent_at asc);
create index if not exists idx_messages_import_id on messages (import_id);
create index if not exists idx_messages_has_media on messages (has_media) where has_media;

-- ----------------------------------------------------------------------------
-- 4. media — every file extracted from an import's ZIP
-- ----------------------------------------------------------------------------
create table if not exists media (
  id uuid primary key default gen_random_uuid(),
  import_id uuid references imports (id) on delete set null,
  message_id uuid references messages (id) on delete set null,

  kind text not null check (kind in ('photo', 'video', 'audio', 'sticker', 'document')),
  original_filename text not null,     -- e.g. IMG-20260412-WA0013.jpg
  storage_path text,                   -- path inside Supabase Storage; null if status = 'missing'
  thumbnail_path text,                 -- generated preview/poster frame
  mime_type text,
  size_bytes bigint,
  duration_seconds numeric,            -- for audio/video
  width integer,
  height integer,

  status text not null default 'pending'
    check (status in ('pending', 'stored', 'missing', 'failed')),

  created_at timestamptz not null default now()
);

alter table messages
  add constraint fk_messages_media foreign key (media_id) references media (id) on delete set null;

create index if not exists idx_media_message_id on media (message_id);
create index if not exists idx_media_status on media (status);

-- ----------------------------------------------------------------------------
-- 5. ai_metadata — one row per message/element that has been AI-processed
-- ----------------------------------------------------------------------------
create table if not exists ai_metadata (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references messages (id) on delete cascade,
  timeline_element_id uuid, -- fk added after timeline_elements exists

  mood text check (mood in
    ('normal', 'romantic', 'sad', 'funny', 'deep', 'night', 'memory', 'important', 'hopeful', 'neutral')),
  suggested_style jsonb,       -- { frame, background, decoration, animation } — a *suggestion*, admin can override
  applied_style jsonb,         -- what the admin actually accepted/edited; reader renders this, falling back to suggested_style

  model text,                  -- e.g. "claude-sonnet-4-6"
  prompt_version text,         -- lets us know which prompt produced this, for safe re-processing
  processed_at timestamptz not null default now(),

  constraint ai_metadata_target check (
    (message_id is not null)::int + (timeline_element_id is not null)::int = 1
  )
);

create unique index if not exists idx_ai_metadata_message on ai_metadata (message_id) where message_id is not null;
create unique index if not exists idx_ai_metadata_element on ai_metadata (timeline_element_id) where timeline_element_id is not null;

-- ----------------------------------------------------------------------------
-- 6. memories — manually added special moments (not from WhatsApp export)
-- ----------------------------------------------------------------------------
create table if not exists memories (
  id uuid primary key default gen_random_uuid(),
  title text,
  body text not null,
  occurred_at timestamptz not null,   -- when it happened, for chronological placement
  place_after_message_id uuid references messages (id) on delete set null, -- alt. placement strategy
  style jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 7. screenshots — manually uploaded chat screenshots / photos not from export
-- ----------------------------------------------------------------------------
create table if not exists screenshots (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null,
  caption text,
  occurred_at timestamptz not null,
  place_after_message_id uuid references messages (id) on delete set null,
  style jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 8. timeline_elements — the single unified, ordered feed the reader renders
-- ----------------------------------------------------------------------------
-- Every element that can appear on the reader page gets exactly one row here,
-- regardless of its underlying source table. This is what lets us add new
-- content types (year_break, on_this_day, milestone, ...) without ever
-- touching the reader's rendering/query logic beyond adding a new `type`.
create table if not exists timeline_elements (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in (
    'message', 'photo', 'video', 'audio', 'sticker',
    'memory', 'screenshot', 'year_break', 'on_this_day', 'milestone'
  )),
  occurred_at timestamptz not null,   -- primary chronological sort key
  sort_tiebreak integer not null default 0, -- for elements sharing the same timestamp

  message_id uuid references messages (id) on delete cascade,
  media_id uuid references media (id) on delete cascade,
  memory_id uuid references memories (id) on delete cascade,
  screenshot_id uuid references screenshots (id) on delete cascade,

  style jsonb not null default '{}'::jsonb,     -- { frame: 'polaroid', decoration: [...], animation: '...' }
  is_published boolean not null default true,   -- lets admin hide an element without deleting it
  is_reader_visible boolean generated always as (is_published) stored,

  created_at timestamptz not null default now(),

  constraint timeline_elements_one_source check (
    (message_id is not null)::int +
    (media_id is not null)::int +
    (memory_id is not null)::int +
    (screenshot_id is not null)::int <= 1
    -- year_break / on_this_day / milestone elements may have zero sources
  )
);

alter table ai_metadata
  add constraint fk_ai_metadata_element foreign key (timeline_element_id)
  references timeline_elements (id) on delete cascade;

create index if not exists idx_timeline_occurred_at on timeline_elements (occurred_at asc, sort_tiebreak asc);
create index if not exists idx_timeline_type on timeline_elements (type);
create index if not exists idx_timeline_published on timeline_elements (is_published) where is_published;

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table history_settings enable row level security;
alter table imports enable row level security;
alter table messages enable row level security;
alter table media enable row level security;
alter table ai_metadata enable row level security;
alter table memories enable row level security;
alter table screenshots enable row level security;
alter table timeline_elements enable row level security;

-- Admin (authenticated owner) has full access to everything.
-- is_admin() is defined in 0002_auth_owner.sql and checks auth.uid() against
-- the single allowed owner account.
create policy "admin full access - history_settings" on history_settings for all using (is_admin()) with check (is_admin());
create policy "admin full access - imports" on imports for all using (is_admin()) with check (is_admin());
create policy "admin full access - messages" on messages for all using (is_admin()) with check (is_admin());
create policy "admin full access - media" on media for all using (is_admin()) with check (is_admin());
create policy "admin full access - ai_metadata" on ai_metadata for all using (is_admin()) with check (is_admin());
create policy "admin full access - memories" on memories for all using (is_admin()) with check (is_admin());
create policy "admin full access - screenshots" on screenshots for all using (is_admin()) with check (is_admin());
create policy "admin full access - timeline_elements" on timeline_elements for all using (is_admin()) with check (is_admin());

-- Reader (anon) gets narrow, read-only access to exactly what the public page needs.
-- Note: no policy at all is granted on `imports` for anon — import history/logs are
-- admin-only and never reachable by the reader, by omission (default-deny RLS).
create policy "reader can read published timeline" on timeline_elements
  for select to anon
  using (is_published = true);

create policy "reader can read messages referenced by published elements" on messages
  for select to anon
  using (
    exists (
      select 1 from timeline_elements te
      where te.message_id = messages.id and te.is_published = true
    )
  );

create policy "reader can read stored media referenced by published elements" on media
  for select to anon
  using (
    status = 'stored'
    and exists (
      select 1 from timeline_elements te
      where te.media_id = media.id and te.is_published = true
    )
  );

create policy "reader can read memories referenced by published elements" on memories
  for select to anon
  using (
    exists (
      select 1 from timeline_elements te
      where te.memory_id = memories.id and te.is_published = true
    )
  );

create policy "reader can read screenshots referenced by published elements" on screenshots
  for select to anon
  using (
    exists (
      select 1 from timeline_elements te
      where te.screenshot_id = screenshots.id and te.is_published = true
    )
  );

-- IMPORTANT: RLS is row-level, not column-level. history_settings has sensitive
-- columns (reader_password_hash) that must never reach the anon key, so instead
-- of granting anon a row policy on the base table, we expose a narrow view.
create view public_settings
  with (security_invoker = true) as
select
  reader_title,
  reader_requires_password
from history_settings;

grant select on public_settings to anon;
-- No RLS policy grants anon any access to history_settings itself — default-deny applies.
