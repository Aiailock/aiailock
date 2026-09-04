# Начать отсюда: обновление 0023

Обновление сделано поверх актуального коммита GitHub `2a934386e8dd2d1626cc874d7621aebd58c52b7f`. Оно не удаляет историю и не требует нового проекта Supabase.

## Самый короткий безопасный порядок

1. Распакуйте архив поверх папки репозитория. Не заменяйте свои `.env` и `.env.local`.
2. Откройте терминал именно в корне проекта.
3. Выполните:

```bash
git branch backup-before-0023
npm install
npm test
npm run build
npx supabase@latest login
npx supabase@latest link --project-ref ВАШ_PROJECT_REF
npx supabase@latest db push
npx supabase@latest functions deploy ai-director
git add .
git commit -m "Romantic global update 0023"
git push
```

4. Netlify, подключённый к GitHub, начнёт публикацию автоматически. Если нет: Netlify → **Deploys** → **Trigger deploy** → **Deploy site**.
5. Проверьте на телефоне `/admin`, `/admin#admin-director`, `/admin#admin-create` и публичную `/`.

Важно: сначала `db push`, затем новая версия сайта. Без миграции 0023 новая колонка для надёжно сохранённой GIF ещё не существует.

Полная инструкция, список функций и чек-лист находятся в `UPDATE_0023_ROMANTIC_GLOBAL_RU.md`.
