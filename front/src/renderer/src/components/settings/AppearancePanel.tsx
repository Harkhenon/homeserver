import { Box, CheckIcon, ColorSwatch, Group, SegmentedControl, SimpleGrid, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { IconDeviceDesktop, IconMoon, IconSun } from '@tabler/icons-react';
import { ACCENT_COLORS } from '../../theme/colors';
import { THEMES } from '../../theme/registry';
import { useAppearance } from '../../theme/AppearanceProvider';
import type { ColorSchemePreference, PanelTheme, ThemePreview } from '../../theme/types';

// Miniature du thème : fond de page, barre latérale et deux cartes.
function ThemeThumbnail({ preview }: { preview: ThemePreview }) {
  const bar = (w: string) => (
    <Box h={4} w={w} style={{ borderRadius: 2, background: preview.text, opacity: 0.55 }} />
  );
  return (
    <Box
      h={84}
      style={{
        display: 'flex',
        background: preview.page,
        borderRadius: 'var(--mantine-radius-sm)',
        border: `1px solid ${preview.border}`,
        overflow: 'hidden',
      }}
    >
      <Box w="26%" p={6} style={{ background: preview.nav, borderRight: `1px solid ${preview.border}` }}>
        <Stack gap={5}>
          <Box h={6} style={{ borderRadius: 2, background: 'var(--mantine-primary-color-filled)' }} />
          {bar('80%')}
          {bar('65%')}
          {bar('72%')}
        </Stack>
      </Box>
      <Group p={8} gap={6} align="flex-start" style={{ flex: 1 }} wrap="nowrap">
        {[0, 1].map((i) => (
          <Stack key={i} gap={5} p={6} style={{ flex: 1, background: preview.card, border: `1px solid ${preview.border}`, borderRadius: 4 }}>
            {bar('55%')}
            <Box h={8} w="40%" style={{ borderRadius: 2, background: preview.text }} />
            <Box h={3} style={{ borderRadius: 2, background: 'var(--mantine-primary-color-filled)', width: i ? '45%' : '70%' }} />
          </Stack>
        ))}
      </Group>
    </Box>
  );
}

function ThemeOption({ theme, selected, onSelect }: { theme: PanelTheme; selected: boolean; onSelect: () => void }) {
  const { colorScheme } = useAppearance();
  const preview = theme.preview[colorScheme] ?? theme.preview.dark ?? theme.preview.light;
  return (
    <UnstyledButton
      onClick={onSelect}
      aria-pressed={selected}
      p="sm"
      style={{
        borderRadius: 'var(--mantine-radius-md)',
        border: selected
          ? '2px solid var(--mantine-primary-color-filled)'
          : '2px solid var(--hs-border)',
        background: 'var(--hs-surface)',
      }}
    >
      <Stack gap="xs">
        {preview && <ThemeThumbnail preview={preview} />}
        <Group justify="space-between" wrap="nowrap">
          <Text fw={600} size="sm">{theme.label}</Text>
          <Text size="xs" c="dimmed">
            {theme.colorSchemes.length > 1 ? 'Clair · Sombre' : 'Sombre'}
          </Text>
        </Group>
        <Text size="xs" c="dimmed">{theme.description}</Text>
      </Stack>
    </UnstyledButton>
  );
}

const SCHEME_OPTIONS: Array<{ value: ColorSchemePreference; label: string; icon: typeof IconSun }> = [
  { value: 'auto', label: 'Système', icon: IconDeviceDesktop },
  { value: 'light', label: 'Clair', icon: IconSun },
  { value: 'dark', label: 'Sombre', icon: IconMoon },
];

export function AppearancePanel({ compact = false }: { compact?: boolean }) {
  const { theme, setThemeId, colorSchemePreference, setColorSchemePreference, accent, setAccent } = useAppearance();
  const multiScheme = theme.colorSchemes.length > 1;

  return (
    <Stack gap="lg" maw={compact ? undefined : 760}>
      <Stack gap="xs">
        <Text size="sm" fw={600}>Thème</Text>
        <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
          {THEMES.map((t) => (
            <ThemeOption key={t.id} theme={t} selected={t.id === theme.id} onSelect={() => setThemeId(t.id)} />
          ))}
        </SimpleGrid>
      </Stack>

      <Stack gap="xs">
        <Text size="sm" fw={600}>Mode</Text>
        <SegmentedControl
          value={multiScheme ? colorSchemePreference : theme.colorSchemes[0]}
          onChange={(v) => setColorSchemePreference(v as ColorSchemePreference)}
          disabled={!multiScheme}
          style={{ alignSelf: 'flex-start' }}
          data={SCHEME_OPTIONS.map((o) => ({
            value: o.value,
            label: (
              <Group gap={6} wrap="nowrap">
                <o.icon size={14} stroke={1.75} />
                <span>{o.label}</span>
              </Group>
            ),
          }))}
        />
        {!multiScheme && (
          <Text size="xs" c="dimmed">Le thème {theme.label} n'existe qu'en mode sombre.</Text>
        )}
      </Stack>

      <Stack gap="xs">
        <Text size="sm" fw={600}>Couleur d'accentuation</Text>
        <Group gap="xs">
          {ACCENT_COLORS.map((c) => (
            <Tooltip key={c.value} label={c.label} withinPortal>
              <ColorSwatch
                component="button"
                type="button"
                aria-label={c.label}
                aria-pressed={c.value === accent}
                color={`var(--mantine-color-${c.value}-filled)`}
                size={28}
                onClick={() => setAccent(c.value)}
                style={{ cursor: 'pointer', color: 'var(--mantine-color-white)' }}
              >
                {c.value === accent && <CheckIcon size={12} />}
              </ColorSwatch>
            </Tooltip>
          ))}
        </Group>
        <Text size="xs" c="dimmed">Les réglages s'appliquent instantanément et sont mémorisés sur ce navigateur.</Text>
      </Stack>
    </Stack>
  );
}
