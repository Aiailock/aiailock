import { createContext, useContext } from 'react';

// Small, additive settings surface layered on top of the existing free-form
// `theme` JSON (see Admin → Настройки → "Расширенная тема JSON" and
// src/lib/readerApi.ts → ReaderSettings.theme). Two new keys are read out of
// that same JSON blob so no schema/migration change is needed:
//
//   theme.specialMomentLabel  — replaces the hardcoded "особенный момент"
//                                caption shown above special-moment elements
//   theme.timeFormat          — one of TIME_FORMAT_OPTIONS below, controls
//                                how the date/time line under every element
//                                is rendered

export type TimeFormatId = 'default' | '12h' | 'short' | 'relative' | 'weekday';
export type DateStyleId = 'line' | 'centered' | 'ribbon' | 'handwritten' | 'capsule' | 'split';
export type LoaderStyleId = 'hearts' | 'sparkles' | 'minimal';
export type MotionModeId = 'auto' | 'full' | 'lite';
export type BackgroundMusicModeId = 'built_in' | 'custom' | 'off';
export type ReaderModeId = 'scroll' | 'book-horizontal' | 'book-vertical';
export type BookOrientationId = 'horizontal' | 'vertical';

export function normalizeReaderMode(value: string | null | undefined): ReaderModeId {
  if (value === 'scroll' || value === 'book-vertical' || value === 'book-horizontal') return value;
  // 0024 stored the old value as simply `book`. Keep every existing reader on
  // the same left-to-right book instead of resetting her preference.
  return 'book-horizontal';
}

export function isBookReaderMode(mode: ReaderModeId): boolean {
  return mode !== 'scroll';
}

export function bookOrientation(mode: ReaderModeId): BookOrientationId {
  return mode === 'book-vertical' ? 'vertical' : 'horizontal';
}

export const TIME_FORMAT_OPTIONS: { id: TimeFormatId; label: string; hint: string }[] = [
  { id: 'default', label: 'Обычный', hint: '3 марта 2024 · 21:40' },
  { id: 'weekday', label: 'С днём недели', hint: 'воскресенье, 3 марта 2024 · 21:40' },
  { id: '12h', label: '12-часовой (AM/PM)', hint: '3 марта 2024 · 9:40 PM' },
  { id: 'short', label: 'Короткий', hint: '03.03.2024 · 21:40' },
  { id: 'relative', label: 'Относительный', hint: '2 года назад · 21:40' },
];

export const DEFAULT_SPECIAL_MOMENT_LABEL = 'особенный момент';
export const DEFAULT_TIME_FORMAT: TimeFormatId = 'default';

export interface ReaderDisplaySettings {
  specialMomentLabel: string;
  timeFormat: TimeFormatId;
  readerFont: string;
  dateStyle: DateStyleId;
  dateAlign: 'left' | 'center' | 'right';
  dateFont: string;
  hideTime: boolean;
  coverSubtitle: string;
  closingMessage: string;
  coverBackgroundUrl: string;
  loaderTitle: string;
  loaderSubtitle: string;
  loaderStyle: LoaderStyleId;
  motionMode: MotionModeId;
  backgroundMusicMode: BackgroundMusicModeId;
  backgroundMusicPath: string;
  backgroundMusicTitle: string;
  backgroundMusicVolume: number;
}

export const ReaderSettingsContext = createContext<ReaderDisplaySettings>({
  specialMomentLabel: DEFAULT_SPECIAL_MOMENT_LABEL,
  timeFormat: DEFAULT_TIME_FORMAT,
  readerFont: 'serif',
  dateStyle: 'line',
  dateAlign: 'left',
  dateFont: 'sans',
  hideTime: false,
  coverSubtitle: 'история впереди',
  closingMessage: 'история продолжается',
  coverBackgroundUrl: '',
  loaderTitle: 'Моя история грузится',
  loaderSubtitle: 'Немного подожди — я бережно собираю всё по страницам.',
  loaderStyle: 'hearts',
  motionMode: 'auto',
  backgroundMusicMode: 'built_in',
  backgroundMusicPath: '',
  backgroundMusicTitle: 'Тихое сияние',
  backgroundMusicVolume: 0.22,
});

export function useReaderSettings() {
  return useContext(ReaderSettingsContext);
}

