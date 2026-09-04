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

git add -A
if git diff --cached --quiet; then
  echo "Обновление 0026 уже установлено."
else
  git commit -m "Fix Netlify build and restore feed reader"
fi
git push origin main

echo "Готово. GitHub обновлён; Netlify должен запустить новый deploy автоматически."
