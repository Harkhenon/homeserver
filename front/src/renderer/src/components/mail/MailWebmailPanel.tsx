import { useState } from 'react';
import { Alert, Anchor, Badge, Button, Card, Group, Stack, Text } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import { mailCall } from './MailboxesPanel';
import type { MailStatus } from '../../types';

/** Webmail Roundcube, commun à tous les domaines. */
export function MailWebmailPanel({ status, onChanged }: { status: MailStatus; onChanged: () => void }) {
  const { webmail } = status;
  const [busy, setBusy] = useState(false);
  const blocked = !webmail.available || !webmail.webServer;

  const toggle = async () => {
    setBusy(true);
    const res = await mailCall('webmail.set', { enabled: !webmail.enabled }, webmail.enabled ? 'Webmail désactivé' : 'Webmail activé');
    setBusy(false);
    if (res) onChanged();
  };

  return (
    <Stack maw={720}>
      <Card withBorder>
        <Group justify="space-between" mb="xs">
          <Text fw={600}>Roundcube</Text>
          {webmail.enabled
            ? <Badge variant="light" color={webmail.active ? 'teal' : 'red'}>{webmail.active ? 'Actif' : 'En panne'}</Badge>
            : <Badge variant="light" color="gray">Désactivé</Badge>}
        </Group>
        <Text size="sm" c="dimmed" mb="md">
          Lire et envoyer ses messages depuis un navigateur, et changer soi-même son mot de passe.
          Connexion avec l'adresse e-mail complète et le mot de passe de la boîte.
        </Text>
        {webmail.enabled && webmail.url && (
          <Group gap="xs" mb="md">
            <Anchor href={webmail.url} target="_blank" rel="noopener noreferrer" size="sm" style={{ wordBreak: 'break-all' }}>{webmail.url}</Anchor>
            <IconExternalLink size={14} stroke={1.5} />
          </Group>
        )}
        {!webmail.available && <Alert variant="light" color="orange" mb="md">Roundcube n'est pas disponible dans les dépôts de cette distribution.</Alert>}
        {webmail.available && !webmail.webServer && <Alert variant="light" color="orange" mb="md">Aucun serveur web actif : le webmail a besoin d'Apache ou de Nginx.</Alert>}
        {webmail.enabled && status.tls.mode !== 'letsencrypt' && (
          <Alert variant="light" color="orange" mb="md">Certificat auto-signé : les navigateurs afficheront un avertissement. Installe un certificat Let's Encrypt depuis la carte Certificat.</Alert>
        )}
        {!webmail.enabled && !blocked && (
          <Alert variant="light" color="blue" mb="md">
            Installe Roundcube et PHP-FPM, et ouvre les ports 80 et 443 si un pare-feu est actif. Comptez quelques minutes et environ 100 Mo de RAM à l'usage.
            Le webmail répond à l'adresse https://{status.hostname}/.
          </Alert>
        )}
        <Group justify="flex-end">
          <Button loading={busy} variant={webmail.enabled ? 'light' : 'filled'} color={webmail.enabled ? 'orange' : undefined} disabled={blocked && !webmail.enabled} onClick={() => void toggle()}>
            {webmail.enabled ? 'Désactiver' : 'Activer le webmail'}
          </Button>
        </Group>
      </Card>
      {webmail.enabled && (
        <Text size="xs" c="dimmed">
          Désactiver retire le site et conserve les réglages, contacts et signatures des utilisateurs.
          Ces données du webmail ne font pas partie des sauvegardes de messagerie.
        </Text>
      )}
    </Stack>
  );
}