export function readDisplaySettingsFromTheme(theme: Record<string, unknown> | undefined | null): ReaderDisplaySettings {
  const label = typeof theme?.specialMomentLabel === 'string' && theme.specialMomentLabel.trim() ? theme.specialMomentLabel.trim() : DEFAULT_SPECIAL_MOMENT_LABEL;
  const formatRaw = typeof theme?.timeFormat === 'string' ? theme.timeFormat : DEFAULT_TIME_FORMAT;
  const timeFormat = TIME_FORMAT_OPTIONS.some((o) => o.id === formatRaw) ? (formatRaw as TimeFormatId) : DEFAULT_TIME_FORMAT;
  const readerFont = typeof theme?.readerFont === 'string' && theme.readerFont ? theme.readerFont : 'serif';
  const allowedDateStyles: DateStyleId[] = ['line', 'centered', 'ribbon', 'handwritten', 'capsule', 'split'];
  const rawDateStyle = typeof theme?.dateStyle === 'string' ? theme.dateStyle : 'line';
  const dateStyle = allowedDateStyles.includes(rawDateStyle as DateStyleId) ? rawDateStyle as DateStyleId : 'line';
  const rawAlign = typeof theme?.dateAlign === 'string' ? theme.dateAlign : 'left';
  const dateAlign = rawAlign === 'center' || rawAlign === 'right' ? rawAlign : 'left';
  const dateFont = typeof theme?.dateFont === 'string' && theme.dateFont ? theme.dateFont : 'sans';
  const hideTime = theme?.hideTime === true;
  const coverSubtitle = typeof theme?.coverSubtitle === 'string' && theme.coverSubtitle.trim() ? theme.coverSubtitle.trim() : 'история впереди';
  const closingMessage = typeof theme?.closingMessage === 'string' && theme.closingMessage.trim() ? theme.closingMessage.trim() : 'история продолжается';
  const coverBackgroundUrl = typeof theme?.coverBackgroundUrl === 'string' ? theme.coverBackgroundUrl.trim() : '';
  const loaderTitle = typeof theme?.loaderTitle === 'string' && theme.loaderTitle.trim() ? theme.loaderTitle.trim() : 'Моя история грузится';
  const loaderSubtitle = typeof theme?.loaderSubtitle === 'string' && theme.loaderSubtitle.trim() ? theme.loaderSubtitle.trim() : 'Немного подожди — я бережно собираю всё по страницам.';
  const loaderStyle = theme?.loaderStyle === 'sparkles' || theme?.loaderStyle === 'minimal' ? theme.loaderStyle : 'hearts';
  const motionMode = theme?.motionMode === 'full' || theme?.motionMode === 'lite' ? theme.motionMode : 'auto';
  const backgroundMusicMode = theme?.backgroundMusicMode === 'off' || theme?.backgroundMusicMode === 'custom' ? theme.backgroundMusicMode : 'built_in';
  const backgroundMusicPath = typeof theme?.backgroundMusicPath === 'string' ? theme.backgroundMusicPath.trim() : '';
  const backgroundMusicTitle = typeof theme?.backgroundMusicTitle === 'string' && theme.backgroundMusicTitle.trim() ? theme.backgroundMusicTitle.trim() : 'Тихое сияние';
  const rawBackgroundVolume = Number(theme?.backgroundMusicVolume ?? 0.22);
  const backgroundMusicVolume = Number.isFinite(rawBackgroundVolume) ? Math.max(0.04, Math.min(0.65, rawBackgroundVolume)) : 0.22;
  return { specialMomentLabel: label, timeFormat, readerFont, dateStyle, dateAlign, dateFont, hideTime, coverSubtitle, closingMessage, coverBackgroundUrl, loaderTitle, loaderSubtitle, loaderStyle, motionMode, backgroundMusicMode, backgroundMusicPath, backgroundMusicTitle, backgroundMusicVolume };
}

export function prefersLiteReaderMotion(mode: MotionModeId): boolean {
  if (mode === 'lite') return true;
  if (mode === 'full' || typeof navigator === 'undefined') return false;
  const deviceMemory = Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8);
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return Boolean(
    connection?.saveData
    || connection?.effectiveType === '2g'
    || deviceMemory <= 4
    || navigator.hardwareConcurrency <= 4,
  );
}
