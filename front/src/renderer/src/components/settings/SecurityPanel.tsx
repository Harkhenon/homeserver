import { useState } from 'react';
import {
  Stack, Text, Badge, Button, Group, ThemeIcon, Alert, Divider, Code, Table, PinInput, Modal,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconShieldLock, IconCircleCheck, IconShieldOff } from '@tabler/icons-react';
import { QRCodeSVG } from 'qrcode.react';
import { authApi } from '../../api/client';

interface MeInfo {
  username: string;
  totpEnabled: boolean;
}

interface TotpSetup {
  secret: string;
  otpauthUrl: string;
}

interface Attempt {
  at: string;
  ip: string;
  username: string;
  success: boolean;
}

export function SecurityPanel() {
  const [me, setMe] = useState<MeInfo | null>(null);
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempts, setAttempts] = useState<Attempt[] | null>(null);
  const [showDisable, setShowDisable] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');

  const loadMe = async () => {
    try { setMe(await authApi.me()); } catch { /* 401 géré globalement */ }
  };
  if (me === null) void loadMe();

  const loadAttempts = async () => {
    try {
      const res = await authApi.attempts();
      setAttempts(res.attempts);
    } catch { /* ignore */ }
  };
  if (attempts === null) void loadAttempts();

  const startSetup = async () => {
    setBusy(true);
    try {
      const res = await authApi.totpSetup();
      if (!res.secret || !res.otpauthUrl) {
        notifications.show({ message: 'Impossible de générer le secret 2FA', color: 'orange' });
      } else {
        setSetup({ secret: res.secret, otpauthUrl: res.otpauthUrl });
      }
    } catch (err) {
      notifications.show({ message: err instanceof Error ? err.message : 'Erreur', color: 'red' });
    } finally {
      setBusy(false);
    }
  };

  const confirmEnable = async () => {
    if (code.length !== 6) return;
    setBusy(true);
    try {
      await authApi.totpEnable(setup?.secret ?? '', code);
      notifications.show({ message: '2FA activée', color: 'green' });
      setSetup(null);
      setCode('');
      setMe({ username: me?.username ?? 'admin', totpEnabled: true });
    } catch (err) {
      notifications.show({ message: err instanceof Error ? err.message : 'Erreur', color: 'red' });
    } finally {
      setBusy(false);
    }
  };

  const confirmDisable = async () => {
    setBusy(true);
    try {
      await authApi.totpDisable(disablePassword, disableCode);
      notifications.show({ message: '2FA désactivée', color: 'blue' });
      setShowDisable(false);
      setDisablePassword('');
      setDisableCode('');
      setMe({ username: me?.username ?? 'admin', totpEnabled: false });
    } catch (err) {
      notifications.show({ message: err instanceof Error ? err.message : 'Erreur', color: 'red' });
    } finally {
      setBusy(false);
    }
  };

  const totpEnabled = me?.totpEnabled ?? false;

  return (
    <Stack>
      <Group gap="sm" align="center">
        <ThemeIcon variant="light" size={36} radius="md" color={totpEnabled ? 'teal' : 'orange'}>
          <IconShieldLock size={18} stroke={1.5} />
        </ThemeIcon>
        <div>
          <Text size="sm" fw={600}>Double authentification (2FA)</Text>
          <Group gap="xs">
            <Badge variant="light" color={totpEnabled ? 'green' : 'orange'}>
              {totpEnabled ? 'Activée' : 'Désactivée'}
            </Badge>
            <Text size="xs" c="dimmed">Application d'authentification (TOTP)</Text>
          </Group>
        </div>
      </Group>

      {!totpEnabled && !setup && (
        <Button size="sm" style={{ alignSelf: 'flex-start' }} loading={busy} onClick={() => void startSetup()}>
          Activer la 2FA
        </Button>
      )}

      {setup && (
        <Stack>
          <Alert color="blue" variant="light">
            Scanne le QR code avec ton application (Google Authenticator, Authy, Aegis…),
            puis saisis le code à 6 chiffres pour confirmer.
          </Alert>
          <Group gap="xl" align="flex-start">
            <QRCodeSVG value={setup.otpauthUrl} size={160} />
            <Stack gap={4}>
              <Text size="xs" c="dimmed">Ou saisis ce secret manuellement :</Text>
              <Code>{setup.secret}</Code>
            </Stack>
          </Group>
          <Divider />
          <Stack gap={4}>
            <Text size="sm" fw={500}>Code de vérification</Text>
            <PinInput length={6} type="number" value={code} onChange={setCode} />
          </Stack>
          <Group>
            <Button size="sm" loading={busy} onClick={() => void confirmEnable()}>Confirmer l'activation</Button>
            <Button size="sm" variant="subtle" onClick={() => { setSetup(null); setCode(''); }}>Annuler</Button>
          </Group>
        </Stack>
      )}

      {totpEnabled && (
        <Button size="sm" color="orange" variant="light" style={{ alignSelf: 'flex-start' }} onClick={() => setShowDisable(true)}>
          Désactiver la 2FA
        </Button>
      )}

      <Divider my="xs" label="Tentatives de connexion récentes" labelPosition="center" />
      {attempts !== null && attempts.length > 0 ? (
        <Table.ScrollContainer minWidth={500}>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Date</Table.Th>
                <Table.Th>IP</Table.Th>
                <Table.Th>Utilisateur</Table.Th>
                <Table.Th>Résultat</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {attempts.slice(0, 15).map((a, i) => (
                <Table.Tr key={i}>
                  <Table.Td c="dimmed" fz="sm">{new Date(a.at).toLocaleString('fr-FR')}</Table.Td>
                  <Table.Td fz="sm">{a.ip}</Table.Td>
                  <Table.Td c="dimmed" fz="sm">{a.username}</Table.Td>
                  <Table.Td>
                    {a.success
                      ? <Group gap={4}><IconCircleCheck size={14} stroke={1.5} /><Text size="xs" c="teal">OK</Text></Group>
                      : <Group gap={4}><IconShieldOff size={14} stroke={1.5} /><Text size="xs" c="red">Échec</Text></Group>}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      ) : (
        <Text size="sm" c="dimmed">Aucune tentative enregistrée.</Text>
      )}
      {(attempts ?? []).length > 0 && (
        <Button
          size="compact-xs"
          variant="subtle"
          color="dimmed"
          style={{ alignSelf: 'flex-start' }}
          onClick={async () => {
            try {
              await authApi.clearAttempts();
              setAttempts([]);
              notifications.show({ message: 'Journal des tentatives purgé', color: 'green' });
            } catch (err) {
              notifications.show({ message: err instanceof Error ? err.message : 'Erreur', color: 'red' });
            }
          }}
        >
          Purger le journal
        </Button>
      )}

      <Modal opened={showDisable} onClose={() => setShowDisable(false)} title="Désactiver la 2FA" size="sm">
        <Stack>
          <Text size="sm" c="dimmed">Confirme avec ton mot de passe et un code 2FA valide.</Text>
          <PinInput length={6} type="number" value={disableCode} onChange={setDisableCode} />
          <Button
            size="sm"
            color="orange"
            loading={busy}
            disabled={disableCode.length !== 6}
            onClick={() => void confirmDisable()}
          >
            Désactiver
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
