export const ACCENT_COLORS = [
  { value: 'blue', label: 'Bleu' },
  { value: 'teal', label: 'Turquoise' },
  { value: 'violet', label: 'Violet' },
  { value: 'grape', label: 'Raisin' },
  { value: 'orange', label: 'Orange' },
  { value: 'red', label: 'Rouge' },
  { value: 'green', label: 'Vert' },
  { value: 'pink', label: 'Rose' },
  { value: 'indigo', label: 'Indigo' },
  { value: 'cyan', label: 'Cyan' },
] as const;

export type AccentColor = (typeof ACCENT_COLORS)[number]['value'];
