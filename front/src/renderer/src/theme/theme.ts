import { createTheme, type MantineColorsTuple } from '@mantine/core';

// Palette dark ordonnée clair -> sombre (convention Mantine: dark[0] = texte principal en dark)
const darkColors: MantineColorsTuple = [
  '#e9ecef', // 0 texte principal
  '#cdd2d8', // 1 texte secondaire
  '#9aa1a9', // 2 texte atténué
  '#6e7681', // 3 texte discret
  '#3a3f47', // 4 bordures
  '#2b3037', // 5 survols / actif
  '#23272d', // 6 surfaces élevées
  '#1b1f24', // 7 cartes
  '#15181d', // 8 navbar / header
  '#0f1115', // 9 fond de page
];

const freshGray: MantineColorsTuple = [
  '#f4f6f8',
  '#e4e8ec',
  '#c9cfd6',
  '#aab2bc',
  '#8f99a6',
  '#7e8896',
  '#737e8d',
  '#636d7d',
  '#576071',
  '#4a5265',
];

export function buildTheme(accent: string) {
  return createTheme({
    primaryColor: accent,
    primaryShade: 5,
    defaultRadius: 'lg',
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    colors: {
      dark: darkColors,
      gray: freshGray,
    },
    headings: {
      fontWeight: '650',
    },
    components: {
      Card: {
        defaultProps: { padding: 'lg', radius: 'lg', withBorder: true },
        styles: {
          root: {
            background: 'var(--mantine-color-dark-7)',
            borderColor: 'var(--mantine-color-dark-4)',
          },
        },
      },
      Paper: {
        defaultProps: { radius: 'lg', shadow: 'none' },
      },
      AppShell: {
        styles: {
          root: { background: 'var(--mantine-color-dark-9)' },
          header: {
            backgroundColor: 'var(--mantine-color-dark-8)',
            borderBottom: '1px solid var(--mantine-color-dark-4)',
          },
          navbar: {
            backgroundColor: 'var(--mantine-color-dark-8)',
            borderRight: '1px solid var(--mantine-color-dark-4)',
          },
          main: { background: 'transparent' },
        },
      },
      NavLink: {
        styles: {
          root: {
            borderRadius: 'var(--mantine-radius-md)',
            marginTop: '2px',
            '&[data-active]': {
              '&:not(:hover)': { backgroundColor: 'var(--mantine-color-dark-5)' },
            },
            '&:hover': { backgroundColor: 'var(--mantine-color-dark-6)' },
          },
        },
      },
      Table: {
        defaultProps: { highlightOnHover: true, verticalSpacing: 'sm', horizontalSpacing: 'md' },
        styles: {
          th: {
            color: 'var(--mantine-color-dark-3)',
            fontWeight: 600,
            fontSize: 'var(--mantine-font-size-xs)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          },
          td: { color: 'var(--mantine-color-dark-1)' },
        },
      },
      Badge: {
        defaultProps: { variant: 'light', radius: 'sm', size: 'sm' },
      },
      ActionIcon: {
        defaultProps: { variant: 'default' },
      },
      SegmentedControl: {
        defaultProps: { radius: 'md' },
      },
      Tooltip: {
        defaultProps: { color: 'dark', withArrow: true, radius: 'md' },
      },
      Menu: {
        styles: {
          dropdown: {
            backgroundColor: 'var(--mantine-color-dark-7)',
            border: '1px solid var(--mantine-color-dark-4)',
          },
          item: { color: 'var(--mantine-color-dark-1)' },
        },
      },
      Modal: {
        styles: {
          content: {
            backgroundColor: 'var(--mantine-color-dark-7)',
            border: '1px solid var(--mantine-color-dark-4)',
          },
          header: { backgroundColor: 'transparent' },
        },
      },
      Text: {
        styles: { root: { color: 'var(--mantine-color-dark-1)' } },
      },
      Title: {
        styles: { root: { color: 'var(--mantine-color-dark-0)' } },
      },
    },
  });
}
