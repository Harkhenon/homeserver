import { useEffect, useState } from 'react';
import {
  Stack, Text, RadioGroup, Radio, Button, Alert, Group, ThemeIcon, Badge, Divider,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconWorld, IconLock, IconServerCog } from '@tabler/icons-react';
import { useModuleQuery, useModuleAction } from '../../api/hooks';

interface AccessStatus {
  host: string;
  port: number;
  secureCookies: boolean;
  envFile: string | null;
}

export function AccessPanel() {
  const { data, reload } = useModuleQuery<AccessStatus>('system', 'access.status');
  const action = useModuleAction('system');
  const [choice, setChoice] = useState<string>('');

  useEffect(() => {
    if (data) setChoice(data.host === '0.0.0.0' ? 'public' : 'local');
  }, [data]);

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
              {currentPublic ? 'En ligne' : 'Local uniquement'}
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
          <b>En ligne</b> : le panel répond sur toutes les interfaces (comme cPanel ou DirectAdmin),
          accessible via <code>http://&lt;IP-serveur&gt;:{data?.port ?? 3000}</code> depuis n'importe
          où sur le réseau. Pratique pour commencer, mais le trafic transite en HTTP non chiffré :
          réserve cet usage à un réseau de confiance (VM locale, LAN) ou passe derrière un
          reverse-proxy HTTPS dès que possible.
        </Text>
        <Text size="xs" mt="xs">
          <b>Local uniquement</b> : le panel n'écoute plus que sur 127.0.0.1 et devient inaccessible
          depuis l'extérieur. Pour l'utiliser à distance, configure un reverse-proxy Apache/Nginx
          avec TLS (certificat Let's Encrypt via le module SSL) qui proxifie vers
          <code> 127.0.0.1:{data?.port ?? 3000}</code>. Les cookies de session redeviennent
          <code> Secure</code> automatiquement.
        </Text>
      </Alert>

      <Divider my={4} />

      <RadioGroup value={choice} onChange={setChoice}>
        <Stack gap="md">
          <Radio value="public" label="En ligne (recommandé pour démarrer)" />
          <Radio value="local" label="Local uniquement (derrière reverse-proxy HTTPS)" />
        </Stack>
      </RadioGroup>

      <Group>
        <Button size="sm" loading={action.loading} disabled={!dirty} onClick={() => void apply()}>
          Appliquer et redémarrer le panel
        </Button>
        {dirty && (
          <Text size="xs" c="orange">
            Redémarrage court du panel (quelques secondes) — tu seras déconnecté.
          </Text>
        )}
      </Group>
    </Stack>
  );
}
