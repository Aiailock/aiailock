// Human-readable (Russian) catalogue of every visual option a timeline
// element's `style` JSON can carry. Kept in one place so the admin editor
// (src/pages/admin/StyleEditor.tsx) and the reader (StoryElement.tsx /
// EffectsLayer.tsx) never drift apart on what ids exist.

export interface StyleOption { id: string; label: string; hint?: string }

export const FRAME_OPTIONS: StyleOption[] = [
  { id: 'minimal', label: 'Минимальная', hint: 'Просто белая карточка' },
  { id: 'polaroid', label: 'Полароид', hint: 'Чуть повёрнутое фото с белой рамкой' },
  { id: 'gold', label: 'Золотая рамка' },
  { id: 'flowers', label: 'Цветы по углам' },
  { id: 'branches', label: 'Веточки' },
  { id: 'stars', label: 'Звёздное небо' },
  { id: 'ribbon', label: 'С бантиком сверху' },
  { id: 'washi', label: 'Скотч (washi tape)' },
  { id: 'ticket', label: 'Билет / квиток' },
  { id: 'film', label: 'Киноплёнка' },
  { id: 'heart', label: 'В форме сердца' },
  { id: 'sepia', label: 'Сепия / винтаж' },
  { id: 'wood', label: 'Деревянная рамка' },
  { id: 'neon', label: 'Неон' },
  { id: 'pixel', label: 'Пиксельная (8-бит)' },
  { id: 'hearts', label: 'Сердечки по краям' },
  { id: 'garland', label: 'Гирлянда из звёздочек' },
  { id: 'postcard', label: 'Открытка с маркой' },
  { id: 'wax-seal', label: 'Сургучная печать' },
  { id: 'torn', label: 'Рваный край бумаги' },
];

export const DECORATION_OPTIONS: StyleOption[] = [
  { id: 'petals', label: 'Лепестки', hint: 'Медленно падают сверху' },
  { id: 'confetti', label: 'Конфетти' },
  { id: 'snow', label: 'Снег' },
  { id: 'rain', label: 'Дождь' },
  { id: 'pixel-hearts', label: 'Пиксельные сердечки' },
  { id: 'fireflies', label: 'Светлячки' },
  { id: 'stardust', label: 'Звёздная пыль' },
];

export const ZONE_OPTIONS: StyleOption[] = [
  { id: 'default', label: 'Обычный (кремовый)' },
  { id: 'romantic', label: 'Романтичный (розовый)' },
  { id: 'night', label: 'Ночь' },
  { id: 'burgundy', label: 'Бордовый / глубокий' },
  { id: 'pixel', label: 'Пиксельный синий' },
  { id: 'gif', label: 'Тёплый жёлтый' },
  { id: 'travel', label: 'Путешествие (песочный)' },
  { id: 'winter', label: 'Зима (голубой)' },
  { id: 'sepia', label: 'Сепия' },
  { id: 'rain', label: 'Дождливый серый' },
];

export const FONT_OPTIONS: StyleOption[] = [
  { id: '', label: 'По умолчанию (Cormorant)' },
  { id: 'serif', label: 'Serif — Cormorant Garamond' },
  { id: 'script', label: 'Рукописный — Caveat' },
  { id: 'sans', label: 'Прямой — DM Sans' },
  { id: 'pixel', label: 'Пиксельный — Press Start 2P' },
  { id: 'mono', label: 'Ретро-терминал — VT323' },
];

export function findLabel(options: StyleOption[], id: string | undefined | null) {
  return options.find((o) => o.id === id)?.label ?? id ?? '—';
}
