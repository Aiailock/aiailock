-- Reader opinions: every story element can keep one emoji plus a short
-- written note from each reader device. The token-protected Edge Function is
-- still the only public writer; the owner sees the result in Admin.

alter table reader_reactions
  add column if not exists note text;

alter table reader_reactions
  drop constraint if exists reader_reactions_note_length_check;
alter table reader_reactions
  add constraint reader_reactions_note_length_check
  check (note is null or char_length(note) between 1 and 600);

create index if not exists idx_reader_reactions_with_note
  on reader_reactions(updated_at desc)
  where note is not null;

comment on column reader_reactions.note is
  'Optional written opinion left by the reader for this story element.';
