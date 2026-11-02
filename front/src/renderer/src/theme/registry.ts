import type { PanelTheme } from './types';
import { classicTheme } from './themes/classic';
import { modernTheme } from './themes/modern';

// Registre des thèmes proposés dans les Paramètres, dans l'ordre d'affichage.
export const THEMES: readonly PanelTheme[] = [classicTheme, modernTheme];

export const DEFAULT_THEME_ID = classicTheme.id;

export function getPanelTheme(id: string | null | undefined): PanelTheme {
  return THEMES.find((t) => t.id === id) ?? classicTheme;
}
