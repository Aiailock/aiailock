# Начать отсюда: обновление 0024

Релиз добавляет новый Reader-книгу и окончательно исправляет пустой поиск GIF.

## Если обновление 0023 уже установлено

```bash
git branch backup-before-0024
npm install
npm test
npm run build
git add .
git commit -m "Pocket book reader and reliable GIF library 0024"
git push
```

Новой SQL-миграции и новой Supabase Edge Function в 0024 нет. Подключённый к GitHub Netlify начнёт deploy автоматически.

## Если сайт ещё остался на 0022

Архив полный и уже содержит 0023. Перед GitHub/Netlify дополнительно выполните:

```bash
npx supabase@latest login
npx supabase@latest link --project-ref ВАШ_PROJECT_REF
npx supabase@latest db push
npx supabase@latest functions deploy ai-director
```

Подробный список изменений, телефонная инструкция и проверка находятся в `UPDATE_0024_BOOK_READER_GIFS_RU.md`.
