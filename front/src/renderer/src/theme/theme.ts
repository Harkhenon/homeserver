import { createTheme, type MantineColorsTuple } from '@mantine/core';

export const darkColors: MantineColorsTuple = [
  '#0b0d0f', '#1a1d20', '#24272b', '#2e3236', '#363b40',
  '#3c4247', '#424851', '#484f5b', '#4e5666', '#545e70',
];

const freshGray: MantineColorsTuple = [
  '#f5f6f7', '#e6e8ea', '#cdd1d5', '#b2b8bf', '#9aa1a9',
  '#89909a', '#7f8792', '#6b7380', '#5c6470', '#4a5160',
];

export function buildTheme(accent: string) {
  return createTheme({
    primaryColor: accent,
    defaultRadius: 'md',
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    colors: {
      dark: darkColors,
      gray: freshGray,
    },
    headings: {
      fontWeight: '600',
    },
    components: {
      Card: {
        defaultProps: { bg: 'var(--mantine-color-dark-7)' },
      },
      Table: {
        defaultProps: { highlightOnHover: true, verticalSpacing: 'sm' },
      },
      Paper: {
        defaultProps: { radius: 'md' },
      },
    },
  });
}
