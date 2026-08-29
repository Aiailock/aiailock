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
}

export const ReaderSettingsContext = createContext<ReaderDisplaySettings>({
  specialMomentLabel: DEFAULT_SPECIAL_MOMENT_LABEL,
  timeFormat: DEFAULT_TIME_FORMAT,
  readerFont: 'serif',
});

export function useReaderSettings() {
  return useContext(ReaderSettingsContext);
}

export function readDisplaySettingsFromTheme(theme: Record<string, unknown> | undefined | null): ReaderDisplaySettings {
  const label = typeof theme?.specialMomentLabel === 'string' && theme.specialMomentLabel.trim() ? theme.specialMomentLabel.trim() : DEFAULT_SPECIAL_MOMENT_LABEL;
  const formatRaw = typeof theme?.timeFormat === 'string' ? theme.timeFormat : DEFAULT_TIME_FORMAT;
  const timeFormat = TIME_FORMAT_OPTIONS.some((o) => o.id === formatRaw) ? (formatRaw as TimeFormatId) : DEFAULT_TIME_FORMAT;
  const readerFont = typeof theme?.readerFont === 'string' && theme.readerFont ? theme.readerFont : 'serif';
  return { specialMomentLabel: label, timeFormat, readerFont };
}
