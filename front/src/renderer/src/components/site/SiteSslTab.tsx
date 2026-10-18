import { useState } from 'react';
import {
  Stack, Text, Badge, Button, Group, Alert, TextInput, Divider, ThemeIcon,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconLock, IconLockOpen, IconRefresh } from '@tabler/icons-react';
import { useModuleQuery, useModuleAction } from '../../api/hooks';
import type { Vhost, NginxVhost } from '../../types';

interface CertInfo {
  domain: string;
  subject: string;
  issuer: string;
  expiresAt: string | null;
  daysLeft: number | null;
  autoRenew: boolean;
}

interface SiteSslTabProps {
  vhost: Vhost | NginxVhost;
}

export function SiteSslTab({ vhost }: SiteSslTabProps) {
  const certs = useModuleQuery<{ domains: string[]; count: number }>('ssl', 'certs.list');
  const sslAction = useModuleAction('ssl');
  const [email, setEmail] = useState('');

  const hasCert = (certs.data?.domains ?? []).includes(vhost.domain)
    || (certs.data?.domains ?? []).some((d) => vhost.aliases.includes(d));
  const certDomain = (certs.data?.domains ?? []).includes(vhost.domain)
    ? vhost.domain
    : (certs.data?.domains ?? []).find((d) => vhost.aliases.includes(d)) ?? vhost.domain;

  const cert = useModuleQuery<CertInfo | null>(
    'ssl', 'certs.info', hasCert ? { domain: certDomain } : undefined,
    { enabled: hasCert },
  );

  const issue = async () => {
    const res = await sslAction.run('certs.issue', { domain: vhost.domain, email });
    if (res !== null) {
      notifications.show({ message: `Certificat émis pour ${vhost.domain}`, color: 'green' });
      void certs.reload();
    } else if (sslAction.error) {
      notifications.show({ message: sslAction.error, color: 'red' });
    }
  };

  const renew = async () => {
    const res = await sslAction.run('certs.renew', { domain: certDomain });
    if (res !== null) {
      notifications.show({ message: `Certificat renouvelé pour ${certDomain}`, color: 'green' });
      void cert.reload();
    } else if (sslAction.error) {
      notifications.show({ message: sslAction.error, color: 'red' });
    }
  };

  return (
    <Stack>
      <Group gap="sm" align="center">
        <ThemeIcon variant="light" size={36} radius="md" color={hasCert ? 'teal' : 'orange'}>
          {hasCert ? <IconLock size={18} stroke={1.5} /> : <IconLockOpen size={18} stroke={1.5} />}
        </ThemeIcon>
        <div>
          <Text size="sm" fw={600}>Certificat Let's Encrypt</Text>
          <Group gap="xs">
            <Badge variant="light" color={hasCert ? 'green' : 'orange'}>
              {hasCert ? 'Émis' : 'Aucun'}
            </Badge>
            {hasCert && cert.data?.daysLeft !== null && cert.data?.daysLeft !== undefined && (
              <Text size="xs" c="dimmed">
                Expire dans {cert.data.daysLeft} jours
              </Text>
            )}
          </Group>
        </div>
      </Group>

      {hasCert && cert.data && (
        <Stack gap="xs">
          <Group justify="space-between">
            <Text size="sm" c="dimmed">Domaine du certificat</Text>
            <Text size="sm" fw={500}>{cert.data.subject || cert.data.domain}</Text>
          </Group>
          <Group justify="space-between">
            <Text size="sm" c="dimmed">Émetteur</Text>
            <Text size="sm" fw={500}>{cert.data.issuer}</Text>
          </Group>
          <Group justify="space-between">
            <Text size="sm" c="dimmed">Expiration</Text>
            <Text size="sm" fw={500}>
              {cert.data.expiresAt ? new Date(cert.data.expiresAt).toLocaleDateString('fr-FR') : '—'}
            </Text>
          </Group>
          <Group justify="space-between">
            <Text size="sm" c="dimmed">Renouvellement auto</Text>
            <Badge variant="light" color={cert.data.autoRenew ? 'green' : 'orange'}>
              {cert.data.autoRenew ? 'Actif' : 'Inactif'}
            </Badge>
          </Group>
          <Button
            size="sm"
            variant="light"
            style={{ alignSelf: 'flex-start' }}
            leftSection={<IconRefresh size={14} stroke={1.5} />}
            loading={sslAction.loading}
            onClick={() => void renew()}
          >
            Renouveler maintenant
          </Button>
        </Stack>
      )}

      {!hasCert && (
        <Stack>
          <Alert color="blue" variant="light">
            Aucun certificat pour ce site. Émets un certificat Let's Encrypt gratuit —
            le domaine doit pointer vers ce serveur (port 80 ouvert) pour la validation.
          </Alert>
          <Group gap="sm" align="flex-start">
            <TextInput
              label="Email pour Let's Encrypt"
              placeholder="admin@exemple.fr"
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
              w={280}
            />
            <Button
              mt={22}
              size="sm"
              loading={sslAction.loading}
              disabled={!email.includes('@')}
              onClick={() => void issue()}
            >
              Émettre le certificat
            </Button>
          </Group>
        </Stack>
      )}
      <Divider my={4} />
      <Text size="xs" c="dimmed">
        Le HTTPS du vhost est géré automatiquement à l'émission du certificat (module SSL + rechargement du serveur web).
      </Text>
    </Stack>
  );
}
