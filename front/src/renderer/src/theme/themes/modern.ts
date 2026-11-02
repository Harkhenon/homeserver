import { createTheme, DEFAULT_THEME, type CSSVariablesResolver, type MantineColorsTuple } from '@mantine/core';
import type { PanelTheme } from '../types';
import classes from './modern.module.scss';

// Thème « Moderne » : surfaces pleines, bordures fines, typographie resserrée,
// densité adaptée aux tableaux d'administration. Disponible en clair et en sombre.

// Palette sombre neutre (légèrement froide), ordonnée clair -> sombre comme `dark` de Mantine.
const darkColors: MantineColorsTuple = [
  '#e6e8eb', // 0 texte principal
  '#c4c8ce', // 1 texte secondaire
  '#9299a3', // 2 texte atténué (≥ 6:1 sur les cartes)
  '#6b727c', // 3 texte discret (décoratif uniquement)
  '#2c3138', // 4 bordures
  '#22262c', // 5 survols
  '#1b1e23', // 6 champs / surfaces élevées
  '#15171b', // 7 cartes, modales
  '#101215', // 8 navigation / en-tête
  '#0b0c0f', // 9 fond de page
];

const light = {
  page: '#f4f5f7',
  chrome: '#ffffff',
  card: '#ffffff',
  border: '#e1e4e8',
  hover: '#eef0f3',
  text: '#16191d',
  muted: '#59616d', // ≥ 5.5:1 sur blanc et sur le fond de page
};

// Couleurs Mantine dont on assombrit les teintes « light » en mode clair pour tenir le contraste AA.
const PALETTE_NAMES = Object.keys(DEFAULT_THEME.colors);
const darkenedText = (color: string) => `color-mix(in srgb, var(--mantine-color-${color}-9) 78%, black)`;

const modernVariables: CSSVariablesResolver = () => ({
  variables: {
    '--hs-surface': 'var(--mantine-color-body)',
    '--hs-surface-blur': 'none',
    '--hs-welcome-bg':
      'linear-gradient(135deg, var(--mantine-primary-color-light) 0%, var(--mantine-color-body) 60%)',
  },
  dark: {
    '--mantine-color-body': darkColors[7],
    '--mantine-color-default-border': darkColors[4],
    '--hs-page-bg': darkColors[9],
    '--hs-chrome-bg': darkColors[8],
    '--hs-surface-raised': darkColors[6],
    '--hs-surface-sunken': darkColors[9],
    '--hs-border': darkColors[4],
    '--hs-hover': darkColors[5],
    '--hs-table-head-bg': darkColors[8],
    '--hs-text-strong': darkColors[0],
    '--hs-text-muted': darkColors[2],
    '--hs-nav-section': darkColors[2],
    '--hs-nav-section-active': darkColors[0],
    '--hs-shadow-sm': '0 1px 2px rgba(0, 0, 0, 0.35)',
    '--hs-shadow-md': '0 6px 20px rgba(0, 0, 0, 0.45)',
    '--hs-shadow-lg': '0 20px 50px rgba(0, 0, 0, 0.6)',
  },
  light: {
    '--mantine-color-body': light.card,
    '--mantine-color-dimmed': light.muted,
    '--mantine-color-default-border': light.border,
    '--mantine-color-anchor': 'var(--mantine-primary-color-light-color)',
    '--hs-page-bg': light.page,
    '--hs-chrome-bg': light.chrome,
    '--hs-surface-raised': light.page,
    '--hs-surface-sunken': '#f0f2f5',
    '--hs-border': light.border,
    '--hs-hover': light.hover,
    '--hs-table-head-bg': '#f8f9fa',
    '--hs-text-strong': light.text,
    '--hs-text-muted': light.muted,
    '--hs-nav-section': light.muted,
    '--hs-nav-section-active': light.text,
    '--hs-shadow-sm': '0 1px 2px rgba(16, 24, 40, 0.06)',
    '--hs-shadow-md': '0 8px 24px rgba(16, 24, 40, 0.12)',
    '--hs-shadow-lg': '0 24px 60px rgba(16, 24, 40, 0.18)',
    ...Object.fromEntries(
      PALETTE_NAMES.flatMap((c) => [
        [`--mantine-color-${c}-light-color`, darkenedText(c)],
        [`--mantine-color-${c}-text`, darkenedText(c)],
      ]),
    ),
    '--mantine-primary-color-light-color': 'color-mix(in srgb, var(--mantine-primary-color-9) 78%, black)',
  },
});

