-- ============================================================================
-- Stage 3 (media engine) — `media.kind` already allowed 'document' since
-- 0001_init.sql, but 0003_storage.sql never created a bucket for it (every
-- other kind has a 1:1 bucket). Adding it now rather than overloading an
-- unrelated bucket, to keep the "logical separation by type" rule from
-- HANDOFF.md intact. The existing "admin full access to all buckets" policy
-- from 0003 already covers every bucket by using `for all` with no bucket_id
-- filter, so no new RLS policy is needed here.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('documents', 'documents', false, 26214400) -- 25 MB
on conflict (id) do nothing;
