import type { CSSVariablesResolver, MantineThemeOverride } from '@mantine/core';

export type ColorScheme = 'light' | 'dark';
/** Préférence utilisateur : 'auto' suit le réglage du système. */
export type ColorSchemePreference = ColorScheme | 'auto';

/** Couleurs de l'aperçu affiché dans le sélecteur de thème. */
export interface ThemePreview {
  page: string;
  nav: string;
  card: string;
  border: string;
  text: string;
}

/**
 * Définition d'un thème du panel. Pour en ajouter un : créer un fichier dans
 * `themes/`, puis l'enregistrer dans `registry.ts` (et dans `public/theme-init.js`
 * s'il supporte le mode clair).
 */
export interface PanelTheme {
  id: string;
  label: string;
  description: string;
  /** Schémas supportés ; un seul = schéma imposé. */
  colorSchemes: readonly ColorScheme[];
  /** Construit le thème Mantine à partir de la couleur d'accentuation choisie. */
  build: (accent: string) => MantineThemeOverride;
  /**
   * Doit définir les variables sémantiques `--hs-*` utilisées par les pages
   * (surfaces, bordures, textes) pour chaque schéma supporté.
   */
  cssVariablesResolver: CSSVariablesResolver;
  preview: Partial<Record<ColorScheme, ThemePreview>>;
}