function buildModernTheme(accent: string) {
  return createTheme({
    primaryColor: accent,
    primaryShade: { light: 7, dark: 6 },
    // Texte noir ou blanc sur les fonds pleins selon la luminance : seuil choisi pour
    // toujours retenir la combinaison la plus contrastée (≥ 4.5:1) quelle que soit l'accentuation.
    autoContrast: true,
    luminanceThreshold: 0.18,
    black: light.text,
    defaultRadius: 'md',
    fontFamily:
      'Inter, "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", sans-serif',
    fontFamilyMonospace: '"JetBrains Mono", "Cascadia Code", ui-monospace, SFMono-Regular, Consolas, monospace',
    colors: { dark: darkColors },
    spacing: { xs: '0.5rem', sm: '0.625rem', md: '0.875rem', lg: '1.125rem', xl: '1.75rem' },
    headings: {
      fontWeight: '600',
      sizes: {
        h1: { fontSize: '1.75rem', lineHeight: '1.25' },
        h2: { fontSize: '1.375rem', lineHeight: '1.3' },
        h3: { fontSize: '1.125rem', lineHeight: '1.35' },
        h4: { fontSize: '1rem', lineHeight: '1.4' },
        h5: { fontSize: '0.875rem', lineHeight: '1.45' },
        h6: { fontSize: '0.75rem', lineHeight: '1.5' },
      },
    },
    components: {
      AppShell: {
        classNames: {
          root: classes.shellRoot,
          header: classes.shellHeader,
          navbar: classes.shellNavbar,
          main: classes.shellMain,
        },
      },
      Card: {
        defaultProps: { padding: 'md', radius: 'md', withBorder: true },
        classNames: { root: classes.card },
      },
      Paper: {
        defaultProps: { radius: 'md', shadow: 'none' },
        classNames: { root: classes.paper },
      },
      NavLink: {
        classNames: { root: classes.navLink, label: classes.navLinkLabel },
      },
      Table: {
        defaultProps: { highlightOnHover: true, verticalSpacing: 'xs', horizontalSpacing: 'sm', fz: 'sm' },
        classNames: { table: classes.table, th: classes.tableTh, td: classes.tableTd },
      },
      Badge: {
        defaultProps: { variant: 'light', radius: 'sm', size: 'sm' },
        classNames: { root: classes.badge },
      },
      Button: {
        defaultProps: { radius: 'md' },
      },
      ActionIcon: {
        defaultProps: { variant: 'default', radius: 'md' },
      },
      SegmentedControl: {
        defaultProps: { radius: 'md' },
      },
      Tabs: {
        classNames: { tab: classes.tab },
      },
      Tooltip: {
        defaultProps: { withArrow: true, radius: 'sm' },
      },
      Menu: {
        defaultProps: { radius: 'md', shadow: 'md' },
        classNames: { dropdown: classes.dropdown },
      },
      Popover: {
        defaultProps: { radius: 'md' },
        classNames: { dropdown: classes.dropdown },
      },
      Modal: {
        defaultProps: { radius: 'lg' },
        classNames: { content: classes.modalContent, header: classes.modalHeader, title: classes.modalTitle },
      },
      Progress: {
        defaultProps: { radius: 'xl' },
      },
      Title: {
        classNames: { root: classes.title },
      },
    },
  });
}

export const modernTheme: PanelTheme = {
  id: 'modern',
  label: 'Moderne',
  description: 'Surfaces nettes, interface plus dense et lisible, en clair ou en sombre.',
  colorSchemes: ['dark', 'light'],
  build: buildModernTheme,
  cssVariablesResolver: modernVariables,
  preview: {
    dark: { page: darkColors[9], nav: darkColors[8], card: darkColors[7], border: darkColors[4], text: darkColors[0] },
    light: { page: light.page, nav: light.chrome, card: light.card, border: light.border, text: light.text },
  },
};
