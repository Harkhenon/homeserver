import { createContext, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { MantineProvider } from '@mantine/core';
import { useColorScheme } from '@mantine/hooks';
import type { AccentColor } from './colors';
import type { ColorScheme, ColorSchemePreference, PanelTheme } from './types';
import { getPanelTheme } from './registry';

// Clés localStorage : à garder synchronisées avec public/theme-init.js (anti-flash au démarrage).
const STORAGE_THEME = 'hs_theme';
const STORAGE_SCHEME = 'hs_color_scheme';
const STORAGE_ACCENT = 'hs_accent';

interface AppearanceContextValue {
  theme: PanelTheme;
  setThemeId: (id: string) => void;
  colorSchemePreference: ColorSchemePreference;
  setColorSchemePreference: (pref: ColorSchemePreference) => void;
  /** Schéma effectivement appliqué (préférence + support du thème + système). */
  colorScheme: ColorScheme;
  accent: AccentColor;
  setAccent: (color: AccentColor) => void;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

function readPreference(): ColorSchemePreference {
  const v = localStorage.getItem(STORAGE_SCHEME);
  return v === 'light' || v === 'dark' ? v : 'auto';
}

export function resolveColorScheme(theme: PanelTheme, pref: ColorSchemePreference, system: ColorScheme): ColorScheme {
  const wanted = pref === 'auto' ? system : pref;
  return theme.colorSchemes.includes(wanted) ? wanted : (theme.colorSchemes[0] ?? 'dark');
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState(() => getPanelTheme(localStorage.getItem(STORAGE_THEME)));
  const [colorSchemePreference, setPreferenceState] = useState(readPreference);
  const [accent, setAccentState] = useState<AccentColor>(
    (localStorage.getItem(STORAGE_ACCENT) as AccentColor) ?? 'green',
  );
  const systemScheme = useColorScheme('dark', { getInitialValueInEffect: false });
  const colorScheme = resolveColorScheme(theme, colorSchemePreference, systemScheme);

  const mantineTheme = useMemo(() => theme.build(accent), [theme, accent]);

  // Le sélecteur [data-hs-theme] est aussi posé par theme-init.js avant le rendu (fond de page).
  useLayoutEffect(() => {
    document.documentElement.dataset.hsTheme = theme.id;
  }, [theme]);

  const value = useMemo<AppearanceContextValue>(() => ({
    theme,
    setThemeId: (id) => {
      const next = getPanelTheme(id);
      setTheme(next);
      localStorage.setItem(STORAGE_THEME, next.id);
    },
    colorSchemePreference,
    setColorSchemePreference: (pref) => {
      setPreferenceState(pref);
      localStorage.setItem(STORAGE_SCHEME, pref);
    },
    colorScheme,
    accent,
    setAccent: (color) => {
      setAccentState(color);
      localStorage.setItem(STORAGE_ACCENT, color);
    },
  }), [theme, colorSchemePreference, colorScheme, accent]);

  return (
    <AppearanceContext.Provider value={value}>
      <MantineProvider
        theme={mantineTheme}
        cssVariablesResolver={theme.cssVariablesResolver}
        forceColorScheme={colorScheme}
      >
        {children}
      </MantineProvider>
    </AppearanceContext.Provider>
  );
}

export function useAppearance(): AppearanceContextValue {
  const ctx = useContext(AppearanceContext);
  if (!ctx) throw new Error('useAppearance doit être utilisé dans <AppearanceProvider>');
  return ctx;
}
