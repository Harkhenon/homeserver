import { useState } from 'react';
import {
  Stack,
  Tabs,
  Select,
  TextInput,
  Button,
  Divider,
  Switch,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconSettings } from '@tabler/icons-react';
import { PageHeader } from '../components';
import { VersionsPanel } from '../components/settings/VersionsPanel';
import { UpdatePanel } from '../components/settings/UpdatePanel';
import { SecurityPanel } from '../components/settings/SecurityPanel';
import { AccessPanel } from '../components/settings/AccessPanel';
import { AppearancePanel } from '../components/settings/AppearancePanel';

const LANGUAGES = [
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'de', label: 'Deutsch' },
] as const;

export function SettingsPage() {
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
          <Tabs.Tab value="update">Mise à jour</Tabs.Tab>
          <Tabs.Tab value="security">Sécurité</Tabs.Tab>
          <Tabs.Tab value="access">Accès réseau</Tabs.Tab>
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
          <AppearancePanel />
        </Tabs.Panel>
        <Tabs.Panel value="update" pt="md">
          <UpdatePanel />
        </Tabs.Panel>
        <Tabs.Panel value="security" pt="md">
          <SecurityPanel />
        </Tabs.Panel>
        <Tabs.Panel value="access" pt="md">
          <AccessPanel />
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
