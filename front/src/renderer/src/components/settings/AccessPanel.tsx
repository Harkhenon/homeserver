import { useEffect, useState } from 'react';
import {
  Stack, Text, RadioGroup, Radio, Button, Alert, Group, ThemeIcon, Badge, Divider, TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconWorld, IconLock, IconServerCog, IconShieldLock } from '@tabler/icons-react';
import { useModuleQuery, useModuleAction } from '../../api/hooks';

interface AccessStatus {
  host: string;
  port: number;
  secureCookies: boolean;
  envFile: string | null;
}

interface HttpsStatus {
  enabled: boolean;
  domain: string | null;
}

export function AccessPanel() {
  const { data, reload } = useModuleQuery<AccessStatus>('system', 'access.status');
  const https = useModuleQuery<HttpsStatus>('system', 'https.status');
  const action = useModuleAction('system');
  const [choice, setChoice] = useState<string>('');
  const [domain, setDomain] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (data) setChoice(data.host === '0.0.0.0' ? 'public' : 'local');
  }, [data]);

  const httpsActive = https.data?.enabled === true && !!https.data.domain;
  const publicSelected = choice === 'public';
  const currentPublic = data?.host === '0.0.0.0';
  const dirty = data !== null && ((publicSelected && !currentPublic) || (!publicSelected && currentPublic));

  const apply = async () => {
    const res = await action.run<{ host: string; restarted: boolean }>('access.set', {
      host: publicSelected ? '0.0.0.0' : '127.0.0.1',
    });
    if (res) {
      notifications.show({
        message: publicSelected
          ? 'Panel accessible depuis le réseau — le service redémarre'
          : 'Panel restreint au local — le service redémarre',
        color: 'green',
      });
      setTimeout(() => void reload(), 4000);
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  const setupHttps = async () => {
    const res = await action.run<{ url: string }>('https.setup', { domain: domain.trim(), email: email.trim() });
    if (res) {
      notifications.show({
        message: `Panel passé en HTTPS : ${res.url} — rechargement en cours`,
        color: 'green',
        autoClose: 10000,
      });
      setTimeout(() => { void reload(); void https.reload(); }, 4000);
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red', autoClose: 10000 });
    }
  };

  const revertHttps = async () => {
    const res = await action.run<{ https: boolean }>('https.revert');
    if (res) {
      notifications.show({ message: 'HTTPS retiré — retour en HTTP sur IP', color: 'green' });
      setTimeout(() => { void reload(); void https.reload(); }, 4000);
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  return (
    <Stack>
      <Group gap="sm" align="center">
        <ThemeIcon variant="light" size={36} radius="md" color={currentPublic ? 'teal' : 'orange'}>
          {currentPublic ? <IconWorld size={18} stroke={1.5} /> : <IconLock size={18} stroke={1.5} />}
        </ThemeIcon>
        <div>
          <Text size="sm" fw={600}>Accès au panel</Text>
          <Group gap="xs">
            <Badge variant="light" color={currentPublic ? 'green' : 'orange'}>
              {currentPublic ? 'En ligne (HTTP)' : 'Local uniquement'}
            </Badge>
            {data && (
              <Text size="xs" c="dimmed">
                {currentPublic ? `<IP-serveur>:${data.port}` : `127.0.0.1:${data.port}`}
              </Text>
            )}
          </Group>
        </div>
      </Group>

      <Alert color="blue" variant="light">
        <Text size="xs">
          <b>En ligne</b> : le panel répond sur toutes les interfaces, accessible via
          <code> http://&lt;IP-serveur&gt;:{data?.port ?? 3000}</code>. Pratique pour démarrer, mais
          le trafic transite en HTTP non chiffré — réserve cet usage à un réseau de confiance.
        </Text>
        <Text size="xs" mt="xs">
          <b>Local uniquement</b> : le panel n'écoute plus que sur 127.0.0.1. Pour l'utiliser à
          distance, passe par le HTTPS ci-dessous ou un reverse-proxy manuel.
        </Text>
      </Alert>

      <RadioGroup value={choice} onChange={setChoice}>
        <Stack gap="md">
          <Radio value="public" label="En ligne (HTTP direct sur l'IP)" />
          <Radio value="local" label="Local uniquement (127.0.0.1)" />
        </Stack>
      </RadioGroup>

      <Group>
        <Button size="sm" loading={action.loading} disabled={!dirty || httpsActive} onClick={() => void apply()}>
          Appliquer et redémarrer le panel
        </Button>
        {dirty && !httpsActive && (
          <Text size="xs" c="orange">Redémarrage court du panel — tu seras déconnecté.</Text>
        )}
        {httpsActive && (
          <Text size="xs" c="dimmed">Géré par le HTTPS ci-dessous.</Text>
        )}
      </Group>

      <Divider my="md" label="HTTPS (certificat Let's Encrypt)" labelPosition="center" />

      <Group gap="sm" align="center">
        <ThemeIcon variant="light" size={36} radius="md" color={httpsActive ? 'teal' : 'gray'}>
          <IconShieldLock size={18} stroke={1.5} />
        </ThemeIcon>
        <div>
          <Text size="sm" fw={600}>Panel en HTTPS avec certificat valide</Text>
          <Group gap="xs">
            <Badge variant="light" color={httpsActive ? 'green' : 'gray'}>
              {httpsActive ? `https://${https.data?.domain}` : 'Désactivé'}
            </Badge>
          </Group>
        </div>
      </Group>

      {httpsActive ? (
        <Stack>
          <Alert color="green" variant="light">
            Le panel est servi en HTTPS via Apache avec un certificat Let's Encrypt (renouvellement
            automatique par certbot). L'accès HTTP sur l'IP est remplacé par
            <code> https://{https.data?.domain}</code> — redirection automatique du port 80.
          </Alert>
          <Button
            size="sm"
            color="orange"
            variant="light"
            style={{ alignSelf: 'flex-start' }}
            loading={action.loading}
            onClick={() => void revertHttps()}
          >
            Retirer le HTTPS (retour HTTP sur IP)
          </Button>
        </Stack>
      ) : (
        <Stack>
          <Alert color="blue" variant="light">
            Passe le panel en HTTPS avec un certificat <b>valide</b> (Let's Encrypt). Prérequis : un
            nom de domaine qui pointe vers ce serveur (enregistrement A) et le port 80 accessible
            depuis Internet pour la validation. Le panel écoutera ensuite uniquement en local,
            servi par Apache en TLS.
          </Alert>
          <Group gap="sm" align="flex-start" grow>
            <TextInput
              label="Domaine du panel"
              placeholder="panel.exemple.fr"
              value={domain}
              onChange={(e) => setDomain(e.currentTarget.value)}
            />
            <TextInput
              label="Email Let's Encrypt"
              placeholder="admin@exemple.fr"
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
            />
          </Group>
          <Group>
            <Button
              size="sm"
              loading={action.loading}
              disabled={!domain.includes('.') || !email.includes('@')}
              onClick={() => void setupHttps()}
            >
              Activer le HTTPS
            </Button>
            <Group gap={4}>
              <IconServerCog size={14} stroke={1.5} />
              <Text size="xs" c="dimmed">
                Émission du certificat (~30 s) — le panel redémarre, tu seras déconnecté.
              </Text>
            </Group>
          </Group>
        </Stack>
      )}
    </Stack>
  );
}
