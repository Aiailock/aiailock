#!/usr/bin/env bash
set -euo pipefail

PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${1:-.}"

if [[ ! -f "$PROJECT_DIR/package.json" ]] || ! grep -q '"name": "whatsapp-timeline"' "$PROJECT_DIR/package.json"; then
  echo "Ошибка: запусти установщик из корня репозитория aiailock."
  exit 1
fi

cp -a "$PATCH_DIR/files/." "$PROJECT_DIR/"
rm -f \
  "$PROJECT_DIR/src/components/reader/BookTimeline.tsx" \
  "$PROJECT_DIR/src/lib/bookPagination.ts" \
  "$PROJECT_DIR/server/reader/bookSelfTest.ts"

cd "$PROJECT_DIR"
npm ci
npm run build
npm run lint
npm test

if [[ "${SKIP_SUPABASE_DEPLOY:-0}" != "1" ]]; then
  if command -v supabase >/dev/null 2>&1; then
    SUPABASE_CLI=(supabase)
  else
    SUPABASE_CLI=(npx --yes supabase)
  fi

  echo "Обновляю защищённые Edge Functions для Reader Preview…"
  if ! "${SUPABASE_CLI[@]}" functions deploy reader-access \
    || ! "${SUPABASE_CLI[@]}" functions deploy public-timeline \
    || ! "${SUPABASE_CLI[@]}" functions deploy get-media-url; then
    echo
    echo "Не удалось обновить Supabase Functions. Файлы уже скопированы, данные не затронуты."
    echo "Выполни: npx supabase login"
    echo "Затем:    npx supabase link --project-ref ТВОЙ_PROJECT_REF"
    echo "И повторно запусти этот установщик."
    exit 2
  fi
else
  echo "Supabase deploy пропущен через SKIP_SUPABASE_DEPLOY=1. Не забудь развернуть reader-access, public-timeline и get-media-url вручную."
fi

if [[ "${SKIP_GIT_PUSH:-0}" == "1" ]]; then
  echo "Git commit/push пропущен через SKIP_GIT_PUSH=1."
  echo "Локальная проверка обновления 0027 завершена."
else
  git add -A
  if git diff --cached --quiet; then
    echo "Обновление 0027 уже установлено."
  else
    git commit -m "Add live Reader Preview editing and scene advisor"
  fi
  git push origin HEAD:main
  echo "Готово. GitHub обновлён; Netlify должен запустить новый deploy автоматически."
fi
