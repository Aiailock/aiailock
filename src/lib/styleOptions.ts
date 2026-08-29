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
  { id: 'phone', label: 'Экран телефона', hint: 'Для скриншотов переписки' },
  { id: 'locket', label: 'Медальон (круглая рамка)' },
  { id: 'envelope', label: 'Конверт письма' },
  { id: 'moonlit', label: 'Лунная ночь' },
];

export const DECORATION_OPTIONS: StyleOption[] = [
  { id: 'petals', label: 'Лепестки', hint: 'Медленно падают сверху' },
  { id: 'confetti', label: 'Конфетти' },
  { id: 'snow', label: 'Снег' },
  { id: 'rain', label: 'Дождь' },
  { id: 'pixel-hearts', label: 'Пиксельные сердечки' },
  { id: 'fireflies', label: 'Светлячки' },
  { id: 'stardust', label: 'Звёздная пыль' },
  { id: 'leaves', label: 'Осенние листья' },
  { id: 'candles', label: 'Свечи', hint: 'Мягкое тёплое свечение' },
  { id: 'custom-gif', label: 'Своя гифка', hint: 'Укажи ссылку на GIF ниже' },
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
  { id: 'forest', label: 'Лес / деревья' },
  { id: 'dusk', label: 'Сумерки (фон темнеет)', hint: 'Плавно затемняется, когда попадает в кадр' },
];

export const FONT_OPTIONS: StyleOption[] = [
  { id: '', label: 'Общий шрифт reader' },
  { id: 'serif', label: 'Serif — Cormorant Garamond' },
  { id: 'script', label: 'Рукописный — Caveat' },
  { id: 'literata', label: 'Книжный — Literata' },
  { id: 'yeseva', label: 'Торжественный — Yeseva One' },
  { id: 'comfort', label: 'Мягкий — Comfortaa' },
  { id: 'badscript', label: 'Личное письмо — Bad Script' },
  { id: 'marck', label: 'Чернила — Marck Script' },
  { id: 'pacifico', label: 'Тёплый — Pacifico' },
  { id: 'neucha', label: 'Записка — Neucha' },
  { id: 'sans', label: 'Прямой — DM Sans' },
  { id: 'pixel', label: 'Пиксельный — Press Start 2P' },
  { id: 'mono', label: 'Ретро-терминал — VT323' },
];

export const INTERACTION_OPTIONS: StyleOption[] = [
  { id: 'spoiler', label: 'Секрет', hint: 'Текст раскрывается по нажатию' },
  { id: 'gift', label: 'Подарок', hint: 'Коробочка с текстом или фото внутри' },
  { id: 'letter', label: 'Письмо', hint: 'Закрытый конверт превращается в письмо' },
  { id: 'flip', label: 'Карточка-перевёртыш', hint: 'Сюрприз на обратной стороне' },
  { id: 'photo-reveal', label: 'Проявить фото', hint: 'Фото появляется только после нажатия' },
  { id: 'promise', label: 'Обещание', hint: 'Небольшой сердечный ритуал' },
];

export function findLabel(options: StyleOption[], id: string | undefined | null) {
  return options.find((o) => o.id === id)?.label ?? id ?? '—';
}
