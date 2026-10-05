import { useState } from 'react';
import {
  Stack,
  Tabs,
  Select,
  TextInput,
  Text,
  Button,
  Divider,
  Switch,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconSettings } from '@tabler/icons-react';
import { PageHeader } from '../components';
import { ACCENT_COLORS, type AccentColor } from '../theme/colors';
import { VersionsPanel } from '../components/settings/VersionsPanel';

const LANGUAGES = [
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'de', label: 'Deutsch' },
] as const;

interface SettingsPageProps {
  accent: AccentColor;
  onAccentChange: (color: AccentColor) => void;
}

export function SettingsPage({ accent, onAccentChange }: SettingsPageProps) {
  const [language, setLanguage] = useState('fr');
  const [panelName, setPanelName] = useState('Homeserver');
  const [autoUpdates, setAutoUpdates] = useState(true);

  const saveGeneral = () => {
    notifications.show({
      message: 'Paramètres enregistrés (fonction de test)',
      color: 'green',
    });
  };

  return (
    <div>
      <PageHeader
        icon={IconSettings}
        title="Paramètres"
        description="Configuration du panel Homeserver"
      />
      <Tabs defaultValue="versions">
        <Tabs.List>
          <Tabs.Tab value="versions">Versions par défaut</Tabs.Tab>
          <Tabs.Tab value="general">Général</Tabs.Tab>
          <Tabs.Tab value="appearance">Apparence</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="versions" pt="md">
          <VersionsPanel />
        </Tabs.Panel>

        <Tabs.Panel value="general" pt="md">
          <Stack>
            <TextInput
              label="Nom du panel"
              value={panelName}
              onChange={(e) => setPanelName(e.currentTarget.value)}
            />
            <Select
              label="Langue"
              placeholder="Choisir une langue"
              data={LANGUAGES.map((l) => ({ value: l.value, label: l.label }))}
              value={language}
              onChange={(v) => v && setLanguage(v)}
            />
            <Switch
              label="Mises à jour automatiques des composants"
              checked={autoUpdates}
              onChange={(e) => setAutoUpdates(e.currentTarget.checked)}
            />
            <Divider my={4} />
            <Button
              size="sm"
              variant="light"
              onClick={saveGeneral}
              style={{ alignSelf: 'flex-start' }}
            >
              Enregistrer
            </Button>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="appearance" pt="md">
          <Stack>
            <Select
              label="Couleur d'accentuation du panel"
              placeholder="Choisir une couleur"
              data={ACCENT_COLORS.map((c) => ({ value: c.value, label: c.label }))}
              value={accent}
              onChange={(v) => v && onAccentChange(v as AccentColor)}
            />
            <Text size="xs" c="dimmed">
              La couleur s'applique instantanément et est mémorisée.
            </Text>
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
