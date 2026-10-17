import { useState } from 'react';
import {
  Modal, Stack, Text, Alert, Button, Group, Checkbox, Code, Textarea, Loader, Divider, ThemeIcon,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconKey, IconCircleCheck, IconShieldLock } from '@tabler/icons-react';
import { call } from '../api/client';

export interface SshHardeningState {
  passwordAuth: boolean;
  rootLogin: boolean;
  dropinApplied: boolean;
  users: Array<{
    username: string;
    keyCount: number;
    fingerprints: string[];
  }>;
}

function detectClientOs(): 'windows' | 'mac' | 'linux' {
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return 'windows';
  if (/Mac/i.test(ua)) return 'mac';
  return 'linux';
}

export function SshHardeningModal({
  opened,
  onClose,
  state,
  onApplied,
}: {
  opened: boolean;
  onClose: () => void;
  state: SshHardeningState | null;
  onApplied: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const clientOs = detectClientOs();
  const totalKeys = (state?.users ?? []).reduce((sum, u) => sum + u.keyCount, 0);
  const hardeningActive = state?.dropinApplied === true;
  const sshUserCandidates = (state?.users ?? []).map((u) => u.username);

  // Utilisateur cible par défaut : le premier utilisateur système avec shell trouvé
  const [targetUsername, setTargetUsername] = useState<string>('');
  const effectiveTarget = targetUsername || (sshUserCandidates[0] ?? '');

  const addKey = async () => {
    if (!effectiveTarget) {
      notifications.show({ message: 'Aucun utilisateur système cible trouvé pour la clé', color: 'red' });
      return;
    }
    setBusy(true);
    try {
      await call('users', 'sshKeys.add', { username: effectiveTarget, key: newKey.trim() });
      notifications.show({ message: `Clé ajoutée à ${effectiveTarget}`, color: 'green' });
      setNewKey('');
      onApplied(); // rafraîchir l'état
    } catch (err) {
      notifications.show({ message: err instanceof Error ? err.message : 'Erreur', color: 'red' });
    } finally {
      setBusy(false);
    }
  };

  const harden = async () => {
    setBusy(true);
    try {
      const res = await call<{ applied: boolean; keysCount?: number; reason?: string }>('system', 'security.ssh.harden');
      if (res.applied) {
        notifications.show({
          message: `SSH durci ✓ (${res.keysCount ?? totalKeys} clé(s) actives) — mots de passe et root SSH coupés`,
          color: 'green',
        });
        onApplied();
        onClose();
      } else {
        notifications.show({ message: res.reason ?? 'Durcissement non appliqué', color: 'orange' });
      }
    } catch (err) {
      notifications.show({ message: err instanceof Error ? err.message : 'Erreur', color: 'red' });
    } finally {
      setBusy(false);
    }
  };

  const revert = async () => {
    setBusy(true);
    try {
      await call('system', 'security.ssh.revert');
      notifications.show({ message: 'Durcissement retiré — mots de passe SSH réactivés', color: 'blue' });
      onApplied();
      onClose();
    } catch (err) {
      notifications.show({ message: err instanceof Error ? err.message : 'Erreur', color: 'red' });
    } finally {
      setBusy(false);
    }
  };

  const tutos: Record<'windows' | 'mac' | 'linux', { title: string; cmds: string[] }> = {
    windows: {
      title: 'Windows (PowerShell — SSH natif, rien à installer)',
      cmds: [
        'ssh-keygen -t ed25519',
        '# accepte les valeurs par défaut (Entrée ×3)',
        'type $env:USERPROFILE\\.ssh\\id_ed25519.pub',
        '# copie la ligne affichée et colle-la ci-dessous',
      ],
    },
    mac: {
      title: 'macOS (Terminal — SSH natif)',
      cmds: [
        'ssh-keygen -t ed25519',
        '# accepte les valeurs par défaut (Entrée ×3)',
        'cat ~/.ssh/id_ed25519.pub',
        '# copie la ligne affichée et colle-la ci-dessous',
      ],
    },
    linux: {
      title: 'Linux (SSH natif)',
      cmds: [
        'ssh-keygen -t ed25519',
        '# accepte les valeurs par défaut (Entrée ×3)',
        'cat ~/.ssh/id_ed25519.pub',
        '# copie la ligne affichée et colle-la ci-dessous',
      ],
    },
  };
  const tuto = tutos[clientOs] ?? tutos.linux;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <ThemeIcon variant="light" color="orange" size={30} radius="md">
            <IconShieldLock size={16} stroke={1.5} />
          </ThemeIcon>
          <Text fw={700}>Durcissement SSH</Text>
        </Group>
      }
      size="lg"
    >
      <Stack>
        {hardeningActive ? (
          <>
            <Alert color="teal" variant="light" icon={<IconCircleCheck size={16} stroke={1.5} />}>
              SSH est durci : mots de passe et login root SSH coupés.
              La console physique (écran/clavier) reste accessible par mot de passe.
            </Alert>
            <Button color="orange" variant="light" loading={busy} onClick={() => void revert()} style={{ alignSelf: 'flex-start' }}>
              Réactiver les mots de passe SSH
            </Button>
          </>
        ) : (
          <>
            <Alert color="blue" variant="light">
              Couper l'authentification SSH par mot de passe réduit drastiquement les attaques
              par force brute. Tu pourras toujours te connecter par clé, et la console
              physique/VPS reste accessible en cas de besoin.
            </Alert>

            <Divider label="Étape 1 — Ta clé publique" labelPosition="center" />
            {totalKeys > 0 ? (
              <Alert color="green" variant="light" icon={<IconKey size={16} stroke={1.5} />}>
                {totalKeys} clé(s) déjà enregistrée(s) :
                {' '}{(state?.users ?? []).map((u) => `${u.username} (${u.keyCount})`).join(', ')}
              </Alert>
            ) : (
              <Stack gap="xs">
                <Text size="sm" fw={500}>{tuto.title}</Text>
                <Stack gap={4}>
                  {tuto.cmds.map((c, i) => (
                    c.startsWith('#')
                      ? <Text key={i} size="xs" c="dimmed">{c}</Text>
                      : <Code key={i} block>{c}</Code>
                  ))}
                </Stack>
                {effectiveTarget && (
                  <Text size="xs" c="dimmed">
                    La clé sera ajoutée à l'utilisateur système <b>{effectiveTarget}</b>
                  </Text>
                )}
                <Textarea
                  label="Colle ta clé publique (une ligne, commence par ssh-ed25519…)"
                  placeholder="ssh-ed25519 AAAAC3Nza... ton-commentaire"
                  minRows={2}
                  value={newKey}
                  onChange={(e) => setNewKey(e.currentTarget.value)}
                />
                <Button
                  size="sm"
                  variant="light"
                  loading={busy}
                  disabled={newKey.trim().length < 50}
                  onClick={() => void addKey()}
                  style={{ alignSelf: 'flex-start' }}
                >
                  Ajouter la clé
                </Button>
              </Stack>
            )}

            <Divider label="Étape 2 — Appliquer" labelPosition="center" />
            {totalKeys === 0 ? (
              <Alert color="orange" variant="light">
                Ajoute d'abord une clé — le durcissement est bloqué sans clé
                (sinon tu perdrais l'accès SSH distant).
              </Alert>
            ) : (
              <Stack gap="xs">
                <Checkbox
                  label="J'ai testé ma connexion par clé (ou je sais ce que je fais)"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.currentTarget.checked)}
                />
                <Button
                  color="orange"
                  loading={busy}
                  disabled={!confirmed}
                  onClick={() => void harden()}
                  style={{ alignSelf: 'flex-start' }}
                >
                  Couper les mots de passe SSH
                </Button>
                <Text size="xs" c="dimmed">
                  Filet de sécurité : la console physique/VPS de ton hébergeur reste
                  accessible par mot de passe — seul le SSH distant change.
                </Text>
              </Stack>
            )}
          </>
        )}
      </Stack>
    </Modal>
  );
}
