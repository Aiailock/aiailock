# С чего начать — обновление 0025

Это дополнение к обновлению 0024. Архив 0025 уже содержит и исправление GIF, и оба режима настоящей книги.

## Если используете Pull Request

1. Откройте Pull Request обновления 0025.
2. Нажмите **Merge pull request → Confirm merge**.
3. GitHub обновит `main`, после чего Netlify начнёт deploy автоматически.

## Если устанавливаете ZIP с телефона

Откройте GitHub → репозиторий `Aiailock/aiailock` → **Code → Codespaces** и создайте Codespace на `main`.

Загрузите ZIP в Codespace, распакуйте его в корень проекта с заменой файлов и выполните:

```bash
git branch backup-before-0025
npm install
npm test
npm run typecheck
npm run lint
npm run build
git status --short
git add .
git commit -m "Real horizontal and vertical paper book 0025"
git push
```

Не загружайте `.env`, `.git`, `node_modules` и `dist` вручную.

## Supabase

Для обновлений 0024 и 0025 новой миграции и Edge Function нет. Если 0023 уже установлен, команды Supabase не нужны.

## Netlify

После `git push` дождитесь зелёного deploy:

```text
Build command: npm run build
Publish directory: dist
Node version: 20
```

Если сборка не запустилась: **Netlify → Deploys → Trigger deploy → Deploy site**.

Подробный список изменений и проверка находятся в `UPDATE_0025_REAL_PAPER_BOOK_RU.md`.
