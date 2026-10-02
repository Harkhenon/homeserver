import { createTheme, type MantineColorsTuple } from '@mantine/core';

const darkColors: MantineColorsTuple = [
  '#0f1115',
  '#15181d',
  '#1b1f25',
  '#21262d',
  '#282d35',
  '#2e343d',
  '#353b45',
  '#3d434e',
  '#454c58',
  '#4e5563',
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
            background: 'var(--mantine-color-dark-1)',
            borderColor: 'var(--mantine-color-dark-4)',
          },
        },
      },
      Paper: {
        defaultProps: { radius: 'lg', shadow: 'none' },
      },
      AppShell: {
        styles: {
          root: { background: 'var(--mantine-color-dark-0)' },
          header: {
            backgroundColor: 'var(--mantine-color-dark-1)',
            borderBottom: '1px solid var(--mantine-color-dark-4)',
          },
          navbar: {
            backgroundColor: 'var(--mantine-color-dark-1)',
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
              '&:not(:hover)': { backgroundColor: 'var(--mantine-color-dark-4)' },
            },
            '&:hover': { backgroundColor: 'var(--mantine-color-dark-3)' },
          },
        },
      },
      Table: {
        defaultProps: { highlightOnHover: true, verticalSpacing: 'sm', horizontalSpacing: 'md' },
        styles: {
          th: {
            color: 'var(--mantine-color-dimmed)',
            fontWeight: 600,
            fontSize: 'var(--mantine-font-size-xs)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          },
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
    },
  });
}
