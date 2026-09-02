-- Supabase Dashboard -> SQL Editor -> New query -> Run
-- Сбрасывает прогресс, визиты и список читателей.
-- История, медиа, настройки и реакции не удаляются.
begin;

delete from public.reader_visits;
delete from public.reader_visitors;

commit;
